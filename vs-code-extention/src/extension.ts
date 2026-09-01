import * as vscode from "vscode";
import * as path from "path";
import { TraceModel } from "./model";
import { DecorationManager } from "./decorations";
import { TimelineProvider } from "./timelineProvider";
import { formatEventMarkdown } from "./format";
import { Debugger, EventsContainer } from "debugger";
import { EnterEvent, Id, LogEvent } from "./json-spec";
import { getFile, getRoot, vsRange } from "./utils";

export function activate(context: vscode.ExtensionContext): void {
  const root = getRoot();
  if (!root) throw new Error("No root dir was found");
  const events = new EventsContainer();

  const model = new TraceModel(root, events);

  const dbg = new Debugger(
    {
      command: "./build/app",
      srcRoot: root,
      disable: false,
      excludePattern: [],
      httpPort: 5634,
      ioFilePath: undefined,
      shouldRestart: true,
      shouldWatch: true,
    },
    events,
  );
  dbg.on("clear", () => {
    model.clear();
    refreshAll();
  });
  dbg.on("data", (d: LogEvent) => {
    model.events.addEvent(d);
    refreshAll();
    if (
      model.currentIndex === -1 ||
      model.currentIndex === model.events.count - 2
    ) {
      model.jumpToEnd();
    }
  });
  dbg.on("error", (e) => {
    console.error(e);
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

    const total = model.events.count;
    const pos = model.currentIndex + 1; // 1-based for display; 0 means "before start"
    const current =
      model.currentIndex >= 0
        ? model.events.get(model.currentIndex)
        : undefined;
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

      const items: (vscode.QuickPickItem & { index: number })[] = model.events
        .getEnters()
        .map((ev: EnterEvent, i: number) => ({
          index: i,
          label: `${ev.time.toFixed(3)} ${ev.fn_name}`,
          description: `${ev.loc.start.line}:${ev.loc.start.col}`,
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
      async (id?: Id) => {
        if (!model.loaded) return;
        if (id) {
          const exit = model.events.findExitIdx(id);
          if (exit) {
            model.jumpTo(exit);
            refreshAll();
            revealCurrent(model);
          }
          return;
        }

        return;

        //   // Step 1: collect unique function names from enter events
        //   const fnEntries = new Map<
        //     string,
        //     { index: number; time: number; loc?: string }[]
        //   >();
        //   for (let i = 0; i < model.events.count; i++) {
        //     const ev = model.events.get(i);
        //     if (ev.event !== "enter") continue;
        //     if (model.findExitForEnter(i) === undefined) continue;
        //     const name = ev.fn_name ?? "(anonymous)";
        //     let list = fnEntries.get(name);
        //     if (!list) {
        //       list = [];
        //       fnEntries.set(name, list);
        //     }
        //     list.push({
        //       index: i,
        //       time: ev.time,
        //       loc: `${path.basename(getFile(ev))}:${ev.loc.start.line}`,
        //     });
        //   }
        //   if (fnEntries.size === 0) return;

        //   // Step 1 quick pick: choose a function name
        //   const fnItems: (vscode.QuickPickItem & { name: string })[] = [
        //     ...fnEntries.entries(),
        //   ].map(([name, calls]) => ({
        //     name,
        //     label: name,
        //     description: `${calls.length} call${calls.length === 1 ? "" : "s"}`,
        //   }));
        //   const fnPicked = await vscode.window.showQuickPick(fnItems, {
        //     placeHolder: "Choose a function",
        //     matchOnDescription: true,
        //   });
        //   if (!fnPicked) return;

        //   // Step 2: show all enter events for that function
        //   const calls = fnEntries.get(fnPicked.name)!;
        //   const callItems: (vscode.QuickPickItem & { index: number })[] =
        //     calls.map((c) => ({
        //       index: c.index,
        //       label: `${c.time.toFixed(3)}  ${fnPicked.name}`,
        //       description: c.loc,
        //     }));
        //   const callPicked = await vscode.window.showQuickPick(callItems, {
        //     placeHolder: `Choose a ${fnPicked.name}() entry to jump to its return`,
        //     matchOnDescription: true,
        //   });
        //   if (!callPicked) return;

        //   const exitIdx = model.events.findExitIdx(callPicked.index)!;
        //   model.jumpTo(exitIdx);
        //   refreshAll();
        //   revealCurrent(model);
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
        if (!model.loaded) return undefined;

        const filePath = document.uri.fsPath;
        const lineEvents = model.getLineHistory(filePath, position.line);
        if (lineEvents.length === 0) return;

        const covering = model.getEventsAt(
          filePath,
          position.line,
          position.character,
        );
        if (covering.length > 0) {
          const hoveredEv = bestCoveringEvent(model, covering);
          const range = vsRange(hoveredEv.loc);
          const md = new vscode.MarkdownString();
          md.isTrusted = true;
          md.appendMarkdown("```\n" + document.getText(range) + "\n```\n\n");

          md.appendMarkdown(`### ${formatEventMarkdown(hoveredEv)}\n`);
          const others = lineEvents.filter(
            (ev: LogEvent) => ev !== hoveredEv,
          ).length;
          if (others > 0) {
            md.appendMarkdown(
              `\n_…plus ${others} other event${others === 1 ? "" : "s"} on this line._`,
            );
          }

          // For enter events, show all calls to the same function
          if (hoveredEv.event === "enter") {
            const calls = model.events.findEntersForFn(hoveredEv);
            if (calls.length > 1) {
              md.appendMarkdown(
                `\n\n---\n\n**${calls.length} calls to \`${hoveredEv.fn_name}\`**\n\n`,
              );
              for (const ci of calls.slice(0, 20)) {
                const marker = ci === hoveredEv ? "**→** " : "";
                const locStr = ` ${path.basename(getFile(ci))}:${ci.loc.start.line}`;

                md.appendMarkdown(
                  `${marker}[t=${ci.time.toFixed(3)}${locStr} ${ci.args.length !== 0 && `args: {${ci.args.map((a) => `${a.name}:${a.type} = ${a.val}}`).join(", ")}`}](command:traceViewer.jumpToEndOfFn?${ci.ctx_id})\n\n`,
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
          `### Trace events on this line (${lineEvents.length})\n\n`,
        );
        for (const ev of lineEvents.slice(0, 15)) {
          const marker =
            ev === model.events.get(model.currentIndex)
              ? "**▶ current —** "
              : "";
          md.appendMarkdown(marker + formatEventMarkdown(ev) + "\n\n---\n\n");
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
function bestCoveringEvent(model: TraceModel, covering: LogEvent[]): LogEvent {
  const area = (ev: LogEvent) => {
    return (
      (ev.loc.end.line - ev.loc.start.line) * 100000 +
      (ev.loc.end.col - ev.loc.start.col)
    );
  };
  let best = covering[0];
  for (const ev of covering) {
    const a = area(ev);
    const b = area(best);
    if (a < b || (a === b && ev === model.events.get(model.currentIndex))) {
      best = ev;
    }
  }
  return best;
}

function revealCurrent(model: TraceModel): void {
  if (model.currentIndex < 0) return;

  const ev = model.events.get(model.currentIndex);

  const pos = new vscode.Position(
    ev.loc.start.line,
    Math.max(0, ev.loc.start.col),
  );
  const root = getRoot();
  const file = path.join(root, getFile(ev));

  const active = vscode.window.activeTextEditor;
  if (active && active.document.uri.fsPath === file) {
    active.selection = new vscode.Selection(pos, pos);
    active.revealRange(
      new vscode.Range(pos, pos),
      vscode.TextEditorRevealType.InCenterIfOutsideViewport,
    );
    return;
  }

  const uri = vscode.Uri.file(file);
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
