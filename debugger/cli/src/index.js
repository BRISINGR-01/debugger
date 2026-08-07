#!/usr/bin/env node

import path from "path";
import fs from "fs";
import { parseArgs } from "./cli.js";
import {
  buildExcludeMatcher,
  needsUpdate,
  debugDirName,
  makeSymlink,
  processEntry,
  removeDebugDir,
  throttle,
} from "./utils.js";
import { run, killChild } from "./runner.js";
import { watchChanges } from "./watcher.js";
import instrumenters, { chooseInstrumenter } from "./instrumenters.js";
import "server";

function main() {
  const { command, exclude, sourceDir, singleRun, shouldRestart } = parseArgs(
    process.argv,
  );

  const debugDir = path.resolve(sourceDir, debugDirName);
  removeDebugDir(debugDir);

  setUp(sourceDir, debugDir, exclude);

  let child = run(command, debugDir);

  const watcher = singleRun
    ? null
    : watchChanges({
        sourceDir,
        debugDir,
        excludePatterns: exclude,
        onChange: () => {
          if (shouldRestart) {
            killChild(child);
            throttle(() => (child = run(command, debugDir)));
          }
        },
      });

  process.on("SIGINT", async () => {
    killChild(child);
    if (watcher) await watcher.close();
    process.exit(0);
  });
}

function setUp(sourceDir, debugDir, excludePatterns) {
  fs.mkdirSync(debugDir, { recursive: true });

  instrumenters.js.prepare(sourceDir, debugDir);

  const isExcluded = buildExcludeMatcher(sourceDir, excludePatterns);

  function walk(dir) {
    if (dir.startsWith(debugDir)) return;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const srcPath = path.resolve(dir, entry.name);
      const fileRelPath = path.relative(sourceDir, srcPath);
      if (fileRelPath === debugDirName) continue;

      if (!needsUpdate(srcPath, path.join(debugDir, fileRelPath))) continue;

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

main();
