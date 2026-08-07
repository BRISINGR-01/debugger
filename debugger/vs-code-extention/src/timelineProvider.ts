import * as vscode from 'vscode';
import * as path from 'path';
import { TraceModel } from './model';
import { formatEventInline, formatLoc } from './format';

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
    return this.model.events.map((_, i) => i);
  }

  getTreeItem(index: number): vscode.TreeItem {
    const ev = this.model.events[index];
    const loc = this.model.locations[index];
    const summary = formatEventInline(ev) ?? ev.event;
    const label = `${typeof ev.time === 'number' ? ev.time.toFixed(3) : index}  ${summary}`;

    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
    item.description = loc ? `${path.basename(loc.file)}:${loc.line + 1}` : undefined;
    item.tooltip = loc ? formatLoc(loc) : undefined;
    item.iconPath = this.iconFor(ev.event);
    item.command = {
      command: 'traceViewer.jumpToEvent',
      title: 'Jump to event',
      arguments: [index]
    };
    if (index === this.model.currentIndex) {
      item.description = `${item.description ?? ''}  (current)`.trim();
    }
    return item;
  }

  private iconFor(eventName: string): vscode.ThemeIcon {
    switch (eventName) {
      case 'declare':
        return new vscode.ThemeIcon('symbol-variable');
      case 'call':
        return new vscode.ThemeIcon('arrow-right');
      case 'enter':
        return new vscode.ThemeIcon('debug-step-into');
      case 'return':
        return new vscode.ThemeIcon('debug-step-out');
      case 'throw':
        return new vscode.ThemeIcon('warning');
      default:
        return new vscode.ThemeIcon('circle-outline');
    }
  }
}
