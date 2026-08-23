import * as vscode from "vscode";
import * as path from "path";
import { TraceModel } from "./model";
import { DecorationManager } from "./decorations";
import { TimelineProvider } from "./timelineProvider";
import {
  annotationPosition,
  formatEventMarkdown,
  formatEventValue,
} from "./format";
import { TraceEvent } from "./types";
import Debugger from "debugger";
import { LogEvent } from "./json-spec";
import { getRoot } from "./utils";

export function activate(context: vscode.ExtensionContext): void {
  const model = new TraceModel();
  const root = getRoot();

  if (!root) throw new Error("No root dir was found");

  const dbg = new Debugger({
    command: "node main.js",
    path: root,
  });
  dbg.on("clear", () => {
    model.clear();
    refreshAll();
  });
  dbg.on("data", (d: LogEvent) => {
    model.addEvent(d);
    refreshAll();
    if (
      model.currentIndex === -1 ||
      model.currentIndex === model.events.length - 2
    ) {
      model.jumpToEnd();
    }
  });
  dbg.on("ready", () => {
    setHasTrace(model.loaded);
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
  });

  dbg.start().then(() => setHasTrace(model.loaded));
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

  let timeout: NodeJS.Timeout;
  function refreshAll(): Promise<void> {
    clearTimeout(timeout);
    return new Promise(
      (res) =>
        (timeout = setTimeout(() => {
          decorations.refresh(vscode.window.activeTextEditor);
          timelineProvider.refresh();
          updateStatusBar();
          res();
        }, 300)),
    );
  }

  function updateStatusBar() {
    if (!model.loaded) return statusBar.hide();

    const total = model.events.length;
    const pos = model.currentIndex + 1; // 1-based for display; 0 means "before start"
    const current =
      model.currentIndex >= 0 ? model.events[model.currentIndex] : undefined;
    const t = current ? ` t=${current.time}` : "";
    statusBar.text = `$(pulse) Trace ${pos}/${total}${t}`;
    statusBar.tooltip = "Click to jump to a specific trace event";
    statusBar.show();
  }

  context.subscriptions.push(
    statusBar,
    decorations,

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
        model.events.map((ev: TraceEvent, i: number) => ({
          index: i,
          label: `${ev.time.toFixed(3)}  ${ev.event}`,
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

    vscode.commands.registerCommand(
      "traceViewer.jumpToEndOfFn",
      async (index?: number) => {
        if (!model.loaded) return;
        if (index) {
          const exit = model.findExitForEnter(index);
          if (exit) {
            model.jumpTo(exit);
            refreshAll();
            revealCurrent(model);
          }
          return;
        }

        // Step 1: collect unique function names from enter events
        const fnEntries = new Map<
          string,
          { index: number; time: number; loc?: string }[]
        >();
        for (let i = 0; i < model.events.length; i++) {
          const ev = model.events[i];
          if (ev.event !== "enter") continue;
          if (model.findExitForEnter(i) === undefined) continue;
          const name = ev.function_name ?? "(anonymous)";
          let list = fnEntries.get(name);
          if (!list) {
            list = [];
            fnEntries.set(name, list);
          }
          const loc = model.locations[i];
          list.push({
            index: i,
            time: ev.time,
            loc: loc ? `${path.basename(loc.file)}:${loc.line + 1}` : undefined,
          });
        }
        if (fnEntries.size === 0) return;

        // Step 1 quick pick: choose a function name
        const fnItems: (vscode.QuickPickItem & { name: string })[] = [
          ...fnEntries.entries(),
        ].map(([name, calls]) => ({
          name,
          label: name,
          description: `${calls.length} call${calls.length === 1 ? "" : "s"}`,
        }));
        const fnPicked = await vscode.window.showQuickPick(fnItems, {
          placeHolder: "Choose a function",
          matchOnDescription: true,
        });
        if (!fnPicked) return;

        // Step 2: show all enter events for that function
        const calls = fnEntries.get(fnPicked.name)!;
        const callItems: (vscode.QuickPickItem & { index: number })[] =
          calls.map((c) => ({
            index: c.index,
            label: `${c.time.toFixed(3)}  ${fnPicked.name}`,
            description: c.loc,
          }));
        const callPicked = await vscode.window.showQuickPick(callItems, {
          placeHolder: `Choose a ${fnPicked.name}() entry to jump to its return`,
          matchOnDescription: true,
        });
        if (!callPicked) return;

        const exitIdx = model.findExitForEnter(callPicked.index)!;
        model.jumpTo(exitIdx);
        refreshAll();
        revealCurrent(model);
      },
    ),

    vscode.window.onDidChangeActiveTextEditor(() =>
      decorations.refresh(vscode.window.activeTextEditor),
    ),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (
        model.loaded &&
        vscode.window.activeTextEditor?.document === e.document
      ) {
        const lines = new Set<number>();
        for (const change of e.contentChanges) {
          for (
            let l = change.range.start.line;
            l <= change.range.end.line;
            l++
          ) {
            lines.add(l);
          }
        }
        decorations.clearLines(lines);
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
          const idx = bestCoveringEvent(model, covering);
          const range = hoverRangeOf(model, document, idx);
          const snippetRange = rangeOf(model, document, idx);
          const md = new vscode.MarkdownString();
          md.isTrusted = true;
          if (snippetRange) {
            md.appendMarkdown(
              "```\n" + document.getText(snippetRange) + "\n```\n\n",
            );
          }
          md.appendMarkdown(`### ${formatEventMarkdown(model.events[idx])}\n`);
          const others = history.filter((i: number) => i !== idx).length;
          if (others > 0) {
            md.appendMarkdown(
              `\n_…plus ${others} other event${others === 1 ? "" : "s"} on this line._`,
            );
          }

          // For enter events, show all calls to the same function
          const ev = model.events[idx];
          if (ev.event === "enter" && ev.function_name) {
            const calls = model.findEntersForFn(ev.function_name);
            if (calls.length > 1) {
              md.appendMarkdown(
                `\n\n---\n\n**${calls.length} calls to \`${ev.function_name}\`**\n\n`,
              );
              for (const ci of calls.slice(0, 20)) {
                const loc = model.locations[ci];
                const marker = ci === idx ? "**→** " : "";
                const locStr = loc
                  ? ` ${path.basename(loc.file)}:${loc.line + 1}`
                  : "";
                md.appendMarkdown(
                  `${marker}[t=${model.events[ci].time.toFixed(3)}${locStr} ${model.events[ci].args && `args: {${model.events[ci].args.map((a) => `${a.name}:${a.type} = ${a.value}}`).join(", ")}`}](command:traceViewer.jumpToEndOfFn?${ci})\n\n`,
                );
              }
              if (calls.length > 20) {
                md.appendMarkdown(`_…and ${calls.length - 20} more_\n\n`);
              }
            }
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

  const pos = new vscode.Position(loc.line, Math.max(0, loc.column));
  const root = getRoot();

  const active = vscode.window.activeTextEditor;
  if (active && active.document.uri.fsPath === path.join(root, loc.file)) {
    active.selection = new vscode.Selection(pos, pos);
    active.revealRange(
      new vscode.Range(pos, pos),
      vscode.TextEditorRevealType.InCenterIfOutsideViewport,
    );
    return;
  }

  const uri = vscode.Uri.file(loc.file);
  vscode.workspace.openTextDocument(uri).then(
    (doc) => {
      vscode.window
        .showTextDocument(doc, { preserveFocus: false, preview: true })
        .then((editor) => {
          editor.selection = new vscode.Selection(pos, pos);
          editor.revealRange(
            new vscode.Range(pos, pos),
            vscode.TextEditorRevealType.InCenterIfOutsideViewport,
          );
        });
    },
    () => {},
  );
}

export function deactivate(): void {
  // Nothing to clean up beyond what's registered in context.subscriptions.
}
