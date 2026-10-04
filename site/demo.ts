import "mayacharts/element";
import type { ChartSpec, Row } from "../src/index.ts";

type Chart = HTMLElement & { spec: ChartSpec; data: Row[] };
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Show the exact spec object that is rendered, with data cut to 3 rows. */
function show(id: string, spec: ChartSpec): void {
  const el = $<Chart>(id);
  el.spec = spec;
  const shown = JSON.stringify({ ...spec, data: [...spec.data.slice(0, 3), "…"] }, null, 2)
    .replace(/,\n\s*"…"/, ",\n    // … more rows")
    .replace(/\n\s*"…"/, "\n    // … more rows");
  $(`${id}-code`).textContent = shown;
}

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const revenue = [
  12000, 15500, 14200, 18900, 21000, 19800, 24500, 27300, 26100, 29800, 33200, 38500,
];
show("simple", {
  type: "bar",
  title: "Revenue by month",
  x: "month",
  y: "revenue",
  format: "compact",
  data: months.map((month, i) => ({ month, revenue: revenue[i] ?? 0 })),
});

const quarters = ["Q1", "Q2", "Q3", "Q4"];
const regions: Record<string, number[]> = {
  North: [120, 150, 170, 210],
  South: [90, 110, 95, 140],
  West: [60, 80, 130, 160],
};
const grouped: Row[] = quarters.flatMap((quarter, i) =>
  Object.entries(regions).map(([region, v]) => ({ quarter, region, sales: v[i] ?? 0 })),
);
show("grouped", {
  type: "bar",
  title: "Sales by region",
  x: "quarter",
  y: "sales",
  series: "region",
  data: grouped,
});

const returns = [-20, -35, -15, -40];
show("stacked", {
  type: "bar",
  title: "Sales and returns",
  x: "quarter",
  y: "sales",
  series: "region",
  stack: true,
  data: [
    ...grouped,
    ...quarters.map((quarter, i) => ({ quarter, region: "Returns", sales: returns[i] ?? 0 })),
  ],
});

// Live demo: seeded PRNG so the first click always produces the same data.
function mulberry32(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);
const cats = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta"];
const values = (): number[] => cats.map(() => Math.round(rand() * 90 + 10));
const live = $<Chart>("live");
let a = values();
let b = values();
let twoSeries = false;

function liveSpec(): ChartSpec {
  const rows: Row[] = cats.map((cat, i) => ({ cat, series: "A", value: a[i] ?? 0 }));
  if (twoSeries) rows.push(...cats.map((cat, i) => ({ cat, series: "B", value: b[i] ?? 0 })));
  return { type: "bar", title: "Live data", x: "cat", y: "value", series: "series", data: rows };
}
show("live", liveSpec());

$("update").addEventListener("click", () => {
  a = values();
  b = values();
  live.data = liveSpec().data as Row[];
});
$("toggle-series").addEventListener("click", () => {
  twoSeries = !twoSeries;
  live.data = liveSpec().data as Row[];
});

// Theme toggle: auto -> light -> dark.
const modes = ["auto", "light", "dark"] as const;
const css = { auto: "light dark", light: "light", dark: "dark" } as const;
let mode = 0;
$("theme").addEventListener("click", () => {
  mode = (mode + 1) % modes.length;
  const m = modes[mode] ?? "auto";
  document.documentElement.style.colorScheme = css[m];
  $("theme").textContent = `Theme: ${m}`;
});
