import chokidar from "chokidar";
import { relative, resolve, basename } from "path";
import { rmSync, mkdirSync, lstatSync } from "fs";
import { buildExcludeMatcher } from "./utils.js";
import { processEntry } from "./instrument.js";

export function watchChanges({
  sourceDir,
  debugDir,
  excludePatterns,
  onChange,
}) {
  const isExcluded = buildExcludeMatcher(sourceDir, excludePatterns);

  const watcher = chokidar.watch(sourceDir, {
    ignored: (watchPath) => {
      if (watchPath.startsWith(debugDir)) return true;
      return (
        isExcluded(relative(sourceDir, watchPath)) ||
        isExcluded(basename(watchPath))
      );
    },
    ignoreInitial: true,
  });

  watcher.on("all", (event, filePath) => {
    const rel = relative(sourceDir, filePath);
    const target = resolve(debugDir, rel);

    if (event === "unlinkDir" || event === "unlink") {
      try {
        rmSync(target, { recursive: true, force: true });
      } catch {}
      onChange();
      return;
    }

    if (event === "addDir") {
      mkdirSync(target, { recursive: true });
      return;
    }

    if (
      !lstatSync(target).isSymbolicLink() &&
      (event === "add" || event === "change")
    ) {
      processEntry(sourceDir, filePath, rel, debugDir);
      onChange();
    }
  });

  watcher.on("error", (err) =>
    console.error(`[debugger] watch error: ${err.message}`),
  );
  watcher.on("ready", () => console.log(`[debugger] watching: ${sourceDir}`));

  return watcher;
}
