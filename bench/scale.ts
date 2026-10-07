// The Scale page's eleven specs over one shared 1M-row array, drawn twice (then at another width).
// Run: node --experimental-strip-types --no-warnings bench/scale.ts
import { renderParts } from "../src/core/render.ts";
import "../src/hierarchy.ts";
import "../src/flow.ts";
import "../src/stats.ts";

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const CH = ["Web", "App", "Store", "Phone", "Wholesale", "Marketplace", "Partner", "Kiosk"];
const data = Array.from({ length: 1e6 }, (_, i) => {
  const leaf = Math.floor(rnd() ** 1.6 * 432);
  return {
    t: Date.UTC(2025, 0, 1) + (i >> 3) * 6e4,
    s: CH[i & 7]!,
    v: 50 + rnd() * 100,
    o: rnd() * 400,
    p: rnd() * 150,
    a: "R" + Math.floor(leaf / 72),
    b: "F" + (Math.floor(leaf / 12) % 6),
    c: "SKU " + leaf,
    i,
  };
});
const T = { x: "t", xType: "time", y: "v" } as const;
const specs: Record<string, object> = {
  line: { type: "line", ...T, zoom: true },
  "line-8": { type: "line", ...T, series: "s", zoom: true },
  area: { type: "area", ...T, series: "s", stack: true },
  kpi: { type: "kpi", x: "t", y: "v" },
  scatter: { type: "scatter", x: "p", y: "o", zoom: true, legend: true },
  beeswarm: { type: "beeswarm", x: "b", y: "p" },
  boxplot: { type: "boxplot", x: "s", y: "v" },
  "bar-top": { type: "bar", x: "c", y: "v", sort: "desc", limit: 15, horizontal: true },
  "bar-ids": { type: "bar", x: "i", y: "o", sort: "desc" },
  sunburst: { type: "sunburst", path: ["a", "b", "c"], y: "v", drill: true },
  sankey: { type: "sankey", path: ["a", "b", "s"], y: "v" },
};
for (const [pass, width] of [
  ["first", 960],
  ["second", 960],
  ["resize 800", 800],
  ["resize 761", 761],
] as const) {
  const out: string[] = [];
  let all = 0;
  for (const [k, spec] of Object.entries(specs)) {
    const t = performance.now();
    renderParts({ ...spec, data } as never, { width, height: 320 });
    const ms = performance.now() - t;
    all += ms;
    out.push(`${k} ${ms.toFixed(0)}`);
  }
  console.log(pass.padEnd(11), `total ${all.toFixed(0)} ms |`, out.join(", "));
}
