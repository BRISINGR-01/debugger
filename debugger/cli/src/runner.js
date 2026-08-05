import { spawn } from "node:child_process";

export function run(command, cwd) {
  console.log(`\n[debugger] running: ${command}  (in ${cwd})`);
  const child = spawn(command, { cwd, stdio: "inherit", shell: true });
  child.on("error", (err) =>
    console.error(`[debugger] failed: ${err.message}`),
  );
  return child;
}

export function killChild(child) {
  if (child && !child.killed) {
    child.kill("SIGTERM");
  }
}
