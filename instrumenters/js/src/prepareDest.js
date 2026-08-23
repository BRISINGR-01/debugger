import fs from "fs";
import path from "path";

export default function prepareDest(src, dest) {
  if (!fs.existsSync(dest))
    throw new Error(`Destination "${dest}" doesn't exist`);

  if (!fs.statSync(dest).isDirectory())
    throw new Error(`Destination "${dest}" is not a directory`);

  const src_node_modules = path.resolve(src, "node_modules");
  const debug_node_modules = path.resolve(dest, "node_modules");
  if (!fs.existsSync(debug_node_modules)) fs.mkdirSync(debug_node_modules);

  if (fs.existsSync(src_node_modules)) {
    for (const entry of fs.readdirSync(src_node_modules)) {
      const linkPath = path.join(debug_node_modules, entry);
      if (!fs.existsSync(linkPath)) {
        fs.symlinkSync(path.join(src_node_modules, entry), linkPath);
      }
    }
  }

  const debuggerPkgPath = path.resolve(
    debug_node_modules,
    "__debugger_recorder",
  );

  if (!fs.existsSync(debuggerPkgPath)) {
    fs.symlinkSync(new URL("./recorder_pkg", import.meta.url), debuggerPkgPath);
  }
}
