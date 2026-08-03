/**
 * Babel plugin that instruments JS/TS code with Recorder events:
 *   - Function enter/exit (including arrow functions, methods, getters)
 *   - Variable assignments (let/var declarations and re-assignments)
 *   - Throw statements
 *
 * The plugin injects calls to a global `__recorder__` object. You provide
 * that object at runtime (see recorder-runtime.js).
 */

import { NodePath } from "@babel/traverse";
import * as t from "@babel/types";

// Unique id per transformed file to avoid name clashes
let _uid = 0;

/**
 * Build: __recorder__.emit({ type, ...fields })
 */
function emitCall(fields) {
  return t.expressionStatement(
    t.callExpression(
      t.memberExpression(t.identifier("__recorder__"), t.identifier("emit")),
      [t.objectExpression(fields)],
    ),
  );
}

function createVar(name, type, val) {
  return t.objectExpression([
    prop("name", strLiteral(name)),
    prop("type", strLiteral(type)),
    prop("value", t.cloneNode(val)),
  ]);
}

function strLiteral(s) {
  return t.stringLiteral(s);
}

function prop(key, value) {
  return t.objectProperty(t.identifier(key), value);
}

/**
 * Wraps a function body so that:
 *  - On entry: emits { type:"enter", function: name, args: {param: value, ...} }
 *  - On normal exit: emits { type:"exit", function: name, returnVal: value }
 *  - On throw: emits { type:"throw", error: e } then re-throws
 */
function wrapFunctionBody(path, funcName) {
  const node = path.node;

  // Skip already-instrumented or empty bodies
  if (!node.body || node.body._instrumented) return;
  // Arrow expressions like `x => x * 2` — convert to block first
  if (!t.isBlockStatement(node.body)) {
    node.body = t.blockStatement([t.returnStatement(node.body)]);
  }

  node.body._instrumented = true;

  const params = node.params || [];

  // Build args object: { paramName: paramValue, ... }
  // We only handle simple Identifier params here; rest/destructured get a placeholder
  const argsProps = params.map((p) => {
    if (t.isIdentifier(p)) {
      return t.objectProperty(t.identifier(p.name), t.identifier(p.name));
    }
    if (t.isAssignmentPattern(p) && t.isIdentifier(p.left)) {
      return t.objectProperty(
        t.identifier(p.left.name),
        t.identifier(p.left.name),
      );
    }
    if (t.isRestElement(p) && t.isIdentifier(p.argument)) {
      return t.objectProperty(
        t.identifier(p.argument.name),
        t.identifier(p.argument.name),
      );
    }
    // Destructured param — use arguments object index
    const idx = params.indexOf(p);
    return t.objectProperty(
      t.stringLiteral(`arg${idx}`),
      t.memberExpression(
        t.identifier("arguments"),
        t.numericLiteral(idx),
        true,
      ),
    );
  });

  const enterEmit = emitCall([
    prop("type", strLiteral("enter")),
    prop("function", strLiteral(funcName)),
    prop("args", t.objectExpression(argsProps)),
  ]);

  // Unique result variable name per function
  const resultId = t.identifier(`__result_${_uid++}__`);
  const errId = t.identifier(`__err_${_uid++}__`);

  // We transform the body into:
  //   __recorder__.emit({ type:"enter", ... })
  //   let __result__
  //   try {
  //     <original body with return replaced>
  //     __recorder__.emit({ type:"exit", ..., returnVal: undefined })
  //   } catch(e) {
  //     __recorder__.emit({ type:"throw", error: e })
  //     throw e
  //   }

  // Replace every ReturnStatement inside this function (not nested ones)
  // with:  __result__ = value; __recorder__.emit(exit); return __result__
  const originalBody = node.body.body;

  function replaceReturns(stmts, fnPath) {
    // We do this by traversal after insertion; handled below via path.traverse
  }

  const exitEmit = (retVal) =>
    emitCall([
      prop("type", strLiteral("exit")),
      prop("function", strLiteral(funcName)),
      prop("returnVal", retVal),
    ]);

  const catchBlock = t.catchClause(
    errId,
    t.blockStatement([
      emitCall([prop("type", strLiteral("throw")), prop("error", errId)]),
      t.throwStatement(errId),
    ]),
  );

  const tryBlock = t.tryStatement(t.blockStatement(originalBody), catchBlock);

  node.body.body = [enterEmit, tryBlock];

  // Now traverse the try block to replace return statements
  path.get("body").traverse({
    /** @param {NodePath} retPath */
    ReturnStatement(retPath) {
      // Don't touch returns inside nested functions
      if (retPath.getFunctionParent() !== path || retPath.node._instrumented)
        return;

      const retVal = retPath.node.argument || t.identifier("undefined");
      const retSt = t.returnStatement(resultId);
      retSt._instrumented = true;

      retPath.replaceWithMultiple([exitEmit(retVal), retPath.node]);
      retPath.skip();
    },
  });

  // If the function has no explicit return (void function), add exit emit at the end
  const tryBodyStmts = tryBlock.block.body;
  const lastStmt = tryBodyStmts[tryBodyStmts.length - 1];
  const hasReturn = lastStmt && t.isReturnStatement(lastStmt);

  if (!hasReturn) tryBodyStmts.push(exitEmit(t.identifier("undefined")));
}

