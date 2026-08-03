#!/usr/bin/env node

import path from "path";
import fs from "fs";
import { parseArgs } from "./cli.js";
import {
  buildExcludeMatcher,
  debugDirName,
  makeSymlink,
  processEntry,
  removeDebugDir,
  throttle,
} from "./utils.js";
import { run, killChild } from "./runner.js";
import { watchChanges } from "./watcher.js";
import instrumenters, { chooseInstrumenter } from "./instrumenters.js";

const {
  command,
  exclude,
  sourceDir,
  single: singleRun,
  noRestart,
} = parseArgs(process.argv);

const debugDir = path.resolve(sourceDir, debugDirName);

setUp(sourceDir, debugDir, exclude);

let child = run(command, debugDir);
child.on("exit", () => {
  if (singleRun) {
    // removeDebugDir(debugDir);
    process.exit(0);
  }
});

const watcher = singleRun
  ? null
  : watchChanges({
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
  if (watcher) await watcher.close();
  removeDebugDir(debugDir);
  process.exit(0);
});

function setUp(sourceDir, debugDir, excludePatterns) {
  if (fs.existsSync(debugDir)) removeDebugDir(debugDir);

  fs.mkdirSync(debugDir, { recursive: true });

  instrumenters.js.prepare(sourceDir, debugDir);

  const isExcluded = buildExcludeMatcher(sourceDir, excludePatterns);

  function walk(dir) {
    if (dir.startsWith(debugDir)) return;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const srcPath = path.resolve(dir, entry.name);
      const fileRelPath = path.relative(sourceDir, srcPath);

      if (isExcluded(fileRelPath) || isExcluded(entry.name)) {
        makeSymlink(srcPath, fileRelPath, debugDir);
        continue;
      }

      if (entry.isDirectory()) {
        walk(srcPath);
        continue;
      }

      processEntry(srcPath, fileRelPath, debugDir);
    }
  }

  walk(sourceDir);
}
