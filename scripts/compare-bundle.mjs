// Bundles every reference chart module (e2e/compare/ref/<lib>/<chart>.{js,jsx}) and the shared data
// into e2e/compare/.build/, one ESM file each, minified, the same settings for every library.
// Usage: node scripts/compare-bundle.mjs [lib ...]
import { build } from "esbuild";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const REF = "e2e/compare/ref";
const OUT = "e2e/compare/.build";
const only = process.argv.slice(2);
const libs = readdirSync(REF, { withFileTypes: true })
  .filter((d) => d.isDirectory() && (!only.length || only.includes(d.name)))
  .map((d) => d.name);

if (!only.length) rmSync(OUT, { recursive: true, force: true });
const entryPoints = [{ in: join(REF, "data.ts"), out: "data" }];
for (const lib of libs)
  for (const f of readdirSync(join(REF, lib)))
    if (/\.jsx?$/.test(f))
      entryPoints.push({ in: join(REF, lib, f), out: `${lib}/${f.replace(/\.jsx?$/, "")}` });
if (!existsSync(REF)) throw new Error(`${REF} missing`);

await build({
  entryPoints,
  outdir: OUT,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  jsx: "automatic",
  // maya refs import "mayacharts/element" like a user would; it resolves to src/, no dist build needed.
  alias: { mayacharts: "./src" },
  // rival libraries live in compare/ (npm ci --prefix compare), not the root install
  nodePaths: ["compare/node_modules"],
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});
console.log(`bundled ${entryPoints.length} modules into ${OUT}`);
