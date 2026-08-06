import * as vm from 'vm';
import { TraceEvent } from './types';

/**
 * The log is a sequence of JS object-literal values (as produced by something
 * like console.log(obj) called repeatedly) — not valid JSON (unquoted keys,
 * single-quoted strings, no top-level array/commas between entries). This
 * scans the raw text and splits it into the top-level `{ ... }` chunks,
 * respecting string boundaries so braces inside strings don't confuse it.
 */
export function splitObjects(text: string): string[] {
  const chunks: string[] = [];
  let depth = 0;
  let start = -1;
  let inString: false | '\'' | '"' | '`' = false;
  let escape = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === inString) {
        inString = false;
      }
      continue;
    }

    if (ch === '\'' || ch === '"' || ch === '`') {
      inString = ch;
      continue;
    }

    if (ch === '{') {
      if (depth === 0) {
        start = i;
      }
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        chunks.push(text.slice(start, i + 1));
        start = -1;
      } else if (depth < 0) {
        // Unbalanced input; reset so we don't cascade errors.
        depth = 0;
        start = -1;
      }
    }
  }

  return chunks;
}

/**
 * Evaluates a single `{ ... }` chunk as a JS expression. This is intentionally
 * permissive (unquoted keys, single/double/backtick strings, trailing commas,
 * nested objects/arrays, numbers) since it just runs the literal as JS in an
 * isolated, empty VM context. The chunk is expected to be the user's own trace
 * output, not untrusted input.
 */
export function parseChunk(chunk: string): TraceEvent {
  const script = new vm.Script('(' + chunk + '\n)');
  const context = vm.createContext(Object.create(null));
  const result = script.runInContext(context, { timeout: 1000 });
  return result as TraceEvent;
}

export interface ParseResult {
  events: TraceEvent[];
  errors: { chunk: string; message: string }[];
}

export function parseLog(text: string): ParseResult {
  const chunks = splitObjects(text);
  const events: TraceEvent[] = [];
  const errors: { chunk: string; message: string }[] = [];

  for (const chunk of chunks) {
    try {
      const obj = parseChunk(chunk);
      if (obj && typeof obj === 'object' && typeof obj.event === 'string') {
        events.push(obj);
      } else {
        errors.push({ chunk, message: 'Parsed value has no string "event" field' });
      }
    } catch (e) {
      errors.push({ chunk, message: e instanceof Error ? e.message : String(e) });
    }
  }

  return { events, errors };
}

export function parseLoc(loc?: string): { file: string; line: number; column: number } | undefined {
  if (!loc) {
    return undefined;
  }
  // Matches "/path/to/file.ts:87:2" — also tolerant of Windows drive letters
  // like "C:\foo\bar.ts:87:2" since we anchor on the LAST two ":<number>" groups.
  const m = /^(.*):(\d+):(\d+)$/.exec(loc);
  if (!m) {
    return undefined;
  }
  return {
    file: m[1],
    line: parseInt(m[2], 10) - 1,
    column: parseInt(m[3], 10) - 1
  };
}
