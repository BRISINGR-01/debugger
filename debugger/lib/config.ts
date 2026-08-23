import { EventEmitter } from "events";
import fs from "fs";
import path from "path";

export default class Config extends EventEmitter {
  data: {
    httpPort: number;
    ioFilePath?: string;
    command?: string;
    excludePattern: string[];
    shouldRestart?: boolean;
    shouldWatch?: boolean;
  } = {
    httpPort: 5634,
    excludePattern: [],
  };
  file: string = "";
  watcher?: fs.StatWatcher;

  constructor(options: {
    command?: string;
    excludePattern: string[];
    shouldRestart?: boolean;
    shouldWatch?: boolean;
    httpPort?: number;
  }) {
    super();
    this.data = {
      command: options.command,
      ioFilePath: undefined,
      excludePattern: options.excludePattern ?? [],
      shouldRestart: options.shouldRestart ?? true,
      shouldWatch: options.shouldWatch ?? false,
      httpPort: options.httpPort ?? 5634,
    };
  }

  setup(debugDir: string) {
    this.file = path.join(debugDir, ".dbg-config.json");
    this.data.ioFilePath = path.join(debugDir, ".dbg-socket");

    if (fs.existsSync(this.file)) {
      this.load();
    } else {
      this.save();
    }

    this.watcher = fs.watchFile(this.file, () => {
      const oldData = structuredClone(this.data);
      this.load();
      this.emit("change", { curr: this.data, prev: oldData });
    });
  }

  load() {
    try {
      const loaded = fs
        .readFileSync(this.file)
        .toJSON() as unknown as typeof this.data;
      if (loaded && typeof loaded === "object") {
        this.data = {
          command: loaded.command,
          ioFilePath: loaded.ioFilePath,
          excludePattern: loaded.excludePattern ?? [],
          shouldRestart: loaded.shouldRestart ?? true,
          shouldWatch: loaded.shouldWatch ?? false,
          httpPort: loaded.httpPort ?? 5634,
        };
      }
    } catch {}
  }

  save() {
    fs.writeFileSync(this.file, JSON.stringify(this.data));
  }
}
