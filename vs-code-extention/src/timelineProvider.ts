import * as vscode from "vscode";
import * as path from "path";
import { TraceModel } from "./model";
import { formatEventInline, formatLoc } from "./format";
import { getFile } from "./utils";

export class TimelineProvider implements vscode.TreeDataProvider<number> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private model: TraceModel) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getChildren(element?: number): number[] {
    if (element !== undefined) {
      return [];
    }
    return this.model.events.events.map((_, i: number) => i);
  }

  getTreeItem(index: number): vscode.TreeItem {
    const ev = this.model.events.get(index);
    const summary = formatEventInline(ev) ?? ev.event;
    const label = `${ev.time.toFixed(3)}  ${summary}`;

    const item = new vscode.TreeItem(
      label,
      vscode.TreeItemCollapsibleState.None,
    );
    item.description = `${path.basename(getFile(ev))}:${ev.loc.start.line + 1}`;
    // item.tooltip = loc ? formatLoc(loc) : undefined;
    item.iconPath = this.iconFor(ev.event);
    item.command = {
      command: "traceViewer.jumpToEvent",
      title: "Jump to event",
      arguments: [index],
    };
    if (index === this.model.currentIndex) {
      item.description = `${item.description ?? ""}  (current)`.trim();
    }
    return item;
  }

  private iconFor(eventName: string): vscode.ThemeIcon {
    switch (eventName) {
      case "declare":
        return new vscode.ThemeIcon("symbol-variable");
      case "call":
        return new vscode.ThemeIcon("arrow-right");
      case "enter":
        return new vscode.ThemeIcon("debug-step-into");
      case "return":
        return new vscode.ThemeIcon("debug-step-out");
      case "throw":
        return new vscode.ThemeIcon("warning");
      case "if":
        return new vscode.ThemeIcon("branch");
      case "if_branch":
        return new vscode.ThemeIcon("git-branch");
      default:
        return new vscode.ThemeIcon("circle-outline");
    }
  }
}
