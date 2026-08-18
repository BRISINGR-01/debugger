import * as vscode from "vscode";
import { TraceModel } from "./model";
import { DecorationManager } from "./decorations";
import { TimelineProvider } from "./timelineProvider";
import {
  annotationPosition,
  formatEventMarkdown,
  formatEventValue,
} from "./format";
import { startServer } from "server";

export function activate(context: vscode.ExtensionContext): void {
  const model = new TraceModel();
  console.log(2);

  startServer().then(model.connectToSocket);
  const decorations = new DecorationManager(model);
  const timelineProvider = new TimelineProvider(model);
  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  statusBar.command = "traceViewer.pickTime";

  vscode.window.registerTreeDataProvider(
    "traceViewer.timeline",
    timelineProvider,
  );

  const setHasTrace = (value: boolean) =>
    vscode.commands.executeCommand("setContext", "traceViewer.hasTrace", value);

  function refreshAll() {
    decorations.refresh(vscode.window.activeTextEditor);
    timelineProvider.refresh();
    updateStatusBar();
  }

  function updateStatusBar() {
    if (!model.loaded) return statusBar.hide();

    const total = model.events.length;
    const pos = model.currentIndex + 1; // 1-based for display; 0 means "before start"
    const current =
      model.currentIndex >= 0 ? model.events[model.currentIndex] : undefined;
    const t =
      current && typeof current.time === "number" ? ` t=${current.time}` : "";
    statusBar.text = `$(pulse) Trace ${pos}/${total}${t}`;
    statusBar.tooltip = "Click to jump to a specific trace event";
    statusBar.show();
  }

  async function loadLogFromUri(uri: vscode.Uri) {
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      const text = Buffer.from(bytes).toString("utf8");
      model.loadFromText(text);
      setHasTrace(model.loaded);
      refreshAll();
      if (model.parseErrors.length > 0) {
        vscode.window.showWarningMessage(
          `Trace Viewer: loaded ${model.events.length} event(s), but ${model.parseErrors.length} chunk(s) failed to parse. See the "Trace Viewer" output for details.`,
        );
        const out = vscode.window.createOutputChannel("Trace Viewer");
        for (const err of model.parseErrors) {
          out.appendLine(`--- parse error: ${err.message} ---`);
          out.appendLine("");
        }
        out.show(true);
      } else {
        vscode.window.showInformationMessage(
          `Trace Viewer: loaded ${model.events.length} event(s).`,
        );
      }
    } catch (e) {
      vscode.window.showErrorMessage(
        `Trace Viewer: failed to read log file: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  context.subscriptions.push(
    statusBar,
    decorations,

    vscode.commands.registerCommand("traceViewer.loadLog", async () => {
      const picked = await vscode.window.showOpenDialog({
        canSelectMany: false,
        openLabel: "Load Trace Log",
        filters: {
          "Log / Text files": ["log", "txt", "json", "jsonl", "ndjson"],
          "All files": ["*"],
        },
      });

      if (picked && picked[0]) await loadLogFromUri(picked[0]);
    }),

    vscode.commands.registerCommand("traceViewer.clear", () => {
      model.clear();
      setHasTrace(false);
      refreshAll();
    }),

    vscode.commands.registerCommand("traceViewer.stepForward", () => {
      if (model.stepForward()) {
        refreshAll();
        revealCurrent(model);
      }
    }),

    vscode.commands.registerCommand("traceViewer.stepBackward", () => {
      if (model.stepBackward()) {
        refreshAll();
        revealCurrent(model);
      }
    }),

    vscode.commands.registerCommand("traceViewer.jumpToStart", () => {
      model.jumpToStart();
      refreshAll();
    }),

    vscode.commands.registerCommand("traceViewer.jumpToEnd", () => {
      model.jumpToEnd();
      refreshAll();
      revealCurrent(model);
    }),

    vscode.commands.registerCommand(
      "traceViewer.jumpToEvent",
      (index: number) => {
        model.jumpTo(index);
        refreshAll();
        revealCurrent(model);
      },
    ),

    vscode.commands.registerCommand("traceViewer.pickTime", async () => {
      if (!model.loaded) return;

      const items: (vscode.QuickPickItem & { index: number })[] =
        model.events.map((ev, i) => ({
          index: i,
          label: `${typeof ev.time === "number" ? ev.time.toFixed(3) : i}  ${ev.event}`,
          description:
            typeof ev.loc === "string" ? ev.loc : (ev.loc?.start ?? undefined),
          detail:
            ev.event === "declare" && ev.variable
              ? `${ev.variable.name} = ${ev.variable.value}`
              : ev.event === "enter"
                ? ev.function_name
                : ev.event === "call"
                  ? ev.callee
                  : undefined,
        }));
      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: "Jump to trace event",
        matchOnDescription: true,
        matchOnDetail: true,
      });
      if (picked) {
        model.jumpTo(picked.index);
        refreshAll();
        revealCurrent(model);
      }
    }),

    vscode.commands.registerCommand("traceViewer.toggleInline", () => {
      decorations.toggle();
      refreshAll();
    }),

    vscode.window.onDidChangeActiveTextEditor(() =>
      decorations.refresh(vscode.window.activeTextEditor),
    ),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (vscode.window.activeTextEditor?.document === e.document) {
        decorations.refresh(vscode.window.activeTextEditor);
      }
    }),

    vscode.languages.registerHoverProvider("*", {
      provideHover(document, position) {
        if (!model.loaded) {
          return undefined;
        }
        const filePath = document.uri.fsPath;
        const history = model.getLineHistory(filePath, position.line);
        if (history.length === 0) return;

        const covering = model.getEventsAt(
          filePath,
          position.line,
          position.character,
        );
        if (covering.length > 0) {
          // Scope the hover to the event whose recorded range covers the
          // cursor (innermost first), and highlight that range — including any
          // inline `(value)` annotation rendered over/after it — in the editor.
          const idx = bestCoveringEvent(model, covering);
          const range = hoverRangeOf(model, document, idx);
          const snippetRange = rangeOf(model, document, idx);
          const md = new vscode.MarkdownString();
          md.isTrusted = false;
          if (snippetRange) {
            md.appendMarkdown(
              "```\n" + document.getText(snippetRange) + "\n```\n\n",
            );
          }
          md.appendMarkdown(`### ${formatEventMarkdown(model.events[idx])}\n`);
          const others = history.filter((i) => i !== idx).length;
          if (others > 0) {
            md.appendMarkdown(
              `\n_…plus ${others} other event${others === 1 ? "" : "s"} on this line._`,
            );
          }
          return new vscode.Hover(md, range);
        }

        const md = new vscode.MarkdownString();
        md.isTrusted = false;
        md.appendMarkdown(
          `### Trace events on this line (${history.length})\n\n`,
        );
        for (const idx of history.slice(0, 15)) {
          const marker = idx === model.currentIndex ? "**▶ current —** " : "";
          md.appendMarkdown(
            marker + formatEventMarkdown(model.events[idx]) + "\n\n---\n\n",
          );
        }
        return new vscode.Hover(md);
      },
    }),
  );

  // Also expose loading via drag-drop-free convenience: files ending in known
  // trace extensions opened directly can be loaded with one click from the
  // editor title bar using the same command.
  setHasTrace(false);
  updateStatusBar();
}

