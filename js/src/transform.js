#!/usr/bin/env node
/**
 * Usage:
 *   node transform.js <input.js|ts>              # prints transformed code to stdout
 *   node transform.js <input.js|ts> -o out.js    # writes to file
 *   node transform.js <input.js|ts> --run        # transforms + runs immediately
 *   node transform.js <input.js|ts> --run --json # transforms + runs + dumps JSON events
 *
 * The transformed file gets the recorder runtime prepended automatically.
 */

const fs = require("fs");
const path = require("path");
const { transformSync } = require("@babel/core");

const args = process.argv.slice(2);
if (!args.length || args[0] === "--help") {
  console.log(`
Usage:
  node transform.js <file.js|ts|root_dir> [options]

Options:
  -o <out.js>              Write transformed code to a file instead of stdout
  --help                   Show this help
`);
  process.exit(0);
}

function prepareDest(input) {
  const outFlag = args.indexOf("-o");

  if (outFlag === -1) {
    return path.resolve(path.dirname(input), "dest");
  }

  const outDir = args[outFlag + 1];
  if (!fs.existsSync(outDir)) {
    try {
      fs.mkdirSync(outDir, { recursive: true });
      return outDir;
    } catch (error) {
      console.error(`Error: ${error}`);
      process.exit(1);
    }
  }

  if (!fs.statSync(outDir).isDirectory()) {
    console.error(`Error: ${outDir} is not a directory`);
    process.exit(1);
  }
}

function prepareInput() {
  const input = args[0];

  if (!fs.existsSync(input)) {
    console.error(`Error: ${input} not found`);
    process.exit(1);
  }

  return input;
}

function runBabel(input, dest) {
  let isTS = false;

  if (fs.statSync(input).isFile()) {
    isTS = input.endsWith(".ts");
  } else {
    const hasTs = (dir) =>
      fs.readdirSync(dir).some((entry) => {
        const p = path.resolve(dir, entry);
        if (fs.statSync(p).isDirectory()) return hasTs(p);

        return p.endsWith(".ts");
      });

    isTS = hasTs(input);
  }

  const plugins = [path.resolve(__dirname, "plugin.js")];
  if (isTS) plugins.unshift("@babel/plugin-syntax-typescript");

  const src = fs.readFileSync(inputFile, "utf8");

  const result = transformSync(src, {
    filename: inputFile,
    plugins,
    parserOpts: {
      plugins: isTS ? ["typescript"] : [],
    },
    // Preserve original formatting as much as possible
    retainLines: false,
    compact: false,
  });

  if (!result || !result.code) {
    console.error("Transformation failed.");
    process.exit(1);
  }

  // Prepend the runtime require so the output file is self-contained
  const runtimeRecoder = fs.copyFileSync(
    path.resolve(__dirname, "recorder-runtime.js"),
    path.resolve(dest, "recorder-runtime.js"),
  );
  const runtimeRequire = `require("recorder-runtime.js");\n\n`;
  const fullCode = runtimeRequire + result.code;

  fs.writeFileSync(path.resolve(dest, "out.js"), fullCode);
}

function transformDirectory(srcDir, outDir, pluginPath) {
  fs.mkdirSync(outDir, { recursive: true });

  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    const dst = path.join(outDir, entry.name);

    if (entry.isDirectory()) {
      transformDirectory(src, dst, pluginPath);
      continue;
    }

    if (/\.(js|ts)$/.test(entry.name)) {
      transformFile(src, dst, pluginPath);
    } else {
      fs.copyFileSync(src, dst);
    }
  }
}

const input = prepareInput();
const dest = prepareDest(input);
runBabel(input, dest);
