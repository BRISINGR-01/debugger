#!/usr/bin/env node

import path from "path";
import fs from "fs";
import { parseArgs } from "./cli.js";
import {
  buildExcludeMatcher,
  debugDirName,
  makeSymlink,
  processEntry,
} from "./utils.js";
import { run, killChild } from "./runner.js";
import { watchChanges } from "./watcher.js";
import instrumenters from "./instrumenters.js";

const { command, exclude, sourceDir, single, noRestart } = parseArgs(
  process.argv,
);

const debugDir =
  sourceDir === process.cwd()
    ? path.resolve(sourceDir, debugDirName)
    : sourceDir;

setUp(sourceDir, debugDir, exclude);

let child = run(command, debugDir);
let restartTimer = null;

function throttle(cb) {
  clearTimeout(restartTimer);
  restartTimer = setTimeout(cb, 100);
}

const watcher =
  !single &&
  watchChanges({
    sourceDir,
    debugDir,
    excludePatterns: exclude,
    onChange: () => {
      if (noRestart) return;

      killChild(child);
      throttle(() => (child = run(command, debugDir)));
    },
  });

process.on("SIGINT", async () => {
  killChild(child);
  if (!single) await watcher.close();
  process.exit(0);
});

function setUp(sourceDir, debugDir, excludePatterns) {
  if (fs.existsSync(debugDir)) {
    fs.rmSync(debugDir, { recursive: true, force: true });
  }

  fs.mkdirSync(debugDir, { recursive: true });

  instrumenters.js.prepare(debugDir);

  const isExcluded = buildExcludeMatcher(sourceDir, excludePatterns);

  function walk(dir) {
    if (dir.startsWith(debugDir)) return;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const srcPath = path.resolve(dir, entry.name);
      const relPath = path.relative(sourceDir, srcPath);

      if (isExcluded(relPath) || isExcluded(entry.name)) {
        makeSymlink(srcPath, relPath, sourceDir, debugDir);
        continue;
      }

      if (entry.isDirectory()) {
        walk(srcPath);
        continue;
      }

      processEntry(srcPath, relPath, sourceDir, debugDir);
    }
  }

  walk(sourceDir);
}
