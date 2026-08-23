import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import {
  buildExcludeMatcher,
  needsUpdate,
  makeSymlink,
  debugDirName,
} from "./utils.js";

const jsInstrumenterPath = path.resolve(
  import.meta.dirname,
  "../../js/src/index.js",
);

const instrumenters = {
  js: {
    prepare(src, dest) {
      execSync(`node ${jsInstrumenterPath} prepareDest '${src}' '${dest}'`);
    },
    instrument(srcRoot, srcPath, targetPath, debugDir) {
      execSync(
        `node ${jsInstrumenterPath} instrument '${srcRoot}' '${srcPath}' '${targetPath}' '${debugDir}'`,
      );
    },
  },
};

export function chooseInstrumenter(file) {
  const ext = path.extname(file);
  if (
    [".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"].includes(ext)
  ) {
    return instrumenters.js;
  }
  return null;
}

export function processEntry(srcRoot, srcPath, fileRelPath, debugDir) {
  const inst = chooseInstrumenter(fileRelPath);
  if (!inst) return makeSymlink(srcPath, fileRelPath, debugDir);

  const targetPath = path.resolve(debugDir, fileRelPath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  try {
    inst.instrument(srcRoot, srcPath, targetPath, debugDir);
  } catch (error) {
    console.error(error);
    console.info(`[debugger] skipped "${fileRelPath}"`);
    makeSymlink(srcPath, fileRelPath, debugDir);
  }
}

export function setupDebugDir(sourceDir, excludePatterns) {
  const debugDir = path.resolve(sourceDir, debugDirName);
  fs.mkdirSync(debugDir, { recursive: true });

  instrumenters.js.prepare(sourceDir, debugDir);

  const isExcluded = buildExcludeMatcher(sourceDir, excludePatterns);

  function walk(dir) {
    if (dir.startsWith(debugDir)) return;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const srcPath = path.resolve(dir, entry.name);
      const relPath = path.relative(sourceDir, srcPath);

      if (relPath === debugDirName) continue;
      if (!needsUpdate(srcPath, path.join(debugDir, relPath))) continue;

      if (isExcluded(relPath) || isExcluded(entry.name)) {
        makeSymlink(srcPath, relPath, debugDir);
        continue;
      }

      if (entry.isDirectory()) {
        walk(srcPath);
        continue;
      }

      processEntry(sourceDir, srcPath, relPath, debugDir);
    }
  }

  walk(sourceDir);
  return debugDir;
}
