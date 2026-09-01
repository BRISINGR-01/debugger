import * as vscode from "vscode";
import { Loc, LogEvent } from "./json-spec";

export function getRoot() {
  return (vscode.workspace.workspaceFolders ?? [])[0].uri.path;
}

export function getFile({ ctx_id }: { ctx_id: string }) {
  return ctx_id.split("@")[0];
}

export function vsRange(loc: Loc) {
  return new vscode.Range(
    loc.start.line,
    loc.start.col,
    loc.end.line,
    loc.end.col,
  );
}
