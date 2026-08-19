import WebSocket from "ws";
import * as path from "path";
import { TraceEvent, ParsedLocation } from "./types";
import { parseLoc } from "./logParser";
import { InstError, LogEvent } from "./json-spec";

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
  parseErrors: InstError[] = [];

  baseDir: string = "";

  /** normalized file path -> (0-based line -> sorted ascending global event indices) */
  private byFile: Map<string, Map<number, number[]>> = new Map();

  /** normalized file path -> global event indices whose range spans multiple lines */
  private byFileMulti: Map<string, number[]> = new Map();

  /** normalized file path -> all event indices for that file, ascending */
  private fileEvents: Map<string, number[]> = new Map();

  /** Current position in `events`. -1 means "before everything" (no trace loaded/at start). */
  currentIndex = -1;

  get loaded(): boolean {
    return this.events.length > 0;
  }

  addEvent(event: LogEvent) {
    if (event.event === "inst_error") this.parseErrors.push(event);

    let evIdx = 0;
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (this.events[i].time < event.time) {
        evIdx = i + 1;
        break;
      }
    }
    this.events.splice(evIdx, 0, event);

    const loc = parseLoc(event.loc);
    if (!loc) return;

    this.locations.push(loc);
    const idx = this.locations.length - 1;

    const key = this.normalizePath(loc.file);

    let fileMap = this.byFile.get(key);
    if (!fileMap) {
      fileMap = new Map();
      this.byFile.set(key, fileMap);
    }

    let lineLocIndices = fileMap.get(loc.line);
    if (!lineLocIndices) {
      lineLocIndices = [];
      fileMap.set(loc.line, lineLocIndices);
    }
    lineLocIndices.push(idx);

    if (loc.endLine > loc.line) {
      let multi = this.byFileMulti.get(key);
      if (!multi) {
        multi = [];
        this.byFileMulti.set(key, multi);
      }
      multi.push(idx);
    }

    let fe = this.fileEvents.get(key);
    if (!fe) {
      fe = [];
      this.fileEvents.set(key, fe);
    }
    fe.push(idx);
  }

  clear(): void {
    this.events = [];
    this.locations = [];
    this.byFile.clear();
    this.byFileMulti.clear();
    this.fileEvents.clear();
    this.currentIndex = -1;
    this.parseErrors = [];
  }

  /** All event indices recorded for a file, ascending (matches `events` order). */
  getFileEventIndices(filePath: string): number[] {
    return this.fileEvents.get(this.normalizePath(filePath)) ?? [];
  }

  /** All events recorded for a given (0-based) line in a file, in chronological order. */
  getLineHistory(filePath: string, line: number): number[] {
    const fileMap = this.byFile.get(this.normalizePath(filePath));
    return fileMap?.get(line) ?? [];
  }

  normalizePath(p: string): string {
    return path.basename(p);
  }

  /**
   * All event indices whose recorded range covers the position (0-based line
   * and character), regardless of which line the event starts on.
   */
  getEventsAt(filePath: string, line: number, character: number): number[] {
    const file = this.normalizePath(filePath);
    const result: number[] = [];

    const startIdices = this.byFile.get(file)?.get(line);
    if (startIdices) {
      for (const idx of startIdices) {
        const loc = this.locations[idx];
        if (loc && character >= loc.column && character < loc.endColumn) {
          result.push(idx);
        }
      }
    }

    const multi = this.byFileMulti.get(file);
    if (multi) {
      for (const idx of multi) {
        const loc = this.locations[idx];
        if (!loc) continue;
        if (line < loc.line || line > loc.endLine) continue;
        if (line === loc.line && character < loc.column) continue;
        if (line === loc.endLine && character >= loc.endColumn) continue;
        result.push(idx);
      }
    }

    return result;
  }

  /** For every traced line in `filePath`, the most recent event index at/before the cursor. */
  getCurrentStateForFile(filePath: string): Map<number, number> {
    const result = new Map<number, number>();
    const fileMap = this.byFile.get(this.normalizePath(filePath));
    if (!fileMap) return result;

    for (const [line, indices] of fileMap.entries()) {
      const idx = lastIndexLTE(indices, this.currentIndex);
      if (idx !== -1) result.set(line, idx);
    }

    return result;
  }

  hasFile(filePath: string): boolean {
    return this.byFile.has(this.normalizePath(filePath));
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
