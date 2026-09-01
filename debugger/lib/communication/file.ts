import { EventEmitter } from "events";
import fs from "fs";
import type Sink from "./sink.ts";
import { type Config } from "../config.ts";
import EventsContainer from "./eventsContainer.ts";

export default class File extends EventEmitter implements Sink {
  path: string;
  paused = false;
  events: EventsContainer;

  private offset = 0;
  private buffer = "";
  private timer?: ReturnType<typeof setInterval>;

  constructor(events: EventsContainer, config: Config) {
    super();

    this.events = events;
    this.path = config.ioFilePath!;
  }

  async start() {
    this.emit("ready");

    // Check frequently for appended data.
    this.timer = setInterval(() => {
      void this.readNewData();
    }, 10);
  }

  private async readNewData() {
    if (this.paused) return;

    let stat: fs.Stats;

    try {
      stat = await fs.promises.stat(this.path);
    } catch (err) {
      this.emit("error", err);
      return;
    }

    // File was truncated/recreated.
    if (stat.size < this.offset) {
      this.offset = 0;
      this.buffer = "";
      this.emit("clear");
    }

    if (stat.size === this.offset) {
      return;
    }

    const stream = fs.createReadStream(this.path, {
      start: this.offset,
      end: stat.size - 1,
    });

    for await (const chunk of stream) {
      this.offset += chunk.length;

      this.buffer += chunk.toString("utf8");

      const lines = this.buffer.split(/\r?\n/);

      // Keep incomplete line.
      this.buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;

        this.send(line);
      }
    }
  }

  private send(str: string) {
    try {
      this.emit("data", JSON.parse(str));
    } catch (err) {
      this.emit("error", err);
    }
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async clear() {
    this.paused = true;

    try {
      fs.writeFileSync(this.path, "");
    } finally {
      this.paused = false;
    }

    this.offset = 0;
    this.buffer = "";

    this.emit("clear");
  }
}
