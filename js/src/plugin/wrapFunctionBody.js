import * as t from "@babel/types";
import { emitCall, getLocProp, prop, strLiteral } from "./utils.js";
let _uid = 0;

/**
 * Wraps a export function body so that:
 *  - On entry: emits { type:"enter", export function: name, args: {param: value, ...} }
 *  - On normal exit: emits { type:"exit", export function: name, returnVal: value }
 *  - On throw: emits { type:"throw", error: e } then re-throws
 */
export function wrapFunctionBody(path, funcName, filepath) {
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
  const argsVars = params.map((p, idx) => {
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
  });

  const enterEmit = emitCall([
    prop("event", strLiteral("enter")),
    prop("function_name", strLiteral(funcName)),
    prop(
      "args",
      t.arrayExpression(
        argsVars.map((v) =>
          t.objectExpression([
            prop("name", strLiteral(v.name)),
            prop("type", t.unaryExpression("typeof", v.value)),
            prop("value", v.value),
          ]),
        ),
      ),
    ),
    getLocProp(node, filepath),
  ]);

  // Unique result variable name per export function
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

  // Replace every ReturnStatement inside this export function (not nested ones)
  // with:  __result__ = value; __recorder__.emit(exit); return __result__
  const originalBody = node.body.body;

  function replaceReturns(stmts, fnPath) {
    // We do this by traversal after insertion; handled below via path.traverse
  }

  const exitEmit = (retVal, loc) => {
    const props = [
      prop("event", strLiteral("exit")),
      prop("returnVal", retVal),
    ];
    if (loc) props.push(loc);
    return emitCall(props);
  };

  const catchBlock = t.catchClause(
    errId,
    t.blockStatement([
      emitCall([prop("event", strLiteral("throw")), prop("error", errId)]),
      t.throwStatement(errId),
    ]),
  );

  const tryBlock = t.tryStatement(t.blockStatement(originalBody), catchBlock);

  const fnId = t.variableDeclaration("const", [
    t.variableDeclarator(
      t.identifier("__fn_id"),
      t.callExpression(
        t.memberExpression(t.identifier("__recorder__"), t.identifier("genId")),
        [],
      ),
    ),
  ]);
  fnId._instrumented = true;
  node.body.body = [fnId, enterEmit, tryBlock];

  // Now traverse the try block to replace return statements
  path.get("body").traverse({
    /** @param {NodePath} retPath */
    ReturnStatement(retPath) {
      // Don't touch returns inside nested export functions
      if (retPath.getFunctionParent() !== path || retPath.node._instrumented)
        return;

      const retVal = retPath.node.argument || t.identifier("undefined");

      const resultId = t.identifier("__return_val");

      const decl = t.variableDeclaration("const", [
        t.variableDeclarator(resultId, retVal),
      ]);
      decl._instrumented = true;

      const exit = exitEmit(
        resultId,
        retPath.node.loc ? getLocProp(retPath.node, filepath) : null,
      );

      const ret = t.returnStatement(resultId);
      ret._instrumented = true;

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
