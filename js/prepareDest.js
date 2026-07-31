import fs from "fs";

export default function prepareDest(dest) {
  if (!fs.existsSync(dest))
    throw new Error(`Destination "${dest}" doesn't exist`);

  if (!fs.statSync(dest).isDirectory())
    throw new Error(`Destination "${dest}" is not a directory`);

  fs.symlinkSync(
    new URL("./recorder.js", import.meta.url),
    `${dest}/recorder.js`,
  );
}
