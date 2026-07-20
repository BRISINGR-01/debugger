const fs = require("fs");
const path = require("path");

class Recorder {
  constructor() {
    const logPath = path.resolve(path.dirname(__dirname), ".trace", "log");
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.writeFileSync(logPath, "");
    this._logFile = logPath;

    this.events = [];
    this._startTime = this.now();
  }

  now() {
    return (performance ?? Date).now();
  }

  emit(event) {
    const ev = {
      time: +(this.now() - this._startTime).toFixed(3),
      ...event,
    };
    this.events.push(ev);
    this.appendLog(ev);
  }

  print() {
    let depth = 0;
    const indent = (d) => "  ".repeat(d);
    const dim = (s) =>
      typeof process !== "undefined" && process.stdout?.hasColors?.()
        ? `\x1b[2m${s}\x1b[0m`
        : s;
    const color = (code, s) =>
      typeof process !== "undefined" && process.stdout?.hasColors?.()
        ? `\x1b[${code}m${s}\x1b[0m`
        : s;

    console.log("\n── Recorder trace ────────────────────────────────────────");

    for (const e of this.events) {
      const t = `[+${String(e.time).padStart(7)}ms]`;
      switch (e.type) {
        case "enter": {
          const args = Object.entries(e.args)
            .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
            .join(", ");
          console.log(
            `${dim(t)} ${indent(depth)}${color("36", "→")} ${color("1", e.function)}(${args})`,
          );
          depth++;
          break;
        }
        case "exit": {
          depth = Math.max(0, depth - 1);
          const ret =
            e.returnVal === undefined
              ? ""
              : ` ↩ ${JSON.stringify(e.returnVal)}`;
          console.log(
            `${dim(t)} ${indent(depth)}${color("32", "←")} ${color("2", e.function)}${color("32", ret)}`,
          );
          break;
        }
        case "declare": {
          console.log(
            `${dim(t)} ${indent(depth)}${color("33", "≔")} ${e.variable}: ` +
              color("33", this.parseObject(e.newValue)),
          );
          break;
        }
        case "assign": {
          console.log(
            `${dim(t)} ${indent(depth)}${color("33", "≔")} ${e.variable}: ` +
              `${color("2", this.parseObject(e.oldValue))} → ${color("33", this.parseObject(e.newValue))}`,
          );
          break;
        }
        case "throw": {
          depth = Math.max(0, depth - 1);
          console.log(
            `${dim(t)} ${indent(depth)}${color("31", "✖")} throw ${e.error instanceof Error ? e.error.message : JSON.stringify(e.error)}`,
          );
          break;
        }
      }
    }
    console.log("──────────────────────────────────────────────────────────\n");
  }

  appendLog(ev) {
    fs.appendFileSync(this._logFile, JSON.stringify(ev) + "\n", "utf8");
  }

  /**
   * Summary stats: calls per function, total time inside each.
   */
  summary() {
    const calls = {};
    const starts = {};
    for (const e of this.events) {
      if (e.type === "enter") {
        calls[e.function] = (calls[e.function] || 0) + 1;
        starts[e.function] = e.time;
      }
      if (e.type === "exit" && starts[e.function] !== undefined) {
        const duration = e.time - starts[e.function];
        // accumulate
        calls[e.function + "_ms"] = (calls[e.function + "_ms"] || 0) + duration;
        delete starts[e.function];
      }
    }

    console.log("\n── Summary ───────────────────────────────────────────────");
    const fns = Object.keys(calls).filter((k) => !k.endsWith("_ms"));
    for (const fn of fns) {
      const count = calls[fn];
      const ms = calls[fn + "_ms"];
      const msStr = ms !== undefined ? ` (${ms.toFixed(2)}ms total)` : "";
      console.log(`  ${fn}: ${count} call${count > 1 ? "s" : ""}${msStr}`);
    }
    console.log("──────────────────────────────────────────────────────────\n");
  }

  close() {
    fs.closeSync(this._logFile);
  }

  parseObject(obj) {
    let newVal = JSON.stringify(obj);

    if (obj && typeof obj === "object" && obj.constructor.name !== "Object") {
      newVal = obj.constructor.name + "{}";
    }

    return newVal;
  }
}

const __recorder__ = new Recorder();
globalThis.__recorder__ = __recorder__;

// In Node.js: auto-print on exit
if (typeof process !== "undefined") {
  process.on("exit", () => {
    if (globalThis.__recorder__.events.length > 0) {
      globalThis.__recorder__.print();
      globalThis.__recorder__.summary();
    }
  });
}

module.exports = globalThis.__recorder__;
