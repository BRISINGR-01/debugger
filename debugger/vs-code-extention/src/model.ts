import * as path from "path";
import { TraceEvent, ParsedLocation } from "./types";
import { parseLog, parseLoc } from "./logParser";
import { LogEvent } from "./json-spec";

function normalizePath(p: string): string {
  return path.normalize(p);
}

/** Binary search: index of the last element in `sorted` that is <= target, or -1. */
function lastIndexLTE(sorted: number[], target: number): number {
  let lo = 0;
  let hi = sorted.length - 1;
  let result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= target) {
      result = sorted[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}

export class TraceModel {
  events: TraceEvent[] = [];
  locations: (ParsedLocation | undefined)[] = [];
  parseErrors: { chunk: string; message: string }[] = [];

  /** normalized file path -> (0-based line -> sorted ascending global event indices) */
  private byFile: Map<string, Map<number, number[]>> = new Map();

  /** Current position in `events`. -1 means "before everything" (no trace loaded/at start). */
  currentIndex = -1;

  get loaded(): boolean {
    return this.events.length > 0;
  }

  loadFromText(text: string): void {
    // const { events, errors } = parseLog(text);
    const events = JSON.parse(text) as LogEvent[];
    this.parseErrors = [];

    // Sort by time when present; fall back to file order, stable.
    const withOrder = events.map((e, i) => ({ e, i }));
    withOrder.sort((a, b) => {
      const at = typeof a.e.time === "number" ? a.e.time : a.i;
      const bt = typeof b.e.time === "number" ? b.e.time : b.i;
      return at - bt || a.i - b.i;
    });

    this.events = withOrder.map((x) => x.e);
    this.locations = this.events.map((e) => parseLoc(e.loc));
    this.byFile = new Map();

    this.locations.forEach((loc, idx) => {
      if (!loc) {
        return;
      }
      const key = normalizePath(loc.file);
      let fileMap = this.byFile.get(key);
      if (!fileMap) {
        fileMap = new Map();
        this.byFile.set(key, fileMap);
      }
      let arr = fileMap.get(loc.line);
      if (!arr) {
        arr = [];
        fileMap.set(loc.line, arr);
      }
      arr.push(idx);
    });

    this.currentIndex = this.events.length - 1;
  }

  clear(): void {
    this.events = [];
    this.locations = [];
    this.byFile.clear();
    this.currentIndex = -1;
    this.parseErrors = [];
  }

  /** All events recorded for a given (0-based) line in a file, in chronological order. */
  getLineHistory(filePath: string, line: number): number[] {
    const fileMap = this.byFile.get(normalizePath(filePath));
    return fileMap?.get(line) ?? [];
  }

  /** For every traced line in `filePath`, the most recent event index at/before the cursor. */
  getCurrentStateForFile(filePath: string): Map<number, number> {
    const result = new Map<number, number>();
    const fileMap = this.byFile.get(normalizePath(filePath));
    if (!fileMap) {
      return result;
    }
    for (const [line, indices] of fileMap.entries()) {
      const idx = lastIndexLTE(indices, this.currentIndex);
      if (idx !== -1) {
        result.set(line, idx);
      }
    }
    return result;
  }

  hasFile(filePath: string): boolean {
    return this.byFile.has(normalizePath(filePath));
  }

  stepForward(): boolean {
    if (this.currentIndex < this.events.length - 1) {
      this.currentIndex++;
      return true;
    }
    return false;
  }

  stepBackward(): boolean {
    if (this.currentIndex > -1) {
      this.currentIndex--;
      return true;
    }
    return false;
  }

  jumpToStart(): void {
    this.currentIndex = -1;
  }

  jumpToEnd(): void {
    this.currentIndex = this.events.length - 1;
  }

  jumpTo(index: number): void {
    this.currentIndex = Math.max(-1, Math.min(index, this.events.length - 1));
  }
}
