import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import {
  buildExcludeMatcher,
  needsUpdate,
  makeSymlink,
  debugDirName,
} from "./utils.ts";
import Config from "./config.ts";

const jsInstrumenterPath = path.resolve(
  import.meta.dirname,
  "../../instrumenters/js/src",
);

type Instrumenter = {
  prepare(srcRoot: string, debugDir: string): void;
  instrument(
    srcRoot: string,
    pathInSrc: string,
    targetPath: string,
    debugDir: string,
  ): void;
};
const JSInstrumenter: Instrumenter = {
  prepare(srcRoot: string, debugDir: string) {
    execSync(
      `node ${path.join(jsInstrumenterPath, "index.js")} prepare-dest '${srcRoot}' '${debugDir}'`,
    );
  },
  instrument(
    srcRoot: string,
    pathInSrc: string,
    targetPath: string,
    debugDir: string,
  ) {
    execSync(
      `node ${path.join(jsInstrumenterPath, "index.js")} instrument '${srcRoot}' '${pathInSrc}' '${targetPath}' '${debugDir}'`,
    );
  },
};

const cppInstrumenterPath = path.resolve(
  import.meta.dirname,
  "../../instrumenters/cpp/src/",
);

const CPPInstrumenter: Instrumenter = {
  prepare(srcRoot: string, debugDir: string) {
    execSync(
      `node ${jsInstrumenterPath} prepare-dest '${srcRoot}' '${debugDir}'`,
    );
  },
  instrument(
    srcRoot: string,
    pathInSrc: string,
    pathInDbg: string,
    debugDir: string,
  ) {
    execSync(
      `clang++ -std=c++17 -o /dev/null \
        -fplugin=${path.resolve(cppInstrumenterPath, "build", "Instrumenter.so")} \
        -include ${path.resolve(cppInstrumenterPath, "recorder", "recorder.h")} \
        -fplugin-arg-instrumenter-${pathInDbg}\
        ${pathInSrc}  '${srcRoot}' '${pathInSrc}' '${pathInDbg}' '${debugDir}'`,
    );
  },
};

export function chooseInstrumenter(file: string) {
  const ext = path.extname(file);
  switch (ext) {
    case ".js":
    case ".jsx":
    case ".mjs":
    case ".cjs":
    case ".ts":
    case ".tsx":
    case ".mts":
    case ".cts":
      return JSInstrumenter;
    case ".c":
    case ".cpp":
      return CPPInstrumenter;
  }
  return null;
}

export function processEntry(srcRoot: string, file: string, debugDir: string) {
  const pathInSrc = path.join(srcRoot, file);
  const pathInDbg = path.join(debugDir, file);

  if (!needsUpdate(pathInSrc, pathInDbg)) return;

  const inst = chooseInstrumenter(file);
  if (!inst) return makeSymlink(pathInSrc, pathInDbg);

  const targetPath = path.resolve(debugDir, file);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  try {
    inst.instrument(srcRoot, pathInSrc, targetPath, debugDir);
  } catch (error) {
    console.error(error);
    console.info(`[debugger] skipped "${file}"`);
    makeSymlink(pathInSrc, pathInDbg);
  }
}

export function setupDebugDir(srcRoot: string, config: Config) {
  const debugDir = path.resolve(srcRoot, debugDirName);
  fs.mkdirSync(debugDir, { recursive: false });

  config.setup(debugDir);

  const isExcluded = buildExcludeMatcher(srcRoot, config.data.excludePattern);
  const files = enumerateProjectFiles(srcRoot, srcRoot, debugDir, isExcluded);

  const instrumenters = new Set<Instrumenter>();
  for (const file of files) {
    const pathInSrc = path.resolve(srcRoot, file);

    if (isExcluded(file)) {
      makeSymlink(pathInSrc, path.resolve(debugDir, file));
      continue;
    }

    const inst = chooseInstrumenter(file);
    if (inst) instrumenters.add(inst);
    processEntry(srcRoot, file, debugDir);
  }

  for (const inst of instrumenters) {
    inst.prepare(srcRoot, debugDir);
  }

  return debugDir;
}

function enumerateProjectFiles(
  dir: string,
  rootSrc: string,
  debugDir: string,
  isExcluded: (_: string) => boolean,
  entries = new Set<string>(),
) {
  if (isExcluded(dir)) return entries;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const pathInSrc = path.resolve(dir, entry.name);
    const relPath = path.relative(rootSrc, pathInSrc);

    if (relPath === debugDirName) continue;

    if (entry.isDirectory()) {
      enumerateProjectFiles(pathInSrc, rootSrc, debugDir, isExcluded, entries);
      continue;
    }

    entries.add(relPath);
  }

  return entries;
}
