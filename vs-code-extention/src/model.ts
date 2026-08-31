import { LogEvent } from "./json-spec";
import EventContainer from "./eventContainer";
import { getFile } from "./utils";

export class TraceModel {
  events = new EventContainer();

  /** Current position in `events`. -1 means "before everything" (no trace loaded/at start). */
  currentIndex = -1;

  constructor(public srcRoot: string) {}

  get loaded(): boolean {
    return this.events.hasEvents;
  }

  clear(): void {
    this.events.clear();
    this.currentIndex = -1;
  }

  /** All events recorded for a given (0-based) line in a file, in chronological order. */
  getLineHistory(file: string, line: number): LogEvent[] {
    return this.events.getEventsAtLine(file, line);
  }

  /**
   * All event indices whose recorded range covers the position (0-based line
   * and character), regardless of which line the event starts on.
   */
  getEventsAt(filePath: string, line: number, character: number): LogEvent[] {
    return this.events.getEventsAt(filePath, line, character);
  }

  stepForward(): boolean {
    if (this.currentIndex < this.events.events.length - 1) {
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
    this.currentIndex = this.events.events.length - 1;
  }

  jumpTo(index: number): void {
    this.currentIndex = Math.max(
      -1,
      Math.min(index, this.events.events.length - 1),
    );
  }
}
