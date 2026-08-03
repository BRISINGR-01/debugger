import { Command } from "commander";
import path from "node:path";

export function parseArgs(argv) {
  const program = new Command();

  program
    .name("debugger")
    .description("Instrument code and run a command in .debug/")
    .argument("<command...>", "command to run on instrumented code")
    .option(
      "-e, --exclude <pattern>",
      "exclude file pattern (can be used multiple times)",
      (value, acc) => {
        acc.push(value);
        return acc;
      },
      [],
    )
    .option("-p, --path <directory>", "directory to instrument")
    .option(
      "-n, --no-restart",
      "do not restart the command on every file change",
    )
    .option(
      "-s, --single",
      "do a single run of the command. The alternative is to watch for file changes and rerun the command",
    )
    .allowExcessArguments(true)
    .parse(argv);

  const opts = program.opts();

  let sourceDir;
  if (opts.path) {
    sourceDir = path.isAbsolute(opts.path)
      ? opts.path
      : path.resolve(process.cwd(), opts.path);
  } else {
    sourceDir = process.cwd();
  }

  return {
    command: program.args.join(" "),
    exclude: opts.exclude,
    sourceDir,
    single: opts.single,
    noRestart: opts.noRestart,
  };
}
