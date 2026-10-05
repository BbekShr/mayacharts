// Bundle cost per library: the `bar` ref alone, and one bundle of every supported ref ("a dashboard
// using every chart type"). Gzip level 9, in memory. Writes site/compare-size.json.
// The esbuild options duplicate scripts/compare-bundle.mjs (which runs a build on import); keep in sync.
// Refs take data as an argument and do not import data.ts, so no data is bundled.
import { build, version } from "esbuild";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const REF = "e2e/compare/ref";
const PKG = {
  chartjs: ["chart.js"],
  echarts: ["echarts"],
  plot: ["@observablehq/plot"],
  vegalite: ["vega-lite"],
  recharts: ["recharts"],
  nivo: ["@nivo/bar"],
  plotly: ["plotly.js-dist-min", "plotly.js", "plotly.js-basic-dist-min"],
};
const opts = {
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  jsx: "automatic",
  alias: { mayacharts: "./src" },
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
};
const size = async (o) => {
  const { outputFiles } = await build({ ...opts, ...o });
  const js = outputFiles.find((f) => f.path.endsWith(".js")) ?? outputFiles[0];
  return { min: js.contents.length, gzip: gzipSync(js.contents, { level: 9 }).length };
};
const ver = (lib) => {
  const paths =
    lib === "maya"
      ? ["package.json"]
      : (PKG[lib] ?? []).map((p) => `node_modules/${p}/package.json`);
  const p = paths.find(existsSync);
  return p ? JSON.parse(readFileSync(p, "utf8")).version : null;
};

const libs = {};
for (const d of readdirSync(REF, { withFileTypes: true })) {
  if (!d.isDirectory()) continue;
  const files = readdirSync(join(REF, d.name))
    .filter((f) => /\.jsx?$/.test(f))
    .sort();
  const ok = files.filter(
    (f) => !/^export const unsupported\b/m.test(readFileSync(join(REF, d.name, f), "utf8")),
  );
  const bar = files.find((f) => /^bar\.jsx?$/.test(f));
  if (!bar || !ok.includes(bar)) continue;
  const abs = (f) => resolve(REF, d.name, f);
  libs[d.name] = {
    version: ver(d.name),
    bar: await size({ entryPoints: [abs(bar)] }),
    all: {
      ...(await size({
        stdin: {
          contents: ok
            .map(
              (f, i) =>
                `import * as m${i} from ${JSON.stringify(abs(f))}; globalThis.m${i} = m${i};`,
            )
            .join("\n"),
          resolveDir: resolve("."),
          loader: "js",
        },
      })),
      charts: ok.length,
    },
  };
}
const out = { generated: new Date().toISOString().slice(0, 10), esbuild: version, libs };
writeFileSync("site/compare-size.json", JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify(out, null, 2));
