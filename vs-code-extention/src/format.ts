import { Loc, LogEvent, Var } from "./json-spec";

function truncate(s: string, max = 120): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function safeStringify(v: unknown): string {
  if (typeof v === "string") return v;
  if (v === undefined) return "undefined";
  if (v === null) return "null";

  try {
    const s = JSON.stringify(v);
    return s === undefined ? String(v) : s;
  } catch {
    return String(v);
  }
}

/** Human-readable location string, e.g. "path/to/file:5:2-7" or "…:5:2-6:3". */
export function formatLoc(file: string, loc: Loc): string {
  const start = `${file}:${loc.start.line + 1}:${loc.start.col + 1}`;
  if (loc.end.line === loc.start.line) {
    return `${start}-${loc.end.col + 1}`;
  }
  return `${start}-${loc.end.line + 1}:${loc.end.col + 1}`;
}

/** Short, single-line summary for inline decorations. */
export function formatEventInline(ev: LogEvent): string | undefined {
  switch (ev.event) {
    case "declare": {
      return `${ev.var.name}: ${ev.var.type} = ${truncate(ev.var.value ?? "undefined")}`;
    }
    case "call":
      return `→ ${ev.callee ?? "(call)"}`;
    case "enter": {
      const args = (ev.args ?? [])
        .map((a: Var) => `${a.name}=${truncate(String(a.value))}`)
        .join(", ");
      return `▶ enter ${ev.fn_name ?? ""}(${args})`;
    }
    case "exit":
      return ev.return_val
        ? `⏎ return ${truncate(safeStringify(ev.return_val))}`
        : "⏎ return";
    case "throw":
      return `⚠ throw${ev.error ? " " + truncate(safeStringify(ev.error)) : ""}`;
    case "if": {
      return `◇ if → ${ev.isTruthy ? "then" : "else"}`;
    }
    default:
      return `• ${ev.event}`;
  }
}

/** Collapse newlines/whitespace so a value fits on a single inline line. */
function singleLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Compact value snippet for inline annotations next to the traced code. */
export function formatEventValue(ev: LogEvent): string | undefined {
  switch (ev.event) {
    case "change":
      return truncate(singleLine(safeStringify(ev.var.value)), 80);
    case "expr":
      return truncate(singleLine(safeStringify(ev.val)), 80);
    case "exit":
      return ev.return_val !== undefined
        ? truncate(singleLine(safeStringify(ev.return_val)), 80)
        : undefined;
    case "call":
      return ev.value !== undefined
        ? truncate(singleLine(safeStringify(ev.value)), 80)
        : undefined;
    default:
      return undefined;
  }
}

/** Compact single-line value string for a function argument. */
export function formatArgValue(value: string): string {
  return truncate(singleLine(safeStringify(value)), 80);
}

/** Longer, multi-line markdown summary for hovers / tree items. */
export function formatEventMarkdown(ev: LogEvent): string {
  const lines: string[] = [];
  lines.push(`**${ev.event}** — t=${ev.time}`);
  lines.push(`ctx_id: \`${ev.ctx_id}\``);

  switch (ev.event) {
    case "declare":
      lines.push(`\`${ev.var.name}: ${ev.var.type} = ${ev.var.value}\``);
      break;
    case "change":
      lines.push(`\`${ev.var.name}: ${ev.var.type} → ${ev.var.value}\``);

      if ("old_val" in ev) {
        lines.push(`old value: \`${safeStringify(ev.old_val)}\``);
      }
      break;
    case "expr":
      lines.push(`value: \`${safeStringify(ev.val)}\``);
      break;
    case "call":
      lines.push(`callee: \`${ev.callee}\``);
      if (ev.value !== undefined) {
        lines.push(`value: \`${safeStringify(ev.value)}\``);
      }
      break;
    case "enter":
      lines.push(`function: \`${ev.fn_name}\``);
      if (ev.args.length !== 0) {
        lines.push("args:");
        for (const a of ev.args) {
          lines.push(`- \`${a.name}: ${a.type} = ${a.value}\``);
        }
      }
      break;
    case "exit":
      if ("return_val" in ev)
        lines.push(`return value: \`${safeStringify(ev.return_val)}\``);
      break;
    case "throw":
      lines.push(`error: \`${safeStringify(ev.error)}\``);
      break;
    case "if": {
      lines.push(`\`if → **${ev.isTruthy ? "then" : "else"}**`);
      break;
    }
    default: {
      const known = new Set(["event", "time", "loc", "fn_id"]);
      const extras = Object.entries(ev)
        .filter(([k]) => !known.has(k))
        .map(([k, v]) => `- \`${k}: ${truncate(safeStringify(v), 200)}\``);
      if (extras.length) {
        lines.push("details:");
        lines.push(...extras);
      }
      break;
    }
  }
  return lines.join("\n\n");
}
