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
  instrument(srcRoot: string, debugDir: string, files: string[]): void;
};
const JSInstrumenter: Instrumenter = {
  prepare(srcRoot: string, debugDir: string) {
    execSync(
      `node ${path.join(jsInstrumenterPath, "index.js")} prepare-dest '${srcRoot}' '${debugDir}'`,
      { cwd: srcRoot },
    );
  },
  instrument(srcRoot: string, debugDir: string, files: string[]) {
    execSync(
      `node ${path.join(jsInstrumenterPath, "index.js")} instrument '${srcRoot}' '${debugDir}' '${JSON.stringify(files)}'`,
      { cwd: srcRoot },
    );
  },
};

const cppInstrumenterPath = path.resolve(
  import.meta.dirname,
  "../../instrumenters/cpp/src/",
);

const CPPInstrumenter: Instrumenter = {
  prepare(srcRoot: string, debugDir: string) {},
  instrument(srcRoot: string, debugDir: string, files: string[]) {
    const cxx = [],
      headers = [];
    for (const file of files) {
      if (file.endsWith(".h") || file.endsWith(".hpp")) {
        headers.push(file);
      } else {
        cxx.push(file);
      }
    }

    console.error(`clang++ -std=c++17 -o /dev/null \
        -fplugin=${path.resolve(cppInstrumenterPath, "build", "Instrumenter.so")} \
        -fplugin-arg-instrumenter-${debugDir} \
        ${headers.map((h) => `-I${h}`).join(" ")} \
        ${cxx.map((f) => `'${f}'`).join(" ")}`);

    execSync(
      `clang++ -std=c++17 -o /dev/null \
        -fplugin=${path.resolve(cppInstrumenterPath, "build", "Instrumenter.so")} \
        -fplugin-arg-instrumenter-${debugDir} \
        ${headers.map((h) => `-I${h}`).join(" ")} \
        ${cxx.map((f) => `'${f}'`).join(" ")}`,
      { cwd: srcRoot },
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
    case ".h":
    case ".hpp":
      return CPPInstrumenter;
  }
  return null;
}

export function prepareFileAndGetInstr(
  srcRoot: string,
  file: string,
  debugDir: string,
  isExcluded: (_: string) => boolean,
) {
  const pathInSrc = path.join(srcRoot, file);
  const pathInDbg = path.join(debugDir, file);

  if (!needsUpdate(pathInSrc, pathInDbg)) return null;

  const inst = chooseInstrumenter(file)!;
  if (!inst || isExcluded(file)) {
    makeSymlink(pathInSrc, path.resolve(debugDir, file));
    return null;
  }

  if (fs.existsSync(pathInDbg) && fs.lstatSync(pathInDbg).isSymbolicLink()) {
    fs.unlinkSync(pathInDbg);
  } else {
    fs.mkdirSync(path.dirname(pathInDbg), { recursive: true });
  }

  return inst;
}

export function setupDebugDir(srcRoot: string, config: Config) {
  const debugDir = path.resolve(srcRoot, debugDirName);
  fs.mkdirSync(debugDir, { recursive: true });

  config.setup(debugDir);

  const isExcluded = buildExcludeMatcher(srcRoot, config.data.excludePattern);
  const files = enumerateProjectFiles(srcRoot, srcRoot, debugDir, isExcluded);

  const instMap = new Map<Instrumenter, string[]>();
  for (const file of files) {
    const inst = prepareFileAndGetInstr(srcRoot, file, debugDir, isExcluded);
    if (!inst) continue;

    if (instMap.has(inst)) {
      instMap.get(inst)!.push(file);
    } else {
      instMap.set(inst, [file]);
    }
  }

  for (const inst of instMap.keys()) {
    inst.prepare(srcRoot, debugDir);
    inst.instrument(srcRoot, debugDir, instMap.get(inst)!);
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
