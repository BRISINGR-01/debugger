import type { LogEvent } from "../../../json-spec.ts";
import Config from "../config.ts";

export default interface Sink {
  on(
    event: "data" | "clear" | "ready" | "exit",
    listener:
      | ((entry: LogEvent) => void)
      | (() => void)
      | ((code: number | null) => void),
  ): void;

  applyConfig(config: Config): void;

  start(): Promise<void>;
  stop(): Promise<void>;
  clear(): void;
}
