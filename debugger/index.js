import Debugger from "./lib/server.js";
export default Debugger;

export async function createDebugger(options = {}) {
  return await new Debugger(options).start();
}
