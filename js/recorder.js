import path from "path";
import fs from "fs";

function now() {
  return (performance ?? Date).now();
}
class Recorder {
  _startTime;

  constructor(sink) {
    this.sink = sink;
    this._startTime = now();
  }

  setUp() {
    return this.sink.setUp();
  }

  emit(event) {
    const ev = {
      time: +(now() - this._startTime).toFixed(3),
      ...event,
    };
    this.sink.send(ev);
  }

  parseObject(obj) {
    let newVal = JSON.stringify(obj);

    if (obj && typeof obj === "object" && obj.constructor.name !== "Object") {
      newVal = obj.constructor.name + "{}";
    }

    return newVal;
  }
}

class LogFileSink {
  constructor(file = "") {
    this.file = file;
  }

  async setUp() {
    if (!this.file) {
      this.file = path.resolve(path.dirname(__dirname), ".trace", "log");
    }

    if (!fs.existsSync(this.file)) {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
    }

    await this.clear();
  }

  async send(ev) {
    try {
      fs.appendFileSync(this.file, JSON.stringify(ev) + "\n", "utf8");
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
      fetch(`${this.url}/log`, {
        method: "POST",
        body: JSON.stringify(ev),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });

      return null;
    } catch (error) {
      console.error(error);

      if (error instanceof Error) return error;
      if (typeof error === "string") return new Error(error);

      return new Error(`Could not send event to "${this.url}/log"`);
    }
  }

  async clear() {
    fetch(`${this.url}/clear`, { method: "DELETE" });
  }
}

const sink = new ServerSink("http://127.0.0.1:8000");
sink.setUp();
const __recorder__ = new Recorder(sink);

globalThis.__recorder__ = __recorder__;
// module.exports = globalThis.__recorder__;
