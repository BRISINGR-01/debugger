#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { transformSync } from "@babel/core";

export default function instrumentFile(
  input,
  dest,
  destRoot,
  useECMAImport = true,
) {
  let isTS = input.endsWith(".ts");

  const plugins = [new URL("./babel-plugin.js", import.meta.url).pathname];

  if (isTS) plugins.unshift("@babel/plugin-syntax-typescript");

  const src = fs.readFileSync(input, "utf8");

  const result = transformSync(src, {
    filename: input,
    plugins,
    parserOpts: {
      plugins: isTS ? ["typescript"] : [],
    },
    // Preserve original formatting as much as possible
    retainLines: false,
    compact: false,
  });

  if (!result || !result.code)
    throw new Error(`Couldn't instrument "${input}"`);

  const importPath = path.resolve(destRoot, "recorder.js");
  const runtimeRequire = useECMAImport
    ? `import "${importPath}";`
    : `require("${importPath}");`;

  fs.writeFileSync(dest, runtimeRequire + result.code);
}
