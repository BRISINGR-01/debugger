import { EventEmitter } from "node:events";
import { LogEvent } from "../../vs-code-extention/src/json-spec";

interface DebuggerOptions {
  command: string;
  path: string;
  exclude?: string[];
  shouldRestart?: boolean;
  singleRun?: boolean;
  port?: number;
}

export default class Debugger extends EventEmitter {
  readonly data: LogEvent[];
  constructor(options: DebuggerOptions);
  start(): Promise<number>;
  stop(): Promise<void>;
  on(event: "data", listener: (entry: LogEvent) => void): this;
  on(event: "clear", listener: () => void): this;
  on(event: "ready", listener: () => void): this;
  on(event: "exit", listener: (code: number | null) => void): this;
}

export declare function createDebugger(
  options?: DebuggerOptions,
): Promise<Debugger>;
