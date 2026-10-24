import { access, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import ts from "../../node_modules/typescript/lib/typescript.js";

export async function importTypeScriptModule(
  relativePath,
  baseUrl = new URL("../", import.meta.url),
) {
  const entryUrl = new URL(relativePath, baseUrl);
  const require = createRequire(import.meta.url);
  const cache = new Map();

  async function compile(moduleUrl) {
    if (cache.has(moduleUrl.href)) return cache.get(moduleUrl.href);
    const compilation = (async () => {
      const source = await readFile(moduleUrl, "utf8");
      let output = ts.transpileModule(source, {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
        },
      }).outputText;
      const specifiers = [
        ...output.matchAll(/from\s+["']([^"']+)["']/g),
      ].map((match) => match[1]);

      for (const specifier of new Set(specifiers)) {
        if (!specifier.startsWith(".")) {
          const resolved = pathToFileURL(require.resolve(specifier)).href;
          output = output.replaceAll(`from "${specifier}"`, `from "${resolved}"`)
            .replaceAll(`from '${specifier}'`, `from '${resolved}'`);
          continue;
        }
        let dependencyUrl = new URL(
          /\.[cm]?[jt]sx?$/.test(specifier) ? specifier : `${specifier}.ts`,
          moduleUrl,
        );
        try {
          await access(dependencyUrl);
        } catch {
          dependencyUrl = new URL(`${specifier}.tsx`, moduleUrl);
        }
        const dependencyDataUrl = await compile(dependencyUrl);
        output = output
          .replaceAll(`from "${specifier}"`, `from "${dependencyDataUrl}"`)
          .replaceAll(`from '${specifier}'`, `from '${dependencyDataUrl}'`);
      }

      return `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`;
    })();
    cache.set(moduleUrl.href, compilation);
    return compilation;
  }

  const moduleUrl = await compile(entryUrl);
  return import(moduleUrl);
}