/**
 * Get a human-readable name for a function node from its path context.
 */
function getFuncName(path) {
  const node = path.node;

  if (node.id && node.id.name) return node.id.name;

  const parent = path.parent;

  if (t.isVariableDeclarator(parent) && t.isIdentifier(parent.id)) {
    return parent.id.name;
  }

  if (t.isObjectProperty(parent) && t.isIdentifier(parent.key)) {
    return parent.key.name;
  }

  if (t.isClassMethod(path.node)) {
    if (t.isIdentifier(node.key)) return node.key.name;
  }

  if (t.isAssignmentExpression(parent) && t.isMemberExpression(parent.left)) {
    const left = parent.left;
    const obj = t.isThisExpression(left.object)
      ? "this"
      : t.isIdentifier(left.object)
        ? left.object.name
        : "?";
    const prop = t.isIdentifier(left.property) ? left.property.name : "?";
    return `${obj}.${prop}`;
  }

  return "(anonymous)";
}

function isModuleExport(node, t) {
  if (!t.isMemberExpression(node)) return false;

  // module.exports
  if (
    t.isIdentifier(node.object, { name: "module" }) &&
    t.isIdentifier(node.property, { name: "exports" })
  ) {
    return true;
  }

  // exports.foo
  if (t.isIdentifier(node.object, { name: "exports" })) {
    return true;
  }

  // module.exports.foo
  if (
    t.isMemberExpression(node.object) &&
    t.isIdentifier(node.object.object, { name: "module" }) &&
    t.isIdentifier(node.object.property, { name: "exports" })
  ) {
    return true;
  }

  return false;
}

