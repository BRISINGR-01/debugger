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
  #id = 1; // 0 is global

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
      const sink = new ServerSink(url ?? "http://localhost:8000");

      sink.setUp();
      globalThis[GLOBAL_KEY] = new Recorder(sink);
    }

    return globalThis[GLOBAL_KEY];
  }

  /** Test-only helper to drop the singleton so it can be reconfigured. */
  static reset() {
    delete globalThis[GLOBAL_KEY];
  }

  async flush() {
    console.log(JSON.stringify(this.queue));

    while (this.queue.length) {
      await this.sink.send(this.queue.shift());
    }
  }

  emit(event) {
    let valueToReturn = event.value ?? event.error;
    if (event.variable) {
      valueToReturn = event.variable.value;
      event.variable.value = serialize(event.variable.value);
    }
    if (event.error) event.error = serialize(event.error);

    this.queue.push({
      time: +(now() - this.#startTime).toFixed(3),
      ...event,
    });

    return valueToReturn;
  }

  genId() {
    return "" + this.#id++;
  }
}

const isObj = (o) => o != null && typeof o === "object";

function serialize(obj, depth = 2) {
  if (typeof obj === "function") return "Function() { [native code] }";
  if (!isObj(obj)) return JSON.stringify(obj);

  if (Array.isArray(obj)) {
    const res = [];
    for (let i = 0; i < obj.length; i++) {
      res[i] = serialize(obj[i]);
    }

    return JSON.stringify(res);
  }
  if (Error.isError(obj)) return obj.toString();

  const name = obj.constructor.name;

  let res = `${name === "Object" ? "" : `${name} `} {\n`;
  for (const key in obj) {
    if (!Object.hasOwn(obj, key)) continue;

    const val = obj[key];
    res += `${" ".repeat(depth)}${key}: ${serialize(val, depth + 2)}`;
  }

  return res + "\n}";
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

async function shutdown(e) {
  console.error(e);

  await Recorder.instance().flush();
  process.exit(0);
}

process.on("beforeExit", shutdown);
process.on("uncaughtException", shutdown);
process.on("unhandledRejection", shutdown);
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
