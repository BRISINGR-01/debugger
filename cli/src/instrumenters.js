import { execSync } from "child_process";
import path from "path";

const jsPath = path.resolve(import.meta.dirname, "../../js/index.js");

export function chooseInstrumenter(file) {
  switch (path.extname(file)) {
    case ".js":
    case ".jsx":
    case ".mjs":
    case ".cjs":
    case ".ts":
    case ".tsx":
    case ".mts":
    case ".cts":
      return instrumenters.js;

    default:
      return null;
  }
}

const instrumenters = {
  js: {
    prepare(src, dest) {
      execSync(`node ${jsPath} prepareDest '${src}' '${dest}'`);
    },
    instrument(srcPath, targetPath, debugDir) {
      execSync(
        `node ${jsPath} instrument '${srcPath}' '${targetPath}' '${debugDir}'`,
      );
    },
  },
};
export default instrumenters;
