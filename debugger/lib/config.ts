import { EventEmitter } from "events";
import fs from "fs";
import path from "path";

export type Config = {
  command: string | undefined;
  ioFilePath: string | undefined;
  excludePattern: string[];
  shouldRestart: boolean;
  disable: boolean;
  shouldWatch: boolean;
  httpPort: number;
};

const defaultData: Config = {
  command: undefined,
  ioFilePath: undefined,
  excludePattern: [],
  shouldRestart: true,
  disable: false,
  shouldWatch: true,
  httpPort: 5634,
};

export default function loadConfig(cliOptions: Config, debugDir: string) {
  const file = path.join(debugDir, ".dbg-config.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });

  let data: Config = {
    ...defaultData,
    ...cliOptions,
  };

  if (fs.existsSync(file)) {
    const loaded = load(file);
    data = {
      ...cliOptions,
      ...loaded,
    };
  }

  data.ioFilePath = path.join(debugDir, ".dbg-socket");
  save(file, data);
  return data;
}

function load(file: string) {
  try {
    const loaded = fs.readFileSync(file).toJSON() as unknown as Config;
    return loaded && typeof loaded === "object" ? loaded : defaultData;
  } catch {}

  return defaultData;
}

function save(file: string, data: Config) {
  fs.writeFileSync(file, JSON.stringify(data));
}
