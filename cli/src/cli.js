import { Command } from "commander";

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

  return {
    command: program.args.join(" "),
    exclude: opts.exclude,
    sourceDir: opts.path || process.cwd(),
    single: opts.single,
    noRestart: opts.noRestart,
  };
}
