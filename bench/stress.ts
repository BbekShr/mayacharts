// Stress sweep: every chart type at growing row counts. Prints ms, output KB and the first failure.
// Run: node --experimental-strip-types bench/stress.ts [type ...]
import { render } from "../src/core/render.ts";
import "../src/hierarchy.ts";
import "../src/flow.ts";
import "../src/geo.ts";
import "../src/radial.ts";
import "../src/stats.ts";
import "../src/weave.ts";
import "../src/units.ts";
import "../src/orbit.ts";
import "../src/constellation.ts";

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const DAY = 864e5;
const T0 = Date.UTC(2020, 0, 1);
const STATES =
  "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC PR".split(
    " ",
  );

type Gen = (n: number) => Record<string, unknown>;
const rows = (n: number, f: (i: number) => Record<string, unknown>) =>
  Array.from({ length: n }, (_, i) => f(i));
const G: Record<string, Gen> = {
  bar: (n) => ({
    type: "bar",
    x: "c",
    y: "v",
    data: rows(n, (i) => ({ c: "c" + i, v: rnd() * 100 })),
  }),
  "bar-stack": (n) => ({
    type: "bar",
    x: "c",
    y: "v",
    series: "s",
    stack: true,
    data: rows(n, (i) => ({ c: "c" + (i >> 2), s: "s" + (i & 3), v: rnd() * 100 })),
  }),
  "bar-labels": (n) => ({
    type: "bar",
    x: "c",
    y: "v",
    labels: true,
    data: rows(n, (i) => ({ c: "c" + i, v: rnd() * 100 })),
  }),
  waterfall: (n) => ({
    type: "waterfall",
    x: "c",
    y: "v",
    data: rows(n, (i) => ({ c: "c" + i, v: rnd() * 100 - 50 })),
  }),
  "line-cat": (n) => ({
    type: "line",
    x: "c",
    y: "v",
    data: rows(n, (i) => ({ c: "c" + i, v: rnd() * 100 })),
  }),
  "line-time": (n) => ({
    type: "line",
    x: "t",
    xType: "time",
    y: "v",
    data: rows(n, (i) => ({ t: T0 + i * 36e5, v: Math.sin(i / 50) * 50 + rnd() * 10 })),
  }),
  "line-time-8s": (n) => ({
    type: "line",
    x: "t",
    xType: "time",
    y: "v",
    series: "s",
    data: rows(n, (i) => ({ t: T0 + Math.floor(i / 8) * 36e5, s: "s" + (i % 8), v: rnd() * 100 })),
  }),
  "area-time": (n) => ({
    type: "area",
    x: "t",
    xType: "time",
    y: "v",
    data: rows(n, (i) => ({ t: T0 + i * 36e5, v: rnd() * 100 })),
  }),
  scatter: (n) => ({
    type: "scatter",
    x: "a",
    y: "b",
    data: rows(n, () => ({ a: rnd() * 1000, b: rnd() * 1000 })),
  }),
  "scatter-series": (n) => ({
    type: "scatter",
    x: "a",
    y: "b",
    series: "s",
    size: "z",
    data: rows(n, (i) => ({ a: rnd() * 1000, b: rnd() * 1000, s: "s" + (i % 5), z: rnd() })),
  }),
  heatmap: (n) => {
    const w = Math.ceil(Math.sqrt(n));
    return {
      type: "heatmap",
      x: "x",
      series: "y",
      y: "v",
      data: rows(n, (i) => ({ x: "x" + (i % w), y: "y" + Math.floor(i / w), v: rnd() })),
    };
  },
  kpi: (n) => ({
    type: "kpi",
    x: "t",
    y: "v",
    data: rows(n, (i) => ({ t: "d" + i, v: rnd() * 100 })),
  }),
  dumbbell: (n) => ({
    type: "dumbbell",
    x: "c",
    y: "v",
    series: "s",
    data: rows(n, (i) => ({ c: "c" + (i >> 1), s: i & 1 ? "b" : "a", v: rnd() * 100 })),
  }),
  ridgeline: (n) => ({
    type: "ridgeline",
    x: "t",
    y: "v",
    series: "s",
    data: rows(n, (i) => ({ t: T0 + Math.floor(i / 6) * DAY, s: "s" + (i % 6), v: rnd() * 100 })),
  }),
  beeswarm: (n) => ({
    type: "beeswarm",
    x: "g",
    y: "v",
    data: rows(n, (i) => ({ g: "g" + (i % 4), v: rnd() * 100 })),
  }),
  parallel: (n) => ({
    type: "parallel",
    x: "c",
    y: ["a", "b", "d"],
    data: rows(n, (i) => ({ c: "c" + i, a: rnd(), b: rnd(), d: rnd() })),
  }),
  table: (n) => ({
    type: "table",
    x: "c",
    y: ["a", "b"],
    data: rows(n, (i) => ({ c: "c" + i, a: rnd(), b: rnd() })),
  }),
  treemap: (n) => ({
    type: "treemap",
    path: ["a", "b", "c"],
    y: "v",
    data: rows(n, (i) => ({ a: "a" + (i % 5), b: "b" + (i % 37), c: "c" + i, v: rnd() * 100 })),
  }),
  sunburst: (n) => ({
    type: "sunburst",
    path: ["a", "b", "c"],
    y: "v",
    data: rows(n, (i) => ({ a: "a" + (i % 5), b: "b" + (i % 37), c: "c" + i, v: rnd() * 100 })),
  }),
  sankey: (n) => ({
    type: "sankey",
    path: ["a", "b", "c"],
    y: "v",
    data: rows(n, (i) => ({
      a: "a" + (i % 5),
      b: "b" + (i % 13),
      c: "c" + (i % 97),
      v: rnd() * 100,
    })),
  }),
  chord: (n) => ({
    type: "chord",
    path: ["a", "b"],
    y: "v",
    data: rows(n, (i) => ({ a: "a" + (i % 30), b: "b" + ((i * 7) % 30), v: rnd() * 100 })),
  }),
  marimekko: (n) => ({
    type: "marimekko",
    x: "c",
    y: "v",
    series: "s",
    data: rows(n, (i) => ({ c: "c" + (i % 40), s: "s" + (i % 8), v: rnd() * 100 })),
  }),
  waffle: (n) => ({
    type: "waffle",
    x: "c",
    y: "v",
    data: rows(n, (i) => ({ c: "c" + (i % 8), v: rnd() * 100 })),
  }),
  hexmap: (n) => ({
    type: "hexmap",
    x: "st",
    y: "v",
    data: rows(n, (i) => ({ st: STATES[i % STATES.length], v: rnd() * 100 })),
  }),
  radial: (n) => ({
    type: "radial",
    x: "c",
    y: "v",
    data: rows(n, (i) => ({ c: "c" + i, v: rnd() * 100 })),
  }),
  boxplot: (n) => ({
    type: "boxplot",
    x: "g",
    y: "v",
    data: rows(n, (i) => ({ g: "g" + (i % 6), v: rnd() * 100 })),
  }),
  funnel: (n) => ({
    type: "funnel",
    x: "c",
    y: "v",
    data: rows(n, (i) => ({ c: "c" + i, v: 1000 - i })),
  }),
  weave: (n) => ({
    type: "weave",
    x: "q",
    y: "v",
    series: "s",
    data: rows(n, (i) => ({ q: "q" + Math.floor(i / 8), s: "s" + (i % 8), v: rnd() * 100 })),
  }),
  units: (n) => ({
    type: "units",
    x: "g",
    y: "v",
    data: rows(n, (i) => ({ g: "g" + (i % 4), v: rnd() * 100 })),
  }),
  orbit: (n) => ({
    type: "orbit",
    x: "c",
    y: "v",
    y2: "g",
    data: rows(n, (i) => ({ c: "c" + i, v: rnd() * 100, g: rnd() * 40 - 10 })),
  }),
  constellation: (n) => ({
    type: "constellation",
    x: "c",
    y: ["a", "b", "d", "e"],
    data: rows(n, (i) => ({ c: "c" + i, a: rnd(), b: rnd(), d: rnd(), e: rnd() })),
  }),
};

const NS = [10, 100, 1000, 5000, 10000, 20000, 100000, 1000000];
const BUDGET_MS = 2000;
const only = process.argv.slice(2);
const out: string[] = [];
for (const [name, gen] of Object.entries(G)) {
  if (only.length && !only.includes(name)) continue;
  const cells: string[] = [];
  for (const n of NS) {
    const spec = gen(n);
    try {
      render(spec as never); // warm
      const t = performance.now();
      const svg = render(spec as never);
      const ms = performance.now() - t;
      cells.push(`${n}: ${ms.toFixed(0)}ms ${(svg.length / 1024).toFixed(0)}KB`);
      if (ms > BUDGET_MS) break;
    } catch (e) {
      const code = (e as { code?: string }).code ?? (e as Error).message.slice(0, 50);
      cells.push(`${n}: FAIL ${code}`);
      break;
    }
  }
  const line = `${name.padEnd(15)} ${cells.join(" | ")}`;
  console.log(line);
  out.push(line);
}
