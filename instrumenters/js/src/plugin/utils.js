import * as t from "@babel/types";

/** Build: __recorder__.emit({ type, ...fields }) */
export function emitCall(event, fields, isExpr = false) {
  const expr = t.callExpression(
    markInstrumented(
      t.memberExpression(t.identifier("__recorder__"), t.identifier("emit")),
    ),
    [
      t.objectExpression(
        fields.concat(
          prop("fn_id", t.identifier("__fn_id")),
          prop("ctx_id", t.identifier("__ctx_id")),
          prop("event", strLiteral(event)),
        ),
      ),
    ],
  );
  expr._instrumented = true;

  if (isExpr) return expr;

  const st = t.expressionStatement(expr);
  st._instrumented = true;

  return st;
}

export function createVar(name, type, val) {
  const expr = t.objectExpression([
    prop("name", strLiteral(name)),
    prop("type", strLiteral(type)),
    prop("value", t.cloneNode(val), false),
  ]);

  expr._instrumented = true;
  return expr;
}

export const strLiteral = t.stringLiteral;
export function prop(key, value, shouldMark = true) {
  const res = t.objectProperty(t.identifier(key), value);
  return shouldMark ? markInstrumented(res) : res;
}

export function getLocProp(node) {
  return prop(
    "loc",
    t.objectExpression([
      prop(
        "start",
        strLiteral(
          `${filepath}:${node.loc.start.line}:${node.loc.start.column}`,
        ),
      ),
      prop(
        "end",
        strLiteral(`${filepath}:${node.loc.end.line}:${node.loc.end.column}`),
      ),
    ]),
  );
}

/**
 * Get a human-readable name for a export function node from its path context.
 */
export function getFuncName(path) {
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

  if (t.isMemberExpression(path.parent.callee)) {
    if (path.parent.callee.object.name) {
      const binding = path.scope.getBinding(path.parent.callee.object.name);

      if (binding) {
        const className = resolveInstanceClass(binding);

        if (className) {
          return `${className}.${path.parent.callee.property.name}`;
        }
      }
    } else {
      return `${path.parent.callee.object.type}.${path.parent.callee.property.name}`;
    }
  }

  return "(anonymous)";
}

export function isModuleExport(node, t) {
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

export function resolveInstanceClass(binding) {
  for (const ref of binding.constantViolations) {
    // Handles reassignment, ignore for now
  }

  const declaration = binding.path;

  if (
    declaration.isVariableDeclarator() &&
    t.isNewExpression(declaration.node.init) &&
    t.isIdentifier(declaration.node.init.callee)
  ) {
    return declaration.node.init.callee.name;
  }

  return null;
}

export const safeInst = (cb) => (path) => {
  if (path.node._instrumented) return;
  path.node._instrumented = true;

  try {
    cb(path);
  } catch (err) {
    if (isDev()) throw err;

    path.insertBefore(
      markInstrumented(
        emitCall("inst_error", [
          prop("message", strLiteral(err.message)),
          getLocProp(path.node),
        ]),
      ),
    );
  }
};

export function isDev() {
  return process.env.DEV;
}

export function markInstrumented(node) {
  if (node._instrumented === 1) {
    node._instrumented = true;
    return;
  }

  node._instrumented = true;
  t.traverseFast(node, (n) => {
    n._instrumented ??= true;
  });
  // traverseFast doesn't visit the root itself in some versions — cover it explicitly
  return node;
}
