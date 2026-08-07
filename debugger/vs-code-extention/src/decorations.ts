import * as vscode from "vscode";
import { TraceModel } from "./model";
import { TraceEvent, ParsedLocation } from "./types";
import { annotationPosition, formatEventValue, formatEventMarkdown } from "./format";

export class DecorationManager {
  private decorationType: vscode.TextEditorDecorationType;
  private enabled = true;

  constructor(private model: TraceModel) {
    this.decorationType = this.createDecorationType();
  }

  private createDecorationType(): vscode.TextEditorDecorationType {
    const config = vscode.workspace.getConfiguration("traceViewer");
    const customColor = config.get<string>("decorationColor", "");
    return vscode.window.createTextEditorDecorationType({
      isWholeLine: false,
      after: {
        margin: "0 0 0 0.25rem",
        color: customColor
          ? customColor
          : new vscode.ThemeColor("editorCodeLens.foreground"),
      },
    });
  }

  toggle(): void {
    this.enabled = !this.enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  refresh(editor: vscode.TextEditor | undefined): void {
    if (!editor) return;

    if (!this.enabled || !this.model.loaded) {
      editor.setDecorations(this.decorationType, []);
      return;
    }

    const filePath = editor.document.uri.fsPath;
    const indices = this.model.getFileEventIndices(filePath);
    if (indices.length === 0) {
      editor.setDecorations(this.decorationType, []);
      return;
    }

    const document = editor.document;
    const current = this.model.currentIndex;
    // annotation position ("line:col") -> best event index to annotate there
    const best = new Map<string, number>();

    for (const idx of indices) {
      if (idx > current) break;

      const ev = this.model.events[idx];
      const loc = this.model.locations[idx];
      if (!loc) continue;
      if (!formatEventValue(ev)) continue;

      const pos = this.annotationPosition(document, ev, loc);
      if (!pos) continue;
      if (pos.line < 0 || pos.line >= document.lineCount) continue;

      const key = `${pos.line}:${pos.character}`;
      const prev = best.get(key);
      if (prev === undefined || better(ev, loc, this.model.events[prev], this.model.locations[prev]!)) {
        best.set(key, idx);
      }
    }

    const options: vscode.DecorationOptions[] = [];
    for (const idx of best.values()) {
      const ev = this.model.events[idx];
      const loc = this.model.locations[idx]!;
      const pos = this.annotationPosition(document, ev, loc)!;
      const text = formatEventValue(ev)!;
      options.push({
        range: new vscode.Range(pos.line, pos.character, pos.line, pos.character),
        renderOptions: { after: { contentText: `(${text})` } },
        hoverMessage: this.buildHover(filePath, loc.line),
      });
    }
    editor.setDecorations(this.decorationType, options);
  }

  /** Clamped annotation position using the shared layout rules. */
  private annotationPosition(
    document: vscode.TextDocument,
    ev: TraceEvent,
    loc: ParsedLocation,
  ): { line: number; character: number } | undefined {
    if (loc.line < 0 || loc.line >= document.lineCount) return undefined;
    return annotationPosition(ev, loc, document.lineAt(loc.line).text);
  }

  private buildHover(filePath: string, line: number): vscode.MarkdownString {
    const history = this.model.getLineHistory(filePath, line);
    const md = new vscode.MarkdownString();
    md.appendMarkdown(
      `**Trace history for this line** (${history.length} event${history.length === 1 ? "" : "s"})\n\n`,
    );
    const shown = history.slice(0, 20);
    for (const idx of shown) {
      const ev = this.model.events[idx];
      const marker = idx === this.model.currentIndex ? "**→ current** " : "";
      md.appendMarkdown(`${marker}${formatEventMarkdown(ev)}\n\n`);
    }
    if (history.length > shown.length) {
      md.appendMarkdown(`_…and ${history.length - shown.length} more_`);
    }
    return md;
  }

  dispose(): void {
    this.decorationType.dispose();
  }
}

/**
 * True if the new event should win over the existing one at the same
 * annotation position: variable changes trump calls trump sub-expressions;
 * among equals the innermost (smallest) range wins.
 */
function better(
  a: TraceEvent,
  aloc: ParsedLocation,
  b: TraceEvent,
  bloc: ParsedLocation,
): boolean {
  const pa = priority(a);
  const pb = priority(b);
  if (pa !== pb) return pa < pb;
  const aa = area(aloc);
  const ab = area(bloc);
  return aa < ab;
}

function priority(ev: TraceEvent): number {
  switch (ev.event) {
    case "change":
      return 0;
    case "call":
      return 1;
    default:
      return 2;
  }
}

function area(loc: ParsedLocation): number {
  return (loc.endLine - loc.line) * 100000 + (loc.endColumn - loc.column);
}
