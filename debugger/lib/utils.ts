import fs from "fs";
import path from "path";
import picomatch from "picomatch";

export const debugDirName = ".debug";

export function parseGitignore(dir: string) {
  const p = path.resolve(dir, ".gitignore");
  if (!fs.existsSync(p)) return [];

  return fs
    .readFileSync(p, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !l.startsWith("!"))
    .map((l) => (l.endsWith("/") ? l.slice(0, -1) : l));
}

export function buildExcludeMatcher(sourceDir: string, userPatterns: string[]) {
  const always = [
    "**/node_modules/**",
    "**/.git/**",
    ".git/**",
    "**/__debugger__*",
    "*.d.ts",
  ];
  const git = parseGitignore(sourceDir);
  const all = [...always, ...git, ...userPatterns];
  return all.length > 0 ? picomatch(all, { matchBase: true }) : () => false;
}

export function makeSymlink(pathInSrc: string, pathInDbg: string) {
  const parent = path.dirname(pathInDbg);
  fs.mkdirSync(parent, { recursive: true });

  const originalFile = path.relative(parent, pathInSrc);

  if (fs.existsSync(pathInDbg)) {
    if (!fs.lstatSync(pathInDbg).isSymbolicLink()) {
      fs.unlinkSync(pathInDbg);
      fs.symlinkSync(originalFile, pathInDbg);
    }
  } else {
    fs.symlinkSync(originalFile, pathInDbg);
  }
}

export function needsUpdate(src: string, dest: string) {
  return (
    isDev() ||
    !fs.existsSync(dest) ||
    fs.statSync(src).mtimeMs > fs.statSync(dest).mtimeMs
  );
}

export function isDev() {
  return process.env.DEV;
}
