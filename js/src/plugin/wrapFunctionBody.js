import * as t from "@babel/types";
import {
  emitCall,
  getLocProp,
  markInstrumented,
  prop,
  strLiteral,
} from "./utils.js";

let _uid = 0;

/**
 * Wraps a export function body so that:
 *  - On entry: emits { type:"enter", export function: name, args: {param: value, ...} }
 *  - On normal exit: emits { type:"exit", export function: name, returnVal: value }
 *  - Each `throw` statement emits { type:"throw", error: e, loc: <throw line> }
 */
export function wrapFunctionBody(path, funcName) {
  const node = path.node;

  // Skip already-instrumented or empty bodies
  if (!node.body || node.body._instrumented) return;
  node.body._instrumented = true;

  // Arrow expressions like `x => x * 2` — convert to block first
  if (!t.isBlockStatement(node.body)) {
    node.body = t.blockStatement([t.returnStatement(node.body)]);
  }

  const enterEmit = emitCall("enter", [
    prop("function_name", strLiteral(funcName)),
    prop(
      "args",
      t.arrayExpression(
        (node.params || [])
          .map(parseParam)
          .map((v, i) =>
            t.objectExpression([
              prop("name", strLiteral(v.name)),
              prop("type", t.unaryExpression("typeof", v.value)),
              prop("value", v.value),
              getLocProp(node.params[i]),
            ]),
          ),
      ),
    ),
    getLocProp(node),
  ]);

  // Unique result variable name per export function
  const errId = t.identifier(`__err_${_uid++}__`);

  // We transform the body into:
  //   __recorder__.emit({ type:"enter", ... })
  //   let __result__
  //   try {
  //     <original body>
  //     __recorder__.emit({ type:"exit", ..., returnVal: undefined })
  //   } catch(e) {
  //     throw e    // just re-throw; the throw was already recorded at its site
  //   }

  // Replace every ReturnStatement inside this export function (not nested ones)
  // with:  __result__ = value; __recorder__.emit(exit); return __result__
  const originalBody = node.body.body;

  const exitEmit = (retId, loc) => {
    const props = [prop("returnVal", retId)];
    if (loc) props.push(loc);
    return emitCall("exit", props);
  };

  const rethrow = markInstrumented(t.throwStatement(errId));
  const catchBlock = t.catchClause(
    errId,
    t.blockStatement([emitCall("throw", [prop("error", errId)]), rethrow]),
  );

  const tryBlock = t.tryStatement(t.blockStatement(originalBody), catchBlock);
  const fnId = constructFnId(path);
  const ctxId = constructCtxId();
  node.body.body = [fnId, ctxId, enterEmit, tryBlock];

  // Now traverse the try block to replace return statements
  path.get("body").traverse({
    /** @param {NodePath} retPath */
    ReturnStatement(retPath) {
      // Don't touch returns inside nested export functions
      if (retPath.getFunctionParent() !== path || retPath.node._instrumented)
        return;

      const resultId = t.identifier(`__return_val`);
      const decl = markInstrumented(
        t.variableDeclaration("const", [
          t.variableDeclarator(
            resultId,
            retPath.node.argument || t.identifier("undefined"),
          ),
        ]),
      );

      const exit = exitEmit(
        resultId,
        retPath.node.loc ? getLocProp(retPath.node) : null,
      );
      const ret = markInstrumented(t.returnStatement(resultId));

      retPath.replaceWithMultiple([decl, exit, ret]);

      retPath.skip();
    },
  });

  // If the export function has no explicit return (void export function), add exit emit at the end
  const tryBodyStmts = tryBlock.block.body;
  const lastStmt = tryBodyStmts[tryBodyStmts.length - 1];
  const hasReturn = lastStmt && t.isReturnStatement(lastStmt);

  if (!hasReturn) tryBodyStmts.push(exitEmit(t.identifier("undefined")));
}

// Build args object: { paramName: paramValue, ... }
// We only handle simple Identifier params here; rest/destructured get a placeholder
function parseParam(p, idx) {
  if (t.isIdentifier(p)) {
    return {
      name: p.name,
      type: "identifier",
      value: t.identifier(p.name),
    };
  }

  if (t.isAssignmentPattern(p) && t.isIdentifier(p.left)) {
    return {
      name: p.left.name,
      type: "assignment",
      value: t.identifier(p.left.name),
    };
  }

  if (t.isRestElement(p) && t.isIdentifier(p.argument)) {
    return {
      name: p.argument.name,
      type: "rest",
      value: t.identifier(p.argument.name),
    };
  }

  return {
    name: `arg${idx}`,
    type: "destructured",
    value: t.memberExpression(
      t.identifier("arguments"),
      t.numericLiteral(idx),
      true,
    ),
  };
}

function constructFnId(path) {
  return markInstrumented(
    t.variableDeclaration("const", [
      t.variableDeclarator(
        t.identifier("__fn_id"),
        strLiteral(`${filepath}:${path.node.loc.start.line}`),
      ),
    ]),
  );
}

function constructCtxId() {
  return markInstrumented(
    t.variableDeclaration("const", [
      t.variableDeclarator(
        t.identifier("__ctx_id"),
        t.callExpression(
          t.memberExpression(
            t.identifier("__recorder__"),
            t.identifier("genId"),
          ),
          [],
        ),
      ),
    ]),
  );
}
