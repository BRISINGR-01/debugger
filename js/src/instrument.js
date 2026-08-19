import fs from "fs";
import path from "path";
import { transformSync } from "@babel/core";

function findPackageType(dir) {
  const pkg = path.join(dir, "package.json");

  if (fs.existsSync(pkg)) {
    const json = JSON.parse(fs.readFileSync(pkg, "utf8"));
    return json.type === "module" ? "module" : "commonjs";
  }

  return "module";
}

export default function instrumentFile(input, dest, destRoot) {
  const source = fs.readFileSync(input, "utf8");

  const result = transformSync(source, {
    filename: input,

    // Let Babel determine whether this is ESM or CommonJS.
    sourceType: "unambiguous",

    plugins: [
      [
        new URL("./plugin/babel-plugin.js", import.meta.url).pathname,
        {
          moduleType: findPackageType(destRoot),
          runtime: "__debug_recorder",
        },
      ],
    ],

    parserOpts: {
      sourceType: "auto",

      // Parse as much modern syntax as possible without relying on file extensions.
      plugins: [
        "jsx",
        "typescript",
        "importMeta",
        "dynamicImport",
        "topLevelAwait",
        "classProperties",
        "classPrivateProperties",
        "classPrivateMethods",
        "optionalChaining",
        "nullishCoalescingOperator",
        "logicalAssignment",
        "numericSeparator",
        "objectRestSpread",
      ],

      errorRecovery: true,
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
    },

    babelrc: false,
    configFile: false,
    comments: true,
    compact: false,
    retainLines: false,
    sourceMaps: true,
  });

  if (!result?.code) {
    throw new Error(`Couldn't instrument "${input}"`);
  }

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try {
    if (fs.lstatSync(dest).isSymbolicLink()) fs.unlinkSync(dest);
  } catch {}
  fs.writeFileSync(dest, result.code, "utf8");
}
