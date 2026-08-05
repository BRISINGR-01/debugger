"use strict";

/**
 * Singleton event recorder.
 *
 * Written as CommonJS (.cjs) so it works identically from:
 *   - require("./recorder.cjs")                         (.cjs / .js under "type": "commonjs")
 *   - import { Recorder, getRecorder } from "./recorder.cjs"   (.js/.jsx/.ts under "type": "module", or bundlers)
 *
 * The instance is anchored on `globalThis.__recorder__` rather than a plain
 * module-level variable. This avoids the "dual package hazard": if
 * bundlers/Node ever load this file twice (once as CJS, once as ESM), a
 * module-level `let instance` would produce two different recorders. Keying
 * off globalThis guarantees a single shared instance no matter how many
 * times the module itself is evaluated.
 *
 * Note: this uses a plain string property (`__recorder__`) rather than a
 * Symbol.for(...) key, for easy inspection in devtools/REPL. The trade-off
 * is a (small) chance of colliding with some other script that also sets
 * globalThis.__recorder__. Switch to Symbol.for("app.recorder.instance")
 * if that's ever a concern.
 */

const GLOBAL_KEY = "__recorder__";

function now() {
  return (typeof performance !== "undefined" ? performance : Date).now();
}

class Recorder {
  #startTime;
  #setupPromise = null;
  queue = [];
  #id = 0;

  constructor(sink) {
    this.sink = sink;
    this.#startTime = now();
  }

  /**
   * Get the shared singleton, lazily creating a default sink if nothing was
   * configured yet. Default sink is:
   *   - ServerSink(process.env.RECORDER_URL) if that env var is set
   *   - LogFileSink(process.env.RECORDER_LOG_FILE) otherwise
   */
  static instance() {
    if (!globalThis[GLOBAL_KEY]) {
      const url =
        typeof process !== "undefined" &&
        process.env &&
        process.env.RECORDER_URL;
      const sink = url
        ? new ServerSink(url)
        : new LogFileSink(
            typeof process !== "undefined"
              ? process.env.RECORDER_LOG_FILE
              : undefined,
          );

      sink?.setUp();
      globalThis[GLOBAL_KEY] = new Recorder(sink);
    }

    return globalThis[GLOBAL_KEY];
  }

  /** Test-only helper to drop the singleton so it can be reconfigured. */
  static reset() {
    delete globalThis[GLOBAL_KEY];
  }

  async flush() {
    while (this.queue.length) {
      await this.sink.send(this.queue.shift());
    }
  }

  emit(event) {
    if (event.variable) {
      event.variable.value = JSON.stringify(event.variable.value);
    }
    if (event.oldValue) {
      event.oldValue = JSON.stringify(event.oldValue);
    }

    const ev = {
      time: +(now() - this.#startTime).toFixed(3),
      ...event,
    };
    this.queue.push(ev);
  }

  genId() {
    return "" + this.#id++;
  }
}

class LogFileSink {
  constructor(file = "") {
    // this.path = require("path");
    // this.fs = require("fs");

    this.file = file;
  }

  async setUp() {
    if (!this.file) {
      this.file = this.path.resolve(process.cwd(), ".trace", "log");
    }

    this.fs.mkdirSync(this.path.dirname(this.file), { recursive: true });

    await this.clear();
  }

  async send(ev) {
    try {
      this.fs.appendFileSync(this.file, JSON.stringify(ev) + "\n", "utf8");
      return null;
    } catch (error) {
      if (error instanceof Error) return error;
      if (typeof error === "string") return new Error(error);

      return new Error(`Could not log event to ${this.file}`);
    }
  }

  async clear() {
    fs.writeFileSync(this.file, "");
  }
}

class ServerSink {
  constructor(url) {
    this.url = url;
  }

  async setUp() {
    await this.clear();
  }

  async send(ev) {
    try {
      await fetch(`${this.url}/log`, {
        method: "POST",
        body: JSON.stringify(ev),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });

      return null;
    } catch (error) {
      if (error instanceof Error) return error;
      if (typeof error === "string") return new Error(error);

      return new Error(`Could not send event to "${this.url}/log"`);
    }
  }

  async clear() {
    await fetch(`${this.url}/clear`, { method: "DELETE" });
  }
}

if (!globalThis[GLOBAL_KEY]) {
  globalThis[GLOBAL_KEY] = Recorder.instance();
}

async function shutdown() {
  await Recorder.instance().flush();
  process.exit(0);
}

process.on("beforeExit", shutdown);
process.on("uncaughtException", shutdown);
process.on("unhandledRejection", shutdown);
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