export default function recorderPlugin({ types }) {
  return {
    visitor: {
      Program(path, state) {
        const moduleName = "__debugger_recorder";
        const moduleType = state.opts.moduleType;

        // Avoid duplicate injection
        if (
          path.node.body.some(
            (node) =>
              t.isImportDeclaration(node) && node.source.value === moduleName,
          )
        )
          return;

        if (moduleType === "module") {
          // ESM
          path.unshiftContainer(
            "body",
            t.importDeclaration([], t.stringLiteral(moduleName)),
          );
        } else {
          // CommonJS
          path.unshiftContainer(
            "body",
            t.expressionStatement(
              t.callExpression(t.identifier("require"), [
                t.stringLiteral(moduleName),
              ]),
            ),
          );
        }
      },

      // ── Functions ──────────────────────────────────────────────────────────
      FunctionDeclaration(path) {
        wrapFunctionBody(path, getFuncName(path));
      },
      FunctionExpression(path) {
        wrapFunctionBody(path, getFuncName(path));
      },
      ArrowFunctionExpression(path) {
        wrapFunctionBody(path, getFuncName(path));
      },

      ClassMethod(path) {
        const kind = path.node.kind; // constructor | method | get | set
        const className =
          path.parentPath?.parentPath?.node?.id?.name || "Class";
        const methodName = t.isIdentifier(path.node.key)
          ? path.node.key.name
          : "?";
        const label =
          kind === "constructor"
            ? `new ${className}`
            : `${className}.${methodName}`;
        wrapFunctionBody(path, label);
      },

      ObjectMethod(path) {
        const name = t.isIdentifier(path.node.key)
          ? path.node.key.name
          : "(computed)";
        wrapFunctionBody(path, name);
      },

      // ── Variable declarations ──────────────────────────────────────────────
      // let x = expr  →  let x = expr; __recorder__.emit({type:"assign", variable:"x", oldValue: undefined, newValue: x})
      VariableDeclaration(path) {
        // Skip our own injected declarations
        if (path.node._instrumented) return;
        if (path.parent._instrumented) return;

        // Skip declarations inside for (let x = ...; ...; ...) loops — insertAfter
        // fails because the parent (ForStatement) is not an array container.
        if (
          t.isForStatement(path.parent) ||
          t.isForInStatement(path.parent) ||
          t.isForOfStatement(path.parent)
        )
          return;

        const { kind, declarations } = path.node;
        const stmtsToInsert = [];

        for (const decl of declarations) {
          if (!t.isIdentifier(decl.id)) continue; // skip destructuring for now
          if (decl.init === null || decl.init === undefined) continue;

          stmtsToInsert.push(
            emitCall([
              prop("type", strLiteral("declare")),
              prop(
                "variable",
                createVar(decl.id.name, kind, t.cloneNode(decl.id)),
              ),
              // prop("fn_id", path.parent),
            ]),
          );
        }

        if (stmtsToInsert.length > 0) {
          path.insertAfter(stmtsToInsert.reverse());
        }
      },

      // ── Re-assignments: x = val, x += val, x++, ++x ───────────────────────
      AssignmentExpression(path) {
        if (path.node._instrumented) return;

        const left = path.node.left;
        if (
          !(t.isIdentifier(left) || t.isMemberExpression(left)) ||
          isModuleExport(left, t)
        )
          return;

        // Only track identifiers and simple member expressions (this.x, obj.prop)
        let varName;
        if (t.isIdentifier(left)) {
          varName = left.name;
        } else if (t.isMemberExpression(left)) {
          const obj = t.isThisExpression(left.object)
            ? "this"
            : t.isIdentifier(left.object)
              ? left.object.name
              : null;
          if (!obj) return;
          const prop = t.isIdentifier(left.property)
            ? left.property.name
            : null;
          if (!prop) return;
          varName = `${obj}.${prop}`;
        }

        // Capture old value before assignment
        const oldId = t.identifier(`__old_${_uid++}__`);

        // We need to wrap this in a sequence: ((__old = left), (left = right), emit(...), left)
        // But we should not recurse into our own assignment
        path.node._instrumented = true;

        const oldCapture = t.assignmentExpression(
          "=",
          oldId,
          t.cloneNode(left),
        );

        // Insert `let __old__` before the statement containing this expression
        const stmtPath = path.getStatementParent();
        if (!stmtPath) return;

        const oldDecl = t.variableDeclaration("let", [
          t.variableDeclarator(oldId, t.identifier("undefined")),
        ]);
        oldDecl._instrumented = true;
        stmtPath.insertBefore(oldDecl);

        // Replace the AssignmentExpression with a sequence:
        // (__old = left, original_assignment, __recorder__.emit(...), left)
        const emitExpr = t.callExpression(
          t.memberExpression(
            t.identifier("__recorder__"),
            t.identifier("emit"),
          ),
          [
            t.objectExpression([
              prop("type", strLiteral("change")),
              prop("variable", createVar(varName, "kind", t.cloneNode(left))),
              prop("oldValue", oldId),
            ]),
          ],
        );

        path.replaceWith(
          t.sequenceExpression([
            oldCapture,
            path.node,
            emitExpr,
            t.cloneNode(left),
          ]),
        );
        path.skip();
      },

      // ── Update expressions: x++, ++x, x--, --x ───────────────────────────
      UpdateExpression(path) {
        if (path.node._instrumented) return;
        const arg = path.node.argument;
        if (!t.isIdentifier(arg)) return;

        const varName = arg.name;
        const oldId = t.identifier(`__old_${_uid++}__`);

        path.node._instrumented = true;

        const stmtPath = path.getStatementParent();
        if (!stmtPath) return;

        const oldDecl = t.variableDeclaration("let", [
          t.variableDeclarator(oldId, t.cloneNode(arg)),
        ]);
        oldDecl._instrumented = true;
        stmtPath.insertBefore(oldDecl);

        const emitExpr = t.callExpression(
          t.memberExpression(
            t.identifier("__recorder__"),
            t.identifier("emit"),
          ),
          [
            t.objectExpression([
              prop("type", strLiteral("assign")),
              prop("variable", createVar(varName, "kind", t.cloneNode(arg))),
              prop("oldValue", oldId),
            ]),
          ],
        );

        path.replaceWith(
          t.sequenceExpression([path.node, emitExpr, t.cloneNode(arg)]),
        );
        path.skip();
      },
    },
  };
}
