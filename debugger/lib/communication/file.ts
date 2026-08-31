import chokidar, { FSWatcher } from "chokidar";
import { EventEmitter } from "events";
import fs, { Stats } from "fs";
import type Sink from "./sink.ts";
import { type Config } from "../config.ts";
import type { LogEvent } from "../../../json-spec.ts";

export default class File extends EventEmitter implements Sink {
  data: LogEvent[];
  path: string;
  watcher: FSWatcher;
  offset = 0;
  paused = false;
  url: URL;

  constructor(data: LogEvent[], config: Config) {
    super();

    this.data = data;
    this.path = config.ioFilePath!;
    this.watcher = chokidar.watch(this.path);
    this.url = new URL(`http://localhost:${config.httpPort}`);
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

    const stream = fs.createReadStream(this.path, {
      start: this.offset,
      end: stat.size - 1,
    });

    let bytesRead = 0;

    stream.on("data", (chunk: Buffer) => {
      bytesRead += chunk.length;

      chunk.forEach((b) => this.send(b.toString()));
    });

    stream.on("end", () => (this.offset += bytesRead));
    stream.on("error", console.error);
  }

  async send(ev: string) {
    fetch(`${this.url}/log`, {
      method: "POST",
      body: JSON.stringify(ev),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });
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
    this.data.length = 0;
  }
}
