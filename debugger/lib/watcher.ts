import chokidar from "chokidar";
import path, { relative, resolve, basename } from "path";
import { rmSync, mkdirSync, lstatSync, existsSync } from "fs";
import { buildExcludeMatcher, makeSymlink } from "./utils.ts";
import { prepareFileAndGetInstr } from "./instrument.ts";

export function watchChanges(
  srcRoot: string,
  debugDir: string,
  excludePatterns: string[],
  onChange: () => void,
) {
  const isExcluded = buildExcludeMatcher(srcRoot, excludePatterns);

  const watcher = chokidar.watch(srcRoot, {
    ignored: (watchPath) => {
      if (watchPath.startsWith(debugDir)) return true;
      return (
        isExcluded(relative(srcRoot, watchPath)) ||
        isExcluded(basename(watchPath))
      );
    },
    ignoreInitial: true,
  });

  watcher.on("all", (event, filePath) => {
    const file = relative(srcRoot, filePath);
    const target = resolve(debugDir, file);

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
      const inst = prepareFileAndGetInstr(srcRoot, file, debugDir, isExcluded);
      if (!inst) return;

      const pathInDbg = path.join(debugDir, file);

      try {
        inst.instrument(srcRoot, debugDir, [file]);
      } catch (error) {
        console.error((error as { message: string }).message);
        if (!existsSync(pathInDbg)) {
          makeSymlink(path.join(srcRoot, file), pathInDbg);
        }
      }

      onChange();
    }
  });

  watcher.on("error", (err) =>
    console.error(`[debugger] watch error: ${(err as Error).message}`),
  );
  watcher.on("ready", () => console.log(`[debugger] watching: ${srcRoot}`));

  return watcher;
}
