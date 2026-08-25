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

export default function instrumentFiles(srcRoot, debugDir, files) {
  for (const file of files) {
    const source = fs.readFileSync(path.join(srcRoot, file), "utf8");

    const result = transformSync(source, {
      filename: file,
      cwd: srcRoot,
      // Let Babel determine whether this is ESM or CommonJS.
      sourceType: "unambiguous",

      plugins: [
        [
          new URL("./plugin/babel-plugin.js", import.meta.url).pathname,
          {
            moduleType: findPackageType(debugDir),
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
      throw new Error(`Couldn't instrument "${file}"`);
    }

    const pathInDbg = path.join(debugDir, file);
    fs.mkdirSync(path.dirname(pathInDbg), { recursive: true });
    fs.writeFileSync(pathInDbg, result.code, "utf8");
  }
}
