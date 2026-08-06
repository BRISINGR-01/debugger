import * as vscode from "vscode";
import { TraceModel } from "./model";
import { formatEventInline } from "./format";

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
        margin: "0 0 0 1.5rem",
        color: customColor
          ? customColor
          : new vscode.ThemeColor("editorCodeLens.foreground"),
        fontStyle: "italic",
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
    const state = this.model.getCurrentStateForFile(filePath);
    if (state.size === 0) {
      editor.setDecorations(this.decorationType, []);
      return;
    }

    const options: vscode.DecorationOptions[] = [];
    for (const [line, eventIdx] of state.entries()) {
      if (line < 0 || line >= editor.document.lineCount) continue;

      const ev = this.model.events[eventIdx];
      const text = formatEventInline(ev);
      if (!text) continue;

      const lineText = editor.document.lineAt(line).text;
      const range = new vscode.Range(
        line,
        lineText.length,
        line,
        lineText.length,
      );
      options.push({
        range,
        renderOptions: { after: { contentText: "  " + text } },
        hoverMessage: this.buildHover(filePath, line),
      });
    }
    editor.setDecorations(this.decorationType, options);
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
      const text = formatEventInline(ev) ?? ev.event;
      md.appendMarkdown(`${marker}\`t=${ev.time ?? "?"}\` ${text}\n\n`);
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
