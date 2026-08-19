import fs from "fs";
import path from "path";
import picomatch from "picomatch";

export const debugDirName = ".debug";

export function parseGitignore(dir) {
  const p = path.resolve(dir, ".gitignore");
  if (!fs.existsSync(p)) return [];

  return fs
    .readFileSync(p, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !l.startsWith("!"))
    .map((l) => (l.endsWith("/") ? l.slice(0, -1) : l));
}

export function buildExcludeMatcher(sourceDir, userPatterns) {
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

export function makeSymlink(srcPath, relPath, debugDir) {
  const targetPath = path.resolve(debugDir, relPath);
  const parent = path.dirname(targetPath);
  fs.mkdirSync(parent, { recursive: true });

  const linkTarget = path.relative(parent, srcPath);
  if (!fs.existsSync(targetPath)) {
    fs.symlinkSync(linkTarget, targetPath);
  }
}

export function needsUpdate(src, dest) {
  return (
    isDev() ||
    !fs.existsSync(dest) ||
    fs.statSync(src).mtimeMs > fs.statSync(dest).mtimeMs
  );
}

export function isDev() {
  return process.env.DEV;
}
