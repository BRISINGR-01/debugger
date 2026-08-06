/**
 * Babel plugin that instruments JS/TS code with Recorder events:
 *   - Function enter/exit (including arrow functions, methods, getters)
 *   - Variable assignments (let/var declarations and re-assignments)
 *   - Throw statements
 *
 * The plugin injects calls to a global `__recorder__` object. You provide
 * that object at runtime (see recorder-runtime.js).
 */

import * as t from "@babel/types";
import {
  createVar,
  emitCall,
  getFuncName,
  getLocProp,
  isModuleExport,
  prop,
  resolveInstanceClass,
  strLiteral,
} from "./utils.js";
import { wrapFunctionBody } from "./wrapFunctionBody.js";

// Unique id per transformed file to avoid name clashes
let _uid = 0,
  filepath;

export default function recorderPlugin({ types }) {
  return {
    visitor: {
      Program(path, state) {
        filepath = state.filename;
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

        const fnId = t.variableDeclaration("const", [
          t.variableDeclarator(t.identifier("__fn_id"), strLiteral("0")),
        ]);
        fnId._instrumented = true;
        path.unshiftContainer("body", fnId);

        // insert import to recorder.js
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
        wrapFunctionBody(path, getFuncName(path), filepath);
      },
      FunctionExpression(path) {
        wrapFunctionBody(path, getFuncName(path), filepath);
      },
      ArrowFunctionExpression(path) {
        wrapFunctionBody(path, getFuncName(path), filepath);
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
        wrapFunctionBody(path, label, filepath);
      },

      ObjectMethod(path) {
        const name = t.isIdentifier(path.node.key)
          ? path.node.key.name
          : "(computed)";
        wrapFunctionBody(path, name, filepath);
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
          const fnPath = path.findParent((p) => p.isFunction());

          stmtsToInsert.push(
            emitCall([
              prop("event", strLiteral("declare")),
              prop("variable", createVar(decl.id.name, kind, decl.id)),
              getLocProp(path.node, filepath),
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

        path.replaceWith(
          t.sequenceExpression([
            oldCapture,
            path.node,
            emitCall(
              [
                prop("event", strLiteral("change")),
                prop("variable", createVar(varName, "kind", t.cloneNode(left))),
                prop("oldValue", oldId),
                getLocProp(path.node, filepath),
              ],
              true,
            ),
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

        path.replaceWith(
          t.sequenceExpression([
            path.node,
            emitCall(
              [
                prop("event", strLiteral("assign")),
                prop("variable", createVar(varName, "kind", t.cloneNode(arg))),
                prop("oldValue", oldId),
                getLocProp(path.node, filepath),
              ],
              true,
            ),
            t.cloneNode(arg),
          ]),
        );
        path.skip();
      },
      CallExpression(path) {
        if (path.node._instrumented) return;
        path.node._instrumented = true;

        const callee = path.node.callee;
        let calleeId = callee.name;
        if (t.isMemberExpression(callee)) {
          if (t.isIdentifier(callee.object, { name: "__recorder__" })) return;

          const objectName = stringifyMemberChain(callee.object);

          // Only try scope binding resolution for simple identifiers —
          // a binding lookup doesn't make sense for "this.input.buffer"
          if (t.isIdentifier(callee.object)) {
            const binding = path.scope.getBinding(callee.object.name);
            if (binding) {
              const className = resolveInstanceClass(binding);
              calleeId = `${className ?? objectName}.${callee.property.name}`;
            } else {
              calleeId = `${objectName}.${callee.property.name}`;
            }
          } else {
            calleeId = `${objectName}.${callee.property.name}`;
          }
        } else if (t.isSuper(callee)) {
          calleeId = "super";
        } else if (t.isArrowFunctionExpression(callee)) {
          return;
        }

        const fnCall = emitCall([
          prop("event", strLiteral("call")),
          prop("callee", strLiteral(calleeId)),
          getLocProp(path.node, filepath),
        ]);

        fnCall._instrumented = true;

        path.insertBefore(fnCall);
      },
      SwitchCase(path) {
        const { consequent } = path.node;

        if (consequent.length !== 1 || !t.isBlockStatement(consequent[0])) {
          path.node.consequent = [t.blockStatement(consequent)];
        }
      },
    },
  };
}

function stringifyMemberChain(node) {
  if (t.isIdentifier(node)) return node.name;
  if (t.isThisExpression(node)) return "this";
  if (t.isSuper(node)) return "super";
  if (t.isCallExpression(node)) return `${stringifyMemberChain(node.callee)}()`;

  if (t.isMemberExpression(node)) {
    const objectStr = stringifyMemberChain(node.object);
    const propStr = node.computed
      ? `[${t.isStringLiteral(node.property) ? node.property.value : stringifyMemberChain(node.property)}]`
      : node.property.name;
    return node.computed ? `${objectStr}${propStr}` : `${objectStr}.${propStr}`;
  }

  // fallback for anything else (new expressions, parenthesized, etc.)
  return node.type;
}
