import { EventEmitter } from "events";
import fs from "fs";
import type Sink from "./sink.ts";
import Config from "../config.ts";
import type { LogEvent } from "../../../json-spec.ts";

export default class File extends EventEmitter implements Sink {
  data: LogEvent[];
  path;
  watcher?: fs.StatWatcher;

  constructor(data: LogEvent[], path: string) {
    super();
    this.data = data;
    this.path = path;
  }

  async start() {
    if (this.path && !fs.existsSync(this.path)) fs.writeFileSync(this.path, "");
    this.startWatcher();
    this.emit("ready");
  }

  applyConfig(config: Config): void {
    this.path = config.data.ioFilePath!;
  }

  async stop(): Promise<void> {
    if (this.watcher) this.watcher.removeAllListeners();
  }

  clear(): void {
    fs.writeFileSync(this.path, "");
  }

  startWatcher() {
    const stream = fs.createReadStream(this.path, { encoding: "utf-8" });
    stream.on("data", (chunk) => {
      console.log(chunk);
    });
    // if (this.watcher) this.watcher.removeAllListeners();

    // this.watcher = fs.watchFile(this.path, (curr, prev) => {
    //   curr;
    //   // this.emit("", { curr: this.data, prev: oldData });
    // });
  }
}
