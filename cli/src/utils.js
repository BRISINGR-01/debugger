import {
  readdirSync,
  mkdirSync,
  symlinkSync,
  rmSync,
  existsSync,
  copyFileSync,
  readFileSync,
  unlinkSync,
  statSync,
} from "fs";
import { extname, resolve, relative, dirname, basename } from "path";
import picomatch from "picomatch";
import instrumenters from "./instrumenters.js";

export const debugDirName = ".debug";

// const instrument = {
//   ".js": instrumentJSFile,
//   ".jsx": instrumentJSFile,
//   ".ts": instrumentJSFile,
//   ".tsx": instrumentJSFile,
// ".c": { name: "cpp", cmd: null },
// ".cpp": { name: "cpp", cmd: null },
// ".cxx": { name: "cpp", cmd: null },
// ".cc": { name: "cpp", cmd: null },
// ".h": { name: "cpp", cmd: null },
// ".hpp": { name: "cpp", cmd: null },
// };

export function parseGitignore(dir) {
  const p = resolve(dir, ".gitignore");
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !l.startsWith("!"))
    .map((l) => (l.endsWith("/") ? l.slice(0, -1) : l));
}

export function buildExcludeMatcher(sourceDir, userPatterns) {
  const always = ["**/node_modules/**", "**/.git/**", ".git/**"];
  const git = parseGitignore(sourceDir);
  const all = [...always, ...git, ...userPatterns];
  return all.length > 0 ? picomatch(all, { matchBase: true }) : () => false;
}

export function processEntry(srcPath, relPath, sourceDir, debugDir) {
  const inst = instrumenters.js.instrument;

  if (!inst) return makeSymlink(srcPath, relPath, sourceDir, debugDir);

  const targetPath = resolve(debugDir, relPath);
  const parent = dirname(targetPath);
  mkdirSync(parent, { recursive: true });

  try {
    inst(srcPath, targetPath, debugDir);
  } catch (error) {
    console.error(error);
    console.info(`Skipped file "${relPath}"`);
  }
}

export function makeSymlink(srcPath, relPath, sourceDir, debugDir) {
  const targetPath = resolve(debugDir, relPath);
  const parent = dirname(targetPath);
  mkdirSync(parent, { recursive: true });

  const linkTarget = relative(parent, srcPath);
  try {
    unlinkSync(targetPath);
  } catch {}
  symlinkSync(linkTarget, targetPath);
}
