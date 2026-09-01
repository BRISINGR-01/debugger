import { EventsContainer } from "debugger";
import { Id, InstError, Loc, LogEvent } from "./json-spec";
import { getFile } from "./utils";
import path from "node:path";

/** Events in a specific file */
export default class EventManager {
  private eventContainer: EventsContainer;
  parseErrors: InstError[] = [];
  private srcRoot: string;

  constructor(events: EventsContainer, srcRoot: string) {
    this.eventContainer = events;
    this.srcRoot = srcRoot;
  }

  /** file -> line -> [multiline events that cover this line and single line events] */
  private byLine: Map<string, Map<number, LogEvent[]>> = new Map();

  /** ctx_id (file@<fn line>) -> index */
  private byCtx: Map<string, LogEvent[]> = new Map();

  get hasEvents() {
    return this.eventContainer.data.length !== 0;
  }

  get count() {
    return this.eventContainer.data.length;
  }

  addEvent(event: LogEvent) {
    if (event.event === "inst_error") {
      this.parseErrors.push(event);
      return;
    }

    if (!isValid(event)) {
      return;
    }

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
    file = path.relative(this.srcRoot, file);

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
    if (path.isAbsolute(file)) {
      file = path.relative(this.srcRoot, file);
    }

    let fileList = this.byLine.get(file);
    if (!fileList) {
      fileList = new Map();
      this.byLine.set(file, fileList);
    }

    let lineEvents = fileList.get(line);
    if (!lineEvents) {
      lineEvents = [];
      fileList.set(line, lineEvents);
    }

    return lineEvents;
  }

  getEventsFromCtx(ev: LogEvent) {
    return this.byCtx.get(ev.ctx_id)!;
  }

  get(i: number) {
    return this.eventContainer.data[i];
  }

  getEnters() {
    const list = [];

    for (const it of this.byCtx.entries()) {
      const [_, events] = it;
      const enter = events.find((e) => e.event === "enter");
      if (enter) list.push(enter);
    }

    return list;
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
    this.eventContainer.clear();
    this.parseErrors = [];
    this.byCtx = new Map();
    this.byLine = new Map();
  }
}

function isValidLoc(loc: Loc) {
  return (
    !isNaN(loc.start.line) &&
    !isNaN(loc.start.col) &&
    !isNaN(loc.end.line) &&
    !isNaN(loc.end.col)
  );
}

const isValidStr = (str: string) => typeof str === "string" && str.length !== 0;

function isValid(ev: LogEvent) {
  try {
    if (
      !/\w+\@\d+\:\d+/.test(ev.ctx_id) ||
      isNaN(ev.time) ||
      !isValidLoc(ev.loc)
    )
      return false;

    switch (ev.event) {
      case "call":
        return isValidStr(ev.callee) && isValidStr(ev.value);
      case "catch_enter":
        return isValidStr(ev.error);
      case "change":
        return (
          isValidStr(ev.old_val) &&
          isValidStr(ev.var.name) &&
          isValidStr(ev.var.type) &&
          isValidStr(ev.var.val)
        );
      case "declare":
        return (
          isValidStr(ev.var.name) &&
          isValidStr(ev.var.type) &&
          isValidStr(ev.var.val)
        );
      case "enter":
        return (
          isValidStr(ev.fn_name) &&
          ev.args.every(
            (a) =>
              isValidLoc(a.loc) &&
              isValidStr(a.name) &&
              isValidStr(a.type) &&
              isValidStr(a.val),
          )
        );
      case "exit":
        return !("return_val" in ev) || isValidStr(ev.return_val!);
      case "expr":
        return isValidStr(ev.val);
      case "throw":
        return isValidStr(ev.error);
      case "if":
        return typeof ev.isTruthy === "boolean";

      default:
        return false;
    }
  } catch (error) {
    console.error(error);
    return false;
  }
}
