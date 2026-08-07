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
import expressions from "./expressions.js";

// Unique id per transformed file to avoid name clashes

export default function recorderPlugin({ types }) {
  return {
    visitor: {
      Program(path, state) {
        this.uid = 0
        this.filepath = state.filename;
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
        wrapFunctionBody(path, getFuncName(path), this.filepath);
      },
      FunctionExpression(path) {
        wrapFunctionBody(path, getFuncName(path), this.filepath);
      },
      ArrowFunctionExpression(path) {
        wrapFunctionBody(path, getFuncName(path), this.filepath);
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
        wrapFunctionBody(path, label, this.filepath);
      },
      ObjectMethod(path) {
        const name = t.isIdentifier(path.node.key)
          ? path.node.key.name
          : "(computed)";
        wrapFunctionBody(path, name, this.filepath);
      },

      SwitchCase(path) {
        const { consequent } = path.node;

        if (consequent.length !== 1 || !t.isBlockStatement(consequent[0])) {
          path.node.consequent = [t.blockStatement(consequent)];
        }
      },
      ...expressions,
    },
  };
}
