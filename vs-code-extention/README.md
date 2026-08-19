# Trace Viewer

A VS Code extension that displays variable and expression values inline in your
editor, driven by an execution trace log like:

```
{
  time: 2953.536,
  event: 'declare',
  variable: { name: 'data', type: 'const', value: '[]' },
  loc: '/home/alex/Desktop/VSC/ryanair/webscraper/scraper/index.ts:87:2',
  fn_id: '20'
}
```

It supports `declare`, `call`, `enter`, `return`, and `throw` events out of the
box, and will still show a generic line for any other `event` value your
tracer emits (the parser doesn't require a fixed schema — any object with an
`event: string` field is accepted).

## Features

- **Inline decorations** — each traced line gets a faint "ghost text" comment
  after it showing the most recent value at the current point in time (e.g.
  `data: const = []`, `▶ enter enumerateMonths(start=..., end=...)`).
- **Time cursor** — step through the trace event-by-event (forward/backward),
  jump to start/end, or jump straight to any event via a searchable quick
  pick. The editor auto-reveals the file/line for the event you land on.
- **Trace Timeline view** (Explorer sidebar) — a flat, chronological list of
  every event; click any entry to jump the time cursor there.
- **Hover for history** — hovering a traced line shows every event recorded
  at that exact location (useful for loops/re-entrant calls that hit the same
  line multiple times), with the current one marked.
- **Status bar** — shows `Trace <pos>/<total> t=<time>`; click it to open the
  jump-to-event quick pick.

## Log format notes

The log doesn't have to be strict JSON — unquoted keys, single-quoted
strings, and multi-line objects (as in the example above) are all supported.
The parser splits the file into top-level `{ ... }` chunks (brace-depth aware,
string-aware) and evaluates each chunk as a JS object literal. Because of
that, treat trace files as trusted input (e.g. your own tool's output), not
arbitrary untrusted data.

`loc` is optional per-event (see the compact `throw` events in the sample,
which have no `loc`) — those events just won't get an inline decoration or
appear under a specific line, but they still show up in the Timeline view.

## Commands

All available via the Command Palette once a trace is loaded:

- `Trace Viewer: Load Trace Log...`
- `Trace Viewer: Step Forward` / `Step Backward`
- `Trace Viewer: Jump to Start` / `Jump to End`
- `Trace Viewer: Jump to Event...`
- `Trace Viewer: Toggle Inline Values`
- `Trace Viewer: Clear Trace`

## Running it

```bash
npm install
npm run compile
```

Then press `F5` in VS Code (with this folder open) to launch an Extension
Development Host with the extension loaded. Run **Trace Viewer: Load Trace
Log...** from the Command Palette and pick your `.log`/`.txt` file.

### Packaging a `.vsix`

```bash
npm install -g @vscode/vsce
vsce package
```

This produces a `trace-viewer-0.1.0.vsix` you can install via
**Extensions: Install from VSIX...** in VS Code.

## Known limitations / next steps

- Values are shown as raw strings from the log (no live re-evaluation) — the
  tracer is the source of truth, this extension only visualizes its output.
- Call-stack nesting (via `fn_id`) is tracked in the data but not yet
  rendered as an indented call tree in the Timeline view — currently it's a
  flat chronological list. Grouping by `fn_id` parentage would be a natural
  follow-up.
- Path matching between `loc` and open editors is exact-path based; if your
  trace was captured on a different machine/path than where you're viewing
  it, decorations won't line up (only the Timeline/hover data would still be
  useful).
