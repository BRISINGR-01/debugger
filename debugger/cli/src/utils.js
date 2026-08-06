import fs from "fs";
import path from "path";
import picomatch from "picomatch";
import instrumenters, { chooseInstrumenter } from "./instrumenters.js";

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
  ];
  const git = parseGitignore(sourceDir);
  const all = [...always, ...git, ...userPatterns];
  return all.length > 0 ? picomatch(all, { matchBase: true }) : () => false;
}

export function processEntry(srcPath, fileRelPath, debugDir) {
  const inst = chooseInstrumenter(fileRelPath);
  if (!inst) return makeSymlink(srcPath, fileRelPath, debugDir);

  const targetPath = path.resolve(debugDir, fileRelPath);
  const parent = path.dirname(targetPath);
  fs.mkdirSync(parent, { recursive: true });

  inst.instrument(srcPath, targetPath, debugDir);
  try {
  } catch (error) {
    console.error(error);
    console.info(`Skipped file "${fileRelPath}"`);
  }
}

export function makeSymlink(srcPath, relPath, debugDir) {
  const targetPath = path.resolve(debugDir, relPath);
  const parent = path.dirname(targetPath);
  fs.mkdirSync(parent, { recursive: true });

  const linkTarget = path.relative(parent, srcPath);
  if (!fs.existsSync(linkTarget)) fs.symlinkSync(linkTarget, targetPath);
}

export function removeDebugDir(debugDir) {
  fs.rmSync(debugDir, { recursive: true, force: true });
}

let restartTimer = null;

export function throttle(cb) {
  clearTimeout(restartTimer);
  restartTimer = setTimeout(cb, 100);
}

export function needsUpdate(src, dest) {
  return (
    !fs.existsSync(dest) || fs.statSync(src).mtimeMs > fs.statSync(dest).mtimeMs
  );
}
