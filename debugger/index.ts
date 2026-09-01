import { type Config } from "./lib/config.ts";
import Debugger from "./lib/debugger.ts";
import EventsContainer from "./lib/communication/eventsContainer.ts";
export { Debugger, EventsContainer };

export async function createDebugger(options: { srcRoot: string } & Config) {
  return await new Debugger(options, new EventsContainer()).start();
}
