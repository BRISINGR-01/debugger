import { type Config } from "./lib/config.ts";
import Debugger from "./lib/debugger.ts";
export default Debugger;

export async function createDebugger(options: { srcRoot: string } & Config) {
  return await new Debugger(options).start();
}
