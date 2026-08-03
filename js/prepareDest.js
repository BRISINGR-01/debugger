import fs from "fs";
import path from "path";

export default function prepareDest(src, dest) {
  if (!fs.existsSync(dest))
    throw new Error(`Destination "${dest}" doesn't exist`);

  if (!fs.statSync(dest).isDirectory())
    throw new Error(`Destination "${dest}" is not a directory`);

  const src_node_modules = path.resolve(src, "node_modules");
  const debug_node_modules = path.resolve(dest, "node_modules");
  fs.mkdirSync(debug_node_modules);

  console.log(src_node_modules, debug_node_modules);
  if (fs.existsSync(src_node_modules)) {
    console.log(1);

    for (const entry of fs.readdirSync(src_node_modules)) {
      console.log(entry);
      fs.symlinkSync(
        path.join(src_node_modules, entry),
        path.join(debug_node_modules, entry),
      );
    }
  }

  fs.symlinkSync(
    new URL("./__debugger_recorder", import.meta.url),
    path.resolve(debug_node_modules, "__debugger_recorder"),
  );
}
