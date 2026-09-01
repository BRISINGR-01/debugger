import * as vscode from "vscode";
import { TraceModel } from "./model";
import {
  formatEventValue,
  formatEventMarkdown,
  formatArgValue,
} from "./format";
import { Arg, Loc, LogEvent } from "./json-spec";
import { vsRange } from "./utils";

export class DecorationManager {
  private decorationType: vscode.TextEditorDecorationType;
  private throwDecorationType: vscode.TextEditorDecorationType;
  private ifTrueDecorationType: vscode.TextEditorDecorationType;
  private ifFalseDecorationType: vscode.TextEditorDecorationType;
  private enabled = true;
  private lastEditor: vscode.TextEditor | undefined;
  private currentOptions: vscode.DecorationOptions[] = [];
  private currentThrowOptions: vscode.DecorationOptions[] = [];
  private currentIfTrueOptions: vscode.DecorationOptions[] = [];
  private currentIfFalseOptions: vscode.DecorationOptions[] = [];

  constructor(private model: TraceModel) {
    this.decorationType = this.createDecorationType();
    this.throwDecorationType = this.createThrowDecorationType();
    this.ifTrueDecorationType = this.createIfDecorationType("#3dab5e");
    this.ifFalseDecorationType = this.createIfDecorationType("#d73a49");
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

  private createThrowDecorationType(): vscode.TextEditorDecorationType {
    return vscode.window.createTextEditorDecorationType({
      isWholeLine: false,
      textDecoration: "underline #f14c4c",
    });
  }

  private createIfDecorationType(
    color: string,
  ): vscode.TextEditorDecorationType {
    return vscode.window.createTextEditorDecorationType({
      isWholeLine: false,
      textDecoration: `underline ${color}`,
    });
  }

  toggle(): void {
    this.enabled = !this.enabled;
  }

  get isEnabled() {
    return this.enabled;
  }

  clearLines(affectedLines: Set<number>): void {
    const editor = this.lastEditor;
    if (!editor) return;
    const isNotAffected = (o: vscode.DecorationOptions) =>
      !affectedLines.has(o.range.start.line);
    editor.setDecorations(
      this.decorationType,
      this.currentOptions.filter(isNotAffected),
    );
    editor.setDecorations(
      this.throwDecorationType,
      this.currentThrowOptions.filter(isNotAffected),
    );
    editor.setDecorations(
      this.ifTrueDecorationType,
      this.currentIfTrueOptions.filter(isNotAffected),
    );
    editor.setDecorations(
      this.ifFalseDecorationType,
      this.currentIfFalseOptions.filter(isNotAffected),
    );
  }

  refresh(editor: vscode.TextEditor | undefined): void {
    if (!editor) return;
    this.lastEditor = editor;

    if (!this.enabled || !this.model.loaded) {
      editor.setDecorations(this.decorationType, []);
      editor.setDecorations(this.throwDecorationType, []);
      editor.setDecorations(this.ifTrueDecorationType, []);
      editor.setDecorations(this.ifFalseDecorationType, []);
      return;
    }

    const filePath = editor.document.uri.fsPath;
    const events = this.model.events.getFileEvents(filePath);
    if (events.length === 0) {
      editor.setDecorations(this.decorationType, []);
      editor.setDecorations(this.throwDecorationType, []);
      editor.setDecorations(this.ifTrueDecorationType, []);
      editor.setDecorations(this.ifFalseDecorationType, []);
      return;
    }

    const document = editor.document;
    // annotation position ("line:col") -> best event index to annotate there
    const best = new Map<string, LogEvent>();
    const argBest = new Map<string, Arg>();
    const throwOptions: vscode.DecorationOptions[] = [];
    const ifTrueOptions: vscode.DecorationOptions[] = [];
    const ifFalseOptions: vscode.DecorationOptions[] = [];
    const options: vscode.DecorationOptions[] = [];

    for (const ev of events) {
      switch (ev.event) {
        case "throw":
          const range = new vscode.Range(
            ev.loc.start.line,
            ev.loc.start.col,
            ev.loc.end.line,
            ev.loc.end.col,
          );

          const md = new vscode.MarkdownString();
          md.isTrusted = false;
          md.appendMarkdown(`**Throw**\n\n${formatEventMarkdown(ev)}`);
          throwOptions.push({ range, hoverMessage: md });
          break;
        case "if":
          {
            const range = vsRange(ev.loc);
            const md = new vscode.MarkdownString();
            md.isTrusted = false;
            md.appendMarkdown(`**if** → **${ev.isTruthy ? "then" : "else"}**`);
            if (ev.isTruthy) {
              ifTrueOptions.push({ range, hoverMessage: md });
            } else {
              ifFalseOptions.push({ range, hoverMessage: md });
            }
          }
          break;
        case "enter":
          for (const arg of ev.args) {
            const key = `${arg.loc.start.line}:${arg.loc.start.col}`;
            const prev = argBest.get(key);
            if (!prev) argBest.set(key, arg);
          }
          break;

        default:
          if (!formatEventValue(ev)) continue;

          const pos = this.annotationPosition(document, ev, ev.loc);
          if (!pos) continue;
          if (pos.line < 0 || pos.line >= document.lineCount) continue;

          const key = `${pos.line}:${pos.character}`;
          const prev = best.get(key);
          if (!prev || better(ev, prev)) {
            best.set(key, ev);
          }
          break;
      }
    }

    for (const arg of argBest.values()) {
      const text = formatArgValue(arg.val);
      const md = new vscode.MarkdownString();
      md.isTrusted = false;
      md.appendMarkdown(`**${arg.name}**: \`${arg.type}\` = \`${arg.val}\``);

      const loc = structuredClone(arg.loc);
      loc.start.line -= 1;
      loc.start.col -= 1;
      loc.end.line -= 1;
      loc.end.col -= 1;
      options.push({
        range: vsRange(loc),
        renderOptions: { after: { contentText: `(${text})` } },
        hoverMessage: md,
      });
    }

    for (const ev of best.values()) {
      const loc = ev.loc;
      const pos = this.annotationPosition(document, ev, loc);
      if (!pos) continue;
      const text = formatEventValue(ev)!;
      options.push({
        range: new vscode.Range(
          pos.line,
          pos.character,
          pos.line,
          pos.character,
        ),
        renderOptions: { after: { contentText: `(${text})` } },
        hoverMessage: this.buildHover(filePath, loc.start.line),
      });
    }
    editor.setDecorations(this.decorationType, options);
    editor.setDecorations(this.throwDecorationType, throwOptions);
    editor.setDecorations(this.ifTrueDecorationType, ifTrueOptions);
    editor.setDecorations(this.ifFalseDecorationType, ifFalseOptions);
    this.currentOptions = options;
    this.currentThrowOptions = throwOptions;
    this.currentIfTrueOptions = ifTrueOptions;
    this.currentIfFalseOptions = ifFalseOptions;
  }

  /** Clamped annotation position using the shared layout rules. */
  private annotationPosition(
    document: vscode.TextDocument,
    ev: LogEvent,
    loc: Loc,
  ): { line: number; character: number } | undefined {
    if (loc.start.line < 0 || loc.end.line >= document.lineCount)
      return undefined;
    return {
      line: ev.loc.end.line - 1,
      character: ev.loc.end.col + 1,
    };
  }

  private buildHover(filePath: string, line: number): vscode.MarkdownString {
    const history = this.model.getLineHistory(filePath, line);
    const md = new vscode.MarkdownString();
    md.appendMarkdown(
      `**Trace history for this line** (${history.length} event${history.length === 1 ? "" : "s"})\n\n`,
    );
    const shown = history.slice(0, 20);
    for (const ev of shown) {
      const marker =
        ev === this.model.events.get(this.model.currentIndex)
          ? "**→ current** "
          : "";
      md.appendMarkdown(`${marker}${formatEventMarkdown(ev)}\n\n`);
    }
    if (history.length > shown.length) {
      md.appendMarkdown(`_…and ${history.length - shown.length} more_`);
    }
    return md;
  }

  dispose(): void {
    this.decorationType.dispose();
    this.throwDecorationType.dispose();
    this.ifTrueDecorationType.dispose();
    this.ifFalseDecorationType.dispose();
  }
}

/**
 * True if the new event should win over the existing one at the same
 * annotation position: variable changes trump calls trump sub-expressions;
 * among equals the innermost (smallest) range wins; and when two entries are
 * otherwise identical (e.g. a variable read at the same spot on every loop
 * iteration) the later entry in the log wins, so the latest value shows.
 */
function better(a: LogEvent, b: LogEvent): boolean {
  const pa = priority(a);
  const pb = priority(b);
  if (pa !== pb) return pa < pb;
  const aa = area(a);
  const ab = area(b);
  if (aa !== ab) return aa < ab;
  return true;
}

function priority(ev: LogEvent): number {
  switch (ev.event) {
    case "change":
    case "expr":
      return 0;
    case "call":
      return 1;
    default:
      return 2;
  }
}

function area({ loc }: LogEvent): number {
  return (
    (loc.end.line - loc.start.line) * 100000 + (loc.end.col - loc.start.col)
  );
}
