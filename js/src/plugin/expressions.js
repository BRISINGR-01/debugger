import {
  createVar,
  emitCall,
  getLocProp,
  isModuleExport,
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
          prop("event", strLiteral("declare")),
          prop("variable", createVar(decl.id.name, kind, decl.id)),
          getLocProp(path.node, filepath),
        ]),
      );
    }

    if (stmtsToInsert.length > 0) {
      path.insertAfter(stmtsToInsert.reverse());
    }
  }),

  // ── Re-assignments: x = val, x += val, x++, ++x ───────────────────────
  AssignmentExpression: safeInst((path) => {
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
      const prop = t.isIdentifier(left.property) ? left.property.name : null;
      if (!prop) return;
      varName = `${obj}.${prop}`;
    }

    if (varName.startsWith("__old")) return;

    // We need to wrap this in a sequence: ((__old = left), (left = right), emit(...), left)
    // But we should not recurse into our own assignment
    path.node._instrumented = true;

    const newAssignment = t.assignmentExpression(
      "=",
      left,
      emitCall(
        [
          prop("event", strLiteral("change")),
          prop(
            "variable",
            t.objectExpression([
              t.objectProperty(t.identifier("name"), strLiteral(varName)),
              t.objectProperty(t.identifier("type"), strLiteral("kind")),
              t.objectProperty(t.identifier("value"), path.node.right),
            ]),
          ),
          prop("oldValue", t.cloneNode(left)),
          getLocProp(path.node, filepath),
        ],
        true,
      ),
    );

    newAssignment._instrumented = true;
    path.replaceWith(newAssignment);
  }),

  // ── Update expressions: x++, ++x, x--, --x ───────────────────────────
  UpdateExpression: safeInst((path) => {
    if (path.node._instrumented) return;
    const arg = path.node.argument;
    if (!t.isIdentifier(arg)) return;

    const varName = arg.name;
    const oldId = t.identifier(`__old_${uid++}__`);

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
            prop("event", strLiteral("change")),
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
  }),
  CallExpression: safeInst((path) => {
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
    } else if (t.isFunctionExpression(callee)) {
      calleeId ??= "(anonymous)";
    }

    const fnCall = emitCall([
      prop("event", strLiteral("call")),
      prop("callee", strLiteral(calleeId)),
      getLocProp(path.node, filepath),
    ]);

    fnCall._instrumented = true;

    path.insertBefore(fnCall);
  }),

  // ── Logical expressions: <expr1> || <expr2>, <expr1> && <expr2> ──────
  // Wraps each operand individually so short-circuit evaluation order is
  // preserved (only the operands actually evaluated get "seen" by emit).
  LogicalExpression: safeInst((path) => {
    if (path.node._instrumented) return;
    path.node._instrumented = true;

    const leftPath = path.get("left");
    leftPath.replaceWith(
      emitCall([
        prop("event", strLiteral("expression")),
        prop("value", leftPath.node),
        getLocProp(leftPath.node, filepath),
      ]),
    );

    const rightPath = path.get("right");
    rightPath.replaceWith(
      emitCall([
        prop("event", strLiteral("expr")),
        prop("value", rightPath.node),
        getLocProp(rightPath.node, filepath),
      ]),
    );
    // No path.skip(): lets traversal descend into the wrapped operands so
    // chained expressions like `a || b || c` get every level instrumented.
  }),

  // ── If statements: if (<test>) ───────────────────────────────────────
  // Wraps the whole test expression in an outer emit, on top of whatever
  // LogicalExpression already did to its operands.
  IfStatement: safeInst((path) => {
    if (path.node._instrumented) return;
    path.node._instrumented = true;

    const testPath = path.get("test");
    testPath.replaceWith(
      emitCall([
        prop("event", strLiteral("if")),
        getLocProp(testPath.node, filepath),
        prop("value", testPath.node),
      ]),
    );
    // No path.skip(): lets the LogicalExpression visitor still process the
    // original test expression now nested as the emit's value argument.
  }),
  BinaryExpression: safeInst((path) => {
    if (path.node._instrumented) return;
    path.node._instrumented = true;

    path.replaceWith(
      emitCall([
        prop("event", strLiteral("expr")),
        prop("value", path.node),
        getLocProp(path.node, filepath),
      ]),
    );
    // No skip(): lets traversal descend into the now-nested original node,
    // so `a * 3` inside `2 * (a * 3)` also gets wrapped.
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
