import { TraceEvent, ParsedLocation } from "./types";

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

/** Human-readable location string, e.g. "path/to/file.ts:5:2-7" or "…:5:2-6:3". */
export function formatLoc(loc: ParsedLocation): string {
  const start = `${loc.file}:${loc.line + 1}:${loc.column + 1}`;
  if (loc.endLine === loc.line) {
    return `${start}-${loc.endColumn + 1}`;
  }
  return `${start}-${loc.endLine + 1}:${loc.endColumn + 1}`;
}

/** Short, single-line summary for inline decorations. */
export function formatEventInline(ev: TraceEvent): string | undefined {
  switch (ev.event) {
    case "declare": {
      const v = ev.variable;
      if (!v) {
        return undefined;
      }
      return `${v.name}: ${v.type} = ${truncate(v.value ?? "undefined")}`;
    }
    case "call":
      return `→ ${ev.callee ?? "(call)"}`;
    case "read": {
      const v = ev.variable;
      if (!v) {
        return undefined;
      }
      return `${v.name} = ${truncate(v.value ?? "undefined")}`;
    }
    case "enter": {
      const args = (ev.args ?? [])
        .map((a) => `${a.name}=${truncate(String(a.value))}`)
        .join(", ");
      return `▶ enter ${ev.function_name ?? ""}(${args})`;
    }
    case "return":
      return "value" in ev
        ? `⏎ return ${truncate(safeStringify(ev.value))}`
        : "⏎ return";
    case "throw":
      return `⚠ throw${ev.error ? " " + truncate(safeStringify(ev.error)) : ""}`;
    default:
      return `• ${ev.event}`;
  }
}

/** Collapse newlines/whitespace so a value fits on a single inline line. */
function singleLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Compact value snippet for inline annotations next to the traced code. */
export function formatEventValue(ev: TraceEvent): string | undefined {
  switch (ev.event) {
    case "read":
    case "declare":
    case "change":
      return ev.variable
        ? truncate(singleLine(safeStringify(ev.variable.value)), 80)
        : undefined;
    case "expr":
    case "expression":
    case "return":
      return ev.value !== undefined
        ? truncate(singleLine(safeStringify(ev.value)), 80)
        : undefined;
    case "call":
      return ev.value !== undefined
        ? truncate(singleLine(safeStringify(ev.value)), 80)
        : undefined;
    case "exit":
      return ev.returnVal !== undefined
        ? truncate(singleLine(safeStringify(ev.returnVal)), 80)
        : undefined;
    default:
      return undefined;
  }
}

/** Longer, multi-line markdown summary for hovers / tree items. */
export function formatEventMarkdown(ev: TraceEvent): string {
  const lines: string[] = [];
  lines.push(
    `**${ev.event}**${typeof ev.time === "number" ? ` — t=${ev.time}` : ""}`,
  );
  if (ev.fn_id !== undefined) {
    lines.push(`fn_id: \`${ev.fn_id}\``);
  }
  switch (ev.event) {
    case "declare":
      if (ev.variable) {
        lines.push(
          `\`${ev.variable.name}: ${ev.variable.type} = ${ev.variable.value}\``,
        );
      }
      break;
    case "read":
      if (ev.variable) {
        lines.push(
          `\`${ev.variable.name}: ${ev.variable.type} = ${ev.variable.value}\``,
        );
      }
      break;
    case "change": {
      if (ev.variable) {
        lines.push(
          `\`${ev.variable.name}: ${ev.variable.type} → ${ev.variable.value}\``,
        );
      }
      if (ev.oldValue !== undefined) {
        lines.push(`old value: \`${safeStringify(ev.oldValue)}\``);
      }
      break;
    }
    case "expr":
    case "expression":
      if (ev.value !== undefined) {
        lines.push(`value: \`${safeStringify(ev.value)}\``);
      }
      break;
    case "call":
      lines.push(`callee: \`${ev.callee}\``);
      if (ev.value !== undefined) {
        lines.push(`value: \`${safeStringify(ev.value)}\``);
      }
      break;
    case "enter":
      lines.push(`function: \`${ev.function_name}\``);
      if (ev.args?.length) {
        lines.push("args:");
        for (const a of ev.args) {
          lines.push(`- \`${a.name}: ${a.type} = ${a.value}\``);
        }
      }
      break;
    case "exit":
      lines.push(`return value: \`${safeStringify(ev.returnVal)}\``);
      break;
    case "return":
      lines.push(`value: \`${safeStringify(ev.value)}\``);
      break;
    case "throw":
      lines.push(`error: \`${safeStringify(ev.error)}\``);
      break;
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
