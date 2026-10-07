// Stress the other axes: many series, long labels, deep paths, tiny and huge sizes, extreme values.
// Run: node --experimental-strip-types bench/width.ts
import { render } from "../src/core/render.ts";
import "../src/hierarchy.ts";
import "../src/flow.ts";

const rows = (n: number, f: (i: number) => Record<string, unknown>) =>
  Array.from({ length: n }, (_, i) => f(i));
const run = (name: string, spec: Record<string, unknown>, opts: Record<string, unknown> = {}) => {
  try {
    const t = performance.now();
    const svg = render(spec as never, opts as never);
    console.log(
      `${name.padEnd(34)} ${(performance.now() - t).toFixed(0).padStart(5)}ms ${(svg.length / 1024).toFixed(0).padStart(6)}KB`,
    );
  } catch (e) {
    console.log(
      `${name.padEnd(34)} FAIL ${(e as { code?: string }).code ?? (e as Error).message.slice(0, 80)}`,
    );
  }
};
for (const s of [8, 50, 200, 1000])
  run(`line ${s} series x 20`, {
    type: "line",
    x: "c",
    y: "v",
    series: "s",
    data: rows(s * 20, (i) => ({ c: "c" + (i % 20), s: "s" + Math.floor(i / 20), v: i % 97 })),
  });
for (const s of [8, 50, 200])
  run(`stacked bar ${s} series x 10`, {
    type: "bar",
    x: "c",
    y: "v",
    series: "s",
    stack: true,
    data: rows(s * 10, (i) => ({ c: "c" + (i % 10), s: "s" + Math.floor(i / 10), v: 1 + (i % 7) })),
  });
for (const m of [3, 10, 30])
  run(`table ${m} measures x 50`, {
    type: "table",
    x: "c",
    y: rows(m, (i) => "m" + i)
      .map((r) => Object.keys(r)[0])
      .map((_, i) => "m" + i),
    data: rows(50, (i) =>
      Object.fromEntries([["c", "c" + i], ...rows(m, (j) => ({})).map((_, j) => ["m" + j, i * j])]),
    ),
  });
for (const L of [100, 1000, 100000])
  run(`bar label length ${L}`, {
    type: "bar",
    x: "c",
    y: "v",
    data: rows(10, (i) => ({ c: "x".repeat(L) + i, v: i })),
  });
for (const d of [3, 6, 10])
  run(`treemap path depth ${d}`, {
    type: "treemap",
    path: rows(d, (i) => "p" + i).map((_, i) => "p" + i),
    y: "v",
    data: rows(2000, (i) =>
      Object.fromEntries([
        ["v", 1 + (i % 9)],
        ...rows(d, () => ({})).map((_, j) => ["p" + j, "n" + ((i >> j) % 4)]),
      ]),
    ),
  });
for (const [w, h] of [
  [40, 30],
  [120, 80],
  [4000, 3000],
  [20000, 200],
])
  run(
    `bar 30 at ${w}x${h}`,
    { type: "bar", x: "c", y: "v", data: rows(30, (i) => ({ c: "c" + i, v: i })) },
    { width: w, height: h },
  );
run("values 1e300 / -1e300", {
  type: "bar",
  x: "c",
  y: "v",
  data: [
    { c: "a", v: 1e300 },
    { c: "b", v: -1e300 },
  ],
});
run("values 1e-300", {
  type: "line",
  x: "c",
  y: "v",
  data: [
    { c: "a", v: 1e-300 },
    { c: "b", v: 2e-300 },
  ],
});
run("values all equal", {
  type: "scatter",
  x: "a",
  y: "v",
  data: rows(1000, () => ({ a: 5, v: 5 })),
});
run("time 1 ms apart x 10k", {
  type: "line",
  x: "t",
  xType: "time",
  y: "v",
  data: rows(10000, (i) => ({ t: 1e12 + i, v: i % 13 })),
});
run("time 1000 years span", {
  type: "line",
  x: "t",
  xType: "time",
  y: "v",
  data: rows(2000, (i) => ({ t: Date.UTC(1000 + Math.floor(i / 2), 0, 1), v: i % 13 })),
});
run("sankey 500 nodes per level", {
  type: "sankey",
  path: ["a", "b"],
  y: "v",
  data: rows(5000, (i) => ({ a: "a" + (i % 500), b: "b" + ((i * 7) % 500), v: 1 })),
});
run("chord 300 groups", {
  type: "chord",
  path: ["a", "b"],
  y: "v",
  data: rows(5000, (i) => ({ a: "g" + (i % 300), b: "g" + ((i * 7) % 300), v: 1 })),
});
run("heatmap 70x70", {
  type: "heatmap",
  x: "x",
  series: "y",
  y: "v",
  data: rows(4900, (i) => ({ x: "x" + (i % 70), y: "y" + Math.floor(i / 70), v: i })),
});
