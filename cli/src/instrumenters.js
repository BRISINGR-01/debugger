import { execSync } from "child_process";
import path from "path";

const jsPath = path.resolve(import.meta.dirname, "../../js/index.js");
console.log(import.meta.dirname, jsPath);

const instrumenters = {
  js: {
    prepare(dest) {
      execSync(`node ${jsPath} prepareDest '${dest}'`);
    },
    instrument(srcPath, targetPath, debugDir) {
      execSync(
        `node ${jsPath} prepareDest '${srcPath}' '${targetPath}' '${debugDir}'`,
      );
    },
  },
};
export default instrumenters;
