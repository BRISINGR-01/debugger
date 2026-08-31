import {
  createVar,
  emitCall,
  getLocProp,
  isModuleExport,
  markInstrumented,
  prop,
  resolveInstanceClass,
  safeInst,
  strLiteral,
} from "./utils.js";
import * as t from "@babel/types";

export default {
  // ── Variable declarations ──────────────────────────────────────────────
  // let x = expr  →  let x = expr; __recorder__.emit({type:"change", variable:"x", oldValue: undefined, newValue: x})
  VariableDeclaration: safeInst((path) => {
    // Skip our own injected declarations
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
      if (
        decl._instrumented ||
        !t.isIdentifier(decl.id) ||
        decl.init === null ||
        decl.init === undefined
      )
        continue;

      stmtsToInsert.push(
        emitCall("declare", [
          prop("variable", createVar(decl.id.name, kind, decl.id)),
          getLocProp(path.node),
        ]),
      );
    }

    if (stmtsToInsert.length > 0) {
      path.insertAfter(stmtsToInsert.reverse());
    }
  }),

  // ── Re-assignments: x = val, x += val, x++, ++x ───────────────────────
  AssignmentExpression: safeInst((path) => {
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
      const prop = t.isIdentifier(left.property) ? left.property.name : null;
      if (!prop) return;
      varName = `${obj}.${prop}`;
    }

    // We need to wrap this in a sequence: ((__old = left), (left = right), emit(...), left)
    // But we should not recurse into our own assignment

    const newAssignment = t.assignmentExpression(
      "=",
      left,
      emitCall(
        "change",
        [
          prop(
            "variable",
            createVar(varName, "kind-----", path.node.right),
            false,
          ),
          prop("oldValue", t.cloneNode(left)),
          getLocProp(path.node),
        ],
        true,
      ),
    );
    newAssignment._instrumented = true;

    path.replaceWith(newAssignment);
  }),

  // ── Update expressions: x++, ++x, x--, --x ───────────────────────────
  UpdateExpression: safeInst((path) => {
    const arg = path.node.argument;
    if (!t.isIdentifier(arg)) return;

    const varName = arg.name;
    const oldId = t.identifier(`__old_${uid++}__`);

    const stmtPath = path.getStatementParent();
    if (!stmtPath) return;

    const oldDecl = t.variableDeclaration("let", [
      t.variableDeclarator(oldId, t.cloneNode(arg)),
    ]);
    stmtPath.insertBefore(markInstrumented(oldDecl));

    path.insertAfter(
      emitCall(
        "change",
        [
          prop("variable", createVar(varName, "kind", arg)),
          prop("oldValue", oldId),
          getLocProp(path.node),
        ],
        true,
      ),
      t.cloneNode(arg),
    );
    path.skip();
  }),
  CallExpression: safeInst((path) => {
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
    } else if (t.isFunctionExpression(callee)) {
      calleeId ??= "(anonymous)";
    }

    path.replaceWith(
      emitCall("call", [
        prop("callee", strLiteral(calleeId)),
        prop("value", path.node), // original call, now nested — still evaluates & returns its real result
        getLocProp(path.node),
      ]),
    );
    // no skip(): lets ReferencedIdentifier/other visitors still process
    // the original call's callee object (e.g. `a` in `a.getVal()`) and args
  }),

  // ── Logical expressions: <expr1> || <expr2>, <expr1> && <expr2> ──────
  // Wraps each operand individually so short-circuit evaluation order is
  // preserved (only the operands actually evaluated get "seen" by emit).
  LogicalExpression: safeInst((path) => {
    const leftPath = path.get("left");
    leftPath.replaceWith(
      emitCall("expression", [
        prop("value", leftPath.node),
        getLocProp(leftPath.node),
      ]),
    );

    const rightPath = path.get("right");
    rightPath.replaceWith(
      emitCall("expression", [
        prop("value", rightPath.node),
        getLocProp(rightPath.node),
      ]),
    );
    // No path.skip(): lets traversal descend into the wrapped operands so
    // chained expressions like `a || b || c` get every level instrumented.
  }),

  // ── If / else-if / else statements ──────────────────────────────────
  // Emits:
  //   • "if"        – when each test condition is evaluated (value = boolean result)
  //   • "if_branch" – when a branch body is entered (branch = "then"|"else_if"|"else")
  IfStatement: safeInst((path) => {
    // Wrap the test expression to emit the condition value
    const testPath = path.get("test");
    testPath.replaceWith(
      emitCall("if", [getLocProp(testPath.node), prop("value", testPath.node)]),
    );

    // Insert if_branch emit at the start of the consequent (then) body
    insertBranchEmit(path.get("consequent"), "then", 0, path.node);

    // Walk the else-if / else chain
    let branchIndex = 1;
    let altPath = path.get("alternate");
    while (altPath && altPath.node) {
      if (t.isIfStatement(altPath.node)) {
        insertBranchEmit(
          altPath.get("consequent"),
          "else_if",
          branchIndex,
          altPath.node,
        );
        branchIndex++;
        altPath = altPath.get("alternate");
      } else {
        insertBranchEmit(altPath, "else", branchIndex, altPath.node);
        break;
      }
    }
  }),
  BinaryExpression: safeInst((path) => {
    path.replaceWith(
      emitCall("expr", [
        prop("value", path.node, false),
        getLocProp(path.node),
      ]),
    );
    // No skip(): lets traversal descend into the now-nested original node,
    // so `a * 3` inside `2 * (a * 3)` also gets wrapped.
  }),
  ReferencedIdentifier: safeInst((path) => {
    const varName = path.node.name;

    // skip the function name itself in `fn(...)` / `new Fn(...)` — the
    // callee is already reported by the "call" event
    const parent = path.parent;
    if (
      (t.isCallExpression(parent) || t.isNewExpression(parent)) &&
      parent.callee === path.node
    )
      return;

    // only track real bindings (skip globals like Math, console, etc.)
    const bind = path.scope.getBinding(varName);
    if (!bind || bind.kind === "module" || !bind.hasValue) return;

    path.replaceWith(
      emitCall(
        "expr",
        [prop("val", t.cloneNode(path.node)), getLocProp(path.node)],
        true,
      ),
    );
    path.skip(); // the cloned identifier inside is a leaf — don't re-descend
  }),
};

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

function insertBranchEmit(bodyPath, branch, index, locNode) {
  const emit = emitCall("if_branch", [
    prop("branch", strLiteral(branch)),
    prop("branchIndex", t.numericLiteral(index)),
    getLocProp(locNode),
  ]);

  if (t.isBlockStatement(bodyPath.node)) {
    bodyPath.unshiftContainer("body", emit);
  } else {
    bodyPath.insertBefore(emit);
  }
}