/**
 * Among the events covering the cursor, pick the most relevant: the innermost
 * (smallest) range, breaking ties toward the current trace position.
 */
function bestCoveringEvent(model: TraceModel, covering: number[]): number {
  const area = (i: number) => {
    const loc = model.locations[i];
    if (!loc) return Number.POSITIVE_INFINITY;
    return (loc.endLine - loc.line) * 100000 + (loc.endColumn - loc.column);
  };
  let best = covering[0];
  for (const i of covering) {
    const a = area(i);
    const b = area(best);
    if (a < b || (a === b && i === model.currentIndex)) {
      best = i;
    }
  }
  return best;
}

/** Clamped editor range for an event's recorded location, or undefined. */
function rangeOf(
  model: TraceModel,
  document: vscode.TextDocument,
  idx: number,
): vscode.Range | undefined {
  const loc = model.locations[idx];
  if (!loc) return undefined;
  if (loc.line < 0 || loc.line >= document.lineCount) return undefined;

  const startChar = Math.min(loc.column, document.lineAt(loc.line).text.length);
  if (loc.endLine === loc.line) {
    const endChar = Math.min(
      loc.endColumn,
      document.lineAt(loc.line).text.length,
    );
    return new vscode.Range(loc.line, startChar, loc.line, endChar);
  }
  const endLine = Math.min(loc.endLine, document.lineCount - 1);
  const endChar = Math.min(loc.endColumn, document.lineAt(endLine).text.length);
  return new vscode.Range(loc.line, startChar, endLine, endChar);
}

/**
 * The editor range to highlight for an event: its recorded location, extended
 * to also cover the inline `(value)` annotation rendered after it when that
 * annotation sits beyond the recorded end (e.g. a read `a` highlights as
 * `a(5)`, a whole-expression `a + b` as `a(5) + b(10)`). When the annotation
 * already falls inside the recorded range (an assignment like `c(15) = a + b`),
 * the recorded range is highlighted as-is so the hint is naturally included.
 */
function hoverRangeOf(
  model: TraceModel,
  document: vscode.TextDocument,
  idx: number,
): vscode.Range | undefined {
  const loc = model.locations[idx];
  const base = rangeOf(model, document, idx);
  if (!loc || !base) return undefined;

  const value = formatEventValue(model.events[idx]);
  if (!value) return base;

  const startLine = Math.min(Math.max(loc.line, 0), document.lineCount - 1);
  const pos = annotationPosition(
    model.events[idx],
    loc,
    document.lineAt(startLine).text,
  );
  const posLine = Math.min(Math.max(pos.line, 0), document.lineCount - 1);
  const annotationEnd = new vscode.Position(
    posLine,
    pos.character + value.length + 2,
  );
  if (!annotationEnd.isAfter(base.end)) return base;
  return new vscode.Range(base.start, annotationEnd);
}

function revealCurrent(model: TraceModel): void {
  if (model.currentIndex < 0) return;

  const loc = model.locations[model.currentIndex];
  if (!loc) return;

  const uri = vscode.Uri.file(loc.file);
  vscode.workspace.openTextDocument(uri).then(
    (doc) => {
      vscode.window
        .showTextDocument(doc, { preserveFocus: false, preview: true })
        .then((editor) => {
          const pos = new vscode.Position(loc.line, Math.max(0, loc.column));
          editor.selection = new vscode.Selection(pos, pos);
          editor.revealRange(
            new vscode.Range(pos, pos),
            vscode.TextEditorRevealType.InCenterIfOutsideViewport,
          );
        });
    },
    () => {
      // File not found / not part of the workspace — silently ignore, the
      // decoration/status bar still reflects the current trace position.
    },
  );
}

export function deactivate(): void {
  // Nothing to clean up beyond what's registered in context.subscriptions.
}
