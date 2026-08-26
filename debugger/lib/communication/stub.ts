import { EventEmitter } from "events";
import type Sink from "./sink.ts";

export default class StubSink extends EventEmitter implements Sink {
  async start(): Promise<void> {}
  async stop(): Promise<void> {}
  async clear(): Promise<void> {}
}
