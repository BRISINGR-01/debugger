import { ChildProcess, spawn } from "node:child_process";

export function run(command: string, cwd: string) {
  console.log(`[debugger] running: ${command} (in ${cwd})`);
  const child = spawn(command, { cwd, stdio: "inherit", shell: false });
  child.on("error", (err) =>
    console.error(`[debugger] failed: ${err.message}`),
  );
  return child;
}

export function killChild(child?: ChildProcess) {
  if (child && !child.killed) {
    child.kill("SIGTERM");
  }
}
