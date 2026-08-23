import { EventEmitter } from "node:events";
import path from "node:path";
import { setupDebugDir } from "./instrument.ts";
import { run, killChild } from "./runner.ts";
import { watchChanges } from "./watcher.ts";
import HTTPServer from "./communication/httpServer.ts";
import fs from "fs";
import { isDev } from "./utils.ts";
import Config from "./config.ts";
import { FSWatcher } from "chokidar";
import { ChildProcess } from "node:child_process";
import type { LogEvent } from "../../json-spec.ts";
import type Sink from "./communication/sink.ts";
import File from "./communication/file.ts";

export default class Debugger extends EventEmitter {
  child?: ChildProcess;
  watcher?: FSWatcher;
  restartTimer: NodeJS.Timeout | undefined;
  sourceDir: string;
  debugDir: string = "";
  data: LogEvent[] = [];

  sink: Sink;
  config: Config;

  constructor(options: {
    srcRoot: string;
    command?: string;
    excludePattern: string[];
    shouldRestart?: boolean;
    shouldWatch?: boolean;
    httpPort?: number;
  }) {
    super();
    this.sourceDir = path.resolve(options.srcRoot ?? process.cwd());
    this.config = new Config(options);
    // this.sink = new HTTPServer(this.data);
    this.sink = new File(this.data, "");
  }

  async start() {
    this.debugDir = setupDebugDir(this.sourceDir, this.config);
    this.sink.applyConfig(this.config);

    await this.sink.start();
    this.sink.on("data", (data: LogEvent) => {
      if (isDev()) {
        fs.writeFileSync(
          "/home/alex/Desktop/VSC/debugger/debugger/lib/dev-log.tson",
          JSON.stringify(this.data),
        );
      }
      this.emit("data", data);
    });
    this.sink.on("clear", () => this.emit("clear"));
    this.sink.on("ready", () => this.emit("ready"));

    this.spawn();
    if (this.config.data.shouldWatch) {
      this.watcher = watchChanges(
        this.sourceDir,
        this.debugDir,
        this.config.data.excludePattern,
        () => {
          if (this.config.data.shouldRestart) this.scheduleRestart();
        },
      );
    }

    return this;
  }

  async stop() {
    clearTimeout(this.restartTimer);
    killChild(this.child);
    if (this.watcher) await this.watcher.close();
    await this.sink.stop();
  }

  private spawn() {
    if (!this.config.data.command) return;

    this.child = run(this.config.data.command, this.debugDir);
    this.child.on("exit", (code: number) => this.emit("exit", code));
  }

  private scheduleRestart() {
    clearTimeout(this.restartTimer);
    this.restartTimer = setTimeout(() => {
      killChild(this.child);
      this.spawn();
    }, 100);
  }
}
