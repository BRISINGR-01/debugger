import Debugger from "./lib/debugger.ts";
export default Debugger;

export async function createDebugger(options: {
  srcRoot: string;
  command?: string;
  excludePattern: string[];
  shouldRestart?: boolean;
  shouldWatch?: boolean;
  httpPort?: number;
}) {
  return await new Debugger(options).start();
}
