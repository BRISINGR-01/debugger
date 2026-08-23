import * as vscode from "vscode";

export function getRoot() {
  return (vscode.workspace.workspaceFolders ?? [])[0].uri.path;
}
