#!/usr/bin/env node

import path from "node:path";
import { Command } from "commander";
import { createDebugger } from "./index.ts";

const program = new Command();

program
  .name("debug")
  .description("Instrument code and run a command with live debug logging")
  .argument("[command...]", "command to run on instrumented code")
  .option(
    "-e, --exclude <pattern>",
    "exclude file pattern (repeatable)",
    (value: string, acc: string[]) => {
      acc.push(value);
      return acc;
    },
    [],
  )
  .option("-p, --path <directory>", "source directory to instrument")
  .option("-P, --port <number>", "server port", Number, 5634)
  .option("-n, --no-restart", "do not restart on file changes")
  .option("-W, --no-watch", "no file watching")
  .allowExcessArguments(true)
  .parse(process.argv);

const opts = program.opts();
const command = program.args.join(" ");

const sourceDir = opts.path ? path.resolve(opts.path) : process.cwd();

const dbg = await createDebugger({
  command,
  srcRoot: sourceDir,
  excludePattern: opts.exclude,
  shouldRestart: opts.restart,
  shouldWatch: opts.watch,
  httpPort: opts.port,
});

process.on("SIGINT", async () => {
  await dbg.stop();
  process.exit(0);
});
