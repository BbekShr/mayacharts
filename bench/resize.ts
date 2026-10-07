// Core time of mount (first render) and a re-render of the same data array at another width,
// at 1M rows. Run: node --experimental-strip-types --no-warnings bench/resize.ts [type ...]
import { render } from "../src/core/render.ts";
import "../src/hierarchy.ts";
import "../src/stats.ts";

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const T0 = Date.UTC(2020, 0, 1);
const n = 1e6;
const rows = (f: (i: number) => Record<string, unknown>) =>
  Array.from({ length: n }, (_, i) => f(i));
const G: Record<string, () => Record<string, unknown>> = {
  "line-time": () => ({
    type: "line",
    x: "t",
    xType: "time",
    y: "v",
    data: rows((i) => ({ t: T0 + i * 6e4, v: rnd() })),
  }),
  "line-time-8s": () => ({
    type: "line",
    x: "t",
    xType: "time",
    y: "v",
    series: "s",
    data: rows((i) => ({ t: T0 + (i >> 3) * 6e4, s: "s" + (i & 7), v: rnd() })),
  }),
  "line-cat": () => ({
    type: "line",
    x: "c",
    y: "v",
    data: rows((i) => ({ c: "c" + i, v: rnd() })),
  }),
  scatter: () => ({ type: "scatter", x: "a", y: "b", data: rows(() => ({ a: rnd(), b: rnd() })) }),
  sunburst: () => ({
    type: "sunburst",
    path: ["a", "b", "c"],
    y: "v",
    data: rows((i) => ({ a: "a" + (i % 5), b: "b" + (i % 37), c: "c" + (i % 500), v: rnd() })),
  }),
  boxplot: () => ({
    type: "boxplot",
    x: "g",
    y: "v",
    data: rows((i) => ({ g: "g" + (i % 6), v: rnd() })),
  }),
  "bar-agg": () => ({
    type: "bar",
    x: "c",
    y: "v",
    data: rows((i) => ({ c: "c" + (i % 20), v: rnd() })),
  }),
  "bar-1m": () => ({ type: "bar", x: "c", y: "v", data: rows((i) => ({ c: "c" + i, v: rnd() })) }),
  kpi: () => ({ type: "kpi", x: "t", y: "v", data: rows((i) => ({ t: "d" + i, v: rnd() })) }),
  table: () => ({
    type: "table",
    x: "c",
    y: ["a", "b"],
    data: rows((i) => ({ c: "c" + i, a: rnd(), b: rnd() })),
  }),
};
const only = process.argv.slice(2);
for (const [name, gen] of Object.entries(G)) {
  if (only.length && !only.includes(name)) continue;
  const spec = gen();
  const go = (width: number, view?: object) => {
    const t = performance.now();
    try {
      render(spec as never, { width, height: 400, view } as never);
      return (performance.now() - t).toFixed(0);
    } catch (e) {
      return "FAIL " + ((e as { code?: string }).code ?? (e as Error).message.slice(0, 40));
    }
  };
  const a = go(960);
  const b = go(800);
  const hidden = go(800, { hidden: ["s1"] });
  console.log(name.padEnd(14), "mount", a, "ms | resize", b, "ms | legend toggle", hidden, "ms");
}
