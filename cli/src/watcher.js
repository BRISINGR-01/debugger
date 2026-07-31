import chokidar from "chokidar";
import { relative, resolve, dirname, basename } from "path";
import { rmSync, mkdirSync, statSync, lstatSync } from "fs";
import { buildExcludeMatcher, processEntry } from "./utils.js";

export function watchChanges({
  sourceDir,
  debugDir,
  excludePatterns,
  onChange,
}) {
  const isExcluded = buildExcludeMatcher(sourceDir, excludePatterns);

  const watcher = chokidar.watch(sourceDir, {
    ignored: (path, stats) => {
      if (path.startsWith(debugDir)) return true;
      const rel = relative(sourceDir, path);
      return isExcluded(rel) || isExcluded(basename(path));
    },
    ignoreInitial: true,
  });

  watcher.on("all", (event, filePath) => {
    const rel = relative(sourceDir, filePath);
    const target = resolve(debugDir, rel);

    if (rel.startsWith(debugDir)) return;

    if (event === "unlinkDir" || event === "unlink") {
      try {
        rmSync(target, { recursive: true, force: true });
        console.log(`[debugger]   removed ${rel}`);
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
      processEntry(filePath, rel, sourceDir, debugDir);
      onChange();
    }
  });

  watcher.on("error", (err) =>
    console.error(`[debugger] watch error: ${err.message}`),
  );
  watcher.on("ready", () => console.log(`[debugger] watching: ${sourceDir}`));

  return watcher;
}
