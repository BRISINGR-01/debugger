import { EventEmitter } from "events";
import { type LogEvent } from "../../../json-spec.ts";

export default class EventsContainer extends EventEmitter {
  data: LogEvent[] = [];

  add(ev: LogEvent) {
    this.data.push(ev);
    this.emit("data", ev);
  }

  clear() {
    this.data.length = 0;
  }
}
