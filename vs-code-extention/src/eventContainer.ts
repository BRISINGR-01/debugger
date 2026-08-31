import { Id, InstError, LogEvent } from "./json-spec";
import { getFile } from "./utils";

/** Events in a specific file */
export default class EventContainer {
  events: LogEvent[] = [];
  parseErrors: InstError[] = [];

  /** file -> line -> [multiline events that cover this line and single line events] */
  private byLine: Map<string, LogEvent[][]> = new Map();

  /** ctx_id (file@<fn line>) -> index */
  private byCtx: Map<string, LogEvent[]> = new Map();

  get hasEvents() {
    return this.events.length !== 0;
  }

  addEvent(event: LogEvent) {
    if (event.event === "inst_error") {
      this.parseErrors.push(event);
      return;
    }

    this.events.push(event);

    let ctxArr = this.byCtx.get(event.ctx_id);
    if (!ctxArr) {
      ctxArr = [];
      this.byCtx.set(event.ctx_id, ctxArr);
    }
    ctxArr.push(event);

    const file = getFile(event);
    const loc = event.loc;

    if (loc.start.line === loc.end.line) {
      const lineEvents = this.getEventsAtLine(file, loc.start.line);
      let locIdx = lineEvents.length - 1;
      for (let i = 0; i < lineEvents.length; i++) {
        if (lineEvents[i].loc.start.col > loc.start.col) {
          locIdx = i;
          break;
        }
      }

      lineEvents.splice(locIdx, 0, event);
    } else {
      for (let i = loc.start.line; i < loc.end.line; i++) {
        this.getEventsAtLine(file, i).push(event);
      }
    }
  }

  getFileEvents(file: string): LogEvent[] {
    const list = [];

    for (const it of this.byCtx.entries()) {
      const [ctx_id, events] = it;
      if (getFile({ ctx_id }) === file) {
        list.push(...events);
      }
    }

    return list;
  }

  getEventsAt(file: string, line: number, col: number): LogEvent[] {
    return this.getEventsAtLine(file, line).filter((ev) => {
      if (ev.loc.start.line !== ev.loc.end.line) return true;

      return ev.loc.start.col <= col && col <= ev.loc.end.col;
    });
  }

  getEventsAtLine(file: string, line: number): LogEvent[] {
    let fileList = this.byLine.get(file);
    if (!fileList) {
      fileList = [];
      this.byLine.set(file, fileList);
    }

    let lineEvents = fileList[line];
    if (!lineEvents) {
      lineEvents = [];
      fileList[line] = lineEvents;
    }

    return lineEvents;
  }

  getEventsFromCtx(ev: LogEvent) {
    return this.byCtx.get(ev.ctx_id)!;
  }

  get(i: number) {
    return this.events[i];
  }

  findEntersForFn(ev: LogEvent) {
    const key = ev.ctx_id.split(":")[0];
    const list = [];

    for (const it of this.byCtx.entries()) {
      const [ctx_id, events] = it;
      if (key === ctx_id.split(":")[0]) {
        const enter = events.find((e) => e.event === "enter");
        if (enter) list.push(enter);
      }
    }

    return list;
  }

  findExitIdx(id: Id) {
    const events = this.byCtx.get(id);
    if (!events) return null;

    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].event === "exit") return i;
    }

    return null;
  }

  clear() {
    this.events = [];
    this.parseErrors = [];
    this.byCtx = new Map();
    this.byLine = new Map();
  }
}
