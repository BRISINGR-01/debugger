import chokidar, { FSWatcher } from "chokidar";
import { EventEmitter } from "events";
import fs, { Stats } from "fs";
import type Sink from "./sink.ts";
import { type Config } from "../config.ts";
import type { LogEvent } from "../../../json-spec.ts";
import EventsContainer from "./eventsContainer.ts";

export default class File extends EventEmitter implements Sink {
  path: string;
  watcher: FSWatcher;
  offset = 0;
  paused = false;
  stream?: fs.ReadStream;
  events: EventsContainer;
  leftOver: string = "";

  constructor(events: EventsContainer, config: Config) {
    super();

    this.events = events;
    this.path = config.ioFilePath!;
    this.watcher = chokidar.watch(this.path);
  }

  async start() {
    this.watcher.on("change", (file, stat) => this.readNewData(stat));
    this.watcher.on("ready", () => this.emit("ready"));
  }

  private readNewData(stat?: Stats) {
    if (this.paused) return;

    stat ??= fs.statSync(this.path);

    // File was truncated/cleared.
    if (stat.size < this.offset) return this.clear();
    if (stat.size === this.offset) return;

    if (this.stream) this.stream.destroy();

    this.stream = fs.createReadStream(this.path, {
      start: this.offset,
      end: stat.size - 1,
    });

    this.stream.on("data", (chunk: Buffer) => {
      this.offset += chunk.byteLength;

      const data = (this.leftOver + chunk.toString()).split("\n");
      this.leftOver = "";
      for (let i = 0; i < data.length; i++) {
        if (i === data.length - 1 && !data[i].endsWith("\n")) {
          this.leftOver = data[i];
          continue;
        }

        this.send(data[i]);
      }
    });

    this.stream.on("error", (err) => this.emit("error", err));
  }

  private send(str: string) {
    try {
      this.emit("data", JSON.parse(str));
    } catch (err) {
      this.emit("error", err);
    }
  }

  async stop(): Promise<void> {
    await this.watcher.close();
  }

  async clear() {
    this.paused = true;
    fs.writeFileSync(this.path, "");
    this.paused = false;

    this.emit("clear");
    this.offset = 0;
  }
}
