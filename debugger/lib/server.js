import { EventEmitter } from "node:events";
import path from "node:path";
import { setupDebugDir } from "./instrument.js";
import { run, killChild } from "./runner.js";
import { watchChanges } from "./watcher.js";
import HTTPServer from "./httpServer.js";
import fs from "fs";
import { isDev } from "./utils.js";

export default class Debugger extends EventEmitter {
  #child;
  #watcher;
  #restartTimer;
  #sourceDir;
  #debugDir;
  #command;
  #exclude;
  #shouldRestart;
  #singleRun;
  #httpServer;
  data = [];

  constructor(options) {
    super();
    this.#command = options.command;
    if (!this.#command) throw new Error("No command was provided");

    this.#sourceDir = path.resolve(options.path ?? process.cwd());
    this.#exclude = options.exclude ?? [];
    this.#shouldRestart = options.shouldRestart ?? true;
    this.#singleRun = options.singleRun ?? false;
    this.#httpServer = new HTTPServer(this.data, options.port ?? 5634);
  }

  async start() {
    await this.#httpServer.start();
    this.#httpServer.on("data", (data) => {
      if (isDev()) {
        fs.writeFileSync(
          "/home/alex/Desktop/VSC/debugger/debugger/lib/dev-log.json",
          JSON.stringify(this.data),
        );
      }
      this.emit("data", data);
    });
    this.#httpServer.on("clear", () => this.emit("clear"));
    this.#httpServer.on("ready", () => this.emit("ready"));

    this.#debugDir = setupDebugDir(this.#sourceDir, this.#exclude);

    this.#spawn();
    if (!this.#singleRun) {
      this.#watcher = watchChanges({
        sourceDir: this.#sourceDir,
        debugDir: this.#debugDir,
        excludePatterns: this.#exclude,
        onChange: () => {
          if (this.#shouldRestart) this.#scheduleRestart();
        },
      });
    }

    return this;
  }

  async stop() {
    clearTimeout(this.#restartTimer);
    killChild(this.#child);
    if (this.#watcher) {
      await this.#watcher.close();
      this.#watcher = null;
    }
    await this.#httpServer.stop();
  }

  #spawn() {
    this.#child = run(this.#command, this.#debugDir);
    this.#child.on("exit", (code) => this.emit("exit", code));
  }

  #scheduleRestart() {
    clearTimeout(this.#restartTimer);
    this.#restartTimer = setTimeout(() => {
      killChild(this.#child);
      this.#spawn();
    }, 100);
  }
}
