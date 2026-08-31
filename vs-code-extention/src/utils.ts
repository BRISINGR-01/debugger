import * as vscode from "vscode";
import { LogEvent } from "./json-spec";

export function getRoot() {
  return (vscode.workspace.workspaceFolders ?? [])[0].uri.path;
}

export function getFile({ ctx_id }: { ctx_id: string }) {
  return ctx_id.split("@")[0];
}

export function vsRange(ev: LogEvent) {
  return new vscode.Range(
    ev.loc.start.line,
    ev.loc.start.col,
    ev.loc.end.line,
    ev.loc.end.col,
  );
}
