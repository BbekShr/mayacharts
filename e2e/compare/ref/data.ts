// Reference charts contract (0.5 scoreboard). Read this before writing a ref.
//
// One module per library per chart: e2e/compare/ref/<lib>/<chart>.js (.jsx for React libraries).
// Each module is the idiomatic, minimal code a user of that library would write from its docs,
// with the library's defaults: no theming, no tuning. Its length is what the ease row measures, so
// data reshaping (pivots, node lists) belongs in the module, not in this file.
//
//   export default async function draw(root, data) { ...; return (next) => { ... } }
//
// `root` is an empty 640x360 block element. `data` is refData()[chart], long-format rows. The
// optional returned function redraws with new rows of the same shape; the speed suite calls it.
// Titles come from TITLES (every library gets the same accessible name). Imports are bare npm
// specifiers; maya refs import from src/. scripts/compare-bundle.mjs bundles every module into
// e2e/compare/.build/<lib>/<chart>.js and ref.html runs one: ref.html?lib=echarts&chart=bar.
// A library without the chart type writes `export const unsupported = "reason";` and no draw.
import { makeData } from "../data.ts";

export const LIBS = [
  "maya",
  "chartjs",
  "echarts",
  "plot",
  "vegalite",
  "recharts",
  "nivo",
  "plotly",
] as const;
export type Lib = (typeof LIBS)[number];

/** Not benchmarked, with the reason shown on the scoreboard. */
export const EXCLUDED: Record<string, string> = {
  apexcharts: "Its licence forbids use in competing charting products, so it is not benchmarked.",
  highcharts:
    "Not free software; left out until its terms are confirmed to allow a public comparison.",
};

export const CHARTS = [
  "bar",
  "grouped",
  "stacked",
  "horizontal",
  "line",
  "multiline",
  "area",
  "scatter",
  "bubble",
  "heatmap",
  "treemap",
  "sankey",
] as const;
export type Chart = (typeof CHARTS)[number];

export const TITLES: Record<Chart, string> = {
  bar: "Value by category",
  grouped: "Value by category and region",
  stacked: "Value by category, stacked by region",
  horizontal: "Value by category, horizontal",
  line: "Monthly value",
  multiline: "Monthly value, plan and actual",
  area: "Monthly value by region, stacked",
  scatter: "Scatter of 500 points",
  bubble: "Income, life expectancy and population",
  heatmap: "Value by hour and weekday",
  treemap: "Sales by family and item",
  sankey: "Visits by channel and outcome",
};

/** Rows per chart. Field names are the contract every ref reads. */
export interface RefData {
  bar: { cat: string; value: number }[];
  grouped: { cat: string; region: string; value: number }[];
  stacked: { cat: string; region: string; value: number }[];
  horizontal: { cat: string; value: number }[];
  line: { date: string; value: number }[];
  multiline: { date: string; series: string; value: number }[];
  area: { date: string; region: string; value: number }[];
  scatter: { x: number; y: number }[];
  bubble: { country: string; income: number; life: number; population: number }[];
  heatmap: { hour: string; day: string; value: number }[];
  treemap: { family: string; item: string; sales: number }[];
  sankey: { source: string; target: string; value: number }[];
}

function rng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const iso = (t: number): string => new Date(t).toISOString().slice(0, 10);

export function refData(): RefData {
  const base = makeData();
  const r = rng(20261004);
  const grouped = base.bar.map((d) => ({ cat: d.cat, region: d.series, value: d.value }));
  const bar = grouped.filter((d) => d.region === "North").map(({ cat, value }) => ({ cat, value }));
  const multiline = base.line.map((d) => ({ date: iso(d.t), series: d.series, value: d.value }));
  const area = ["North", "South", "West"].flatMap((region, k) =>
    Array.from({ length: 24 }, (_, m) => ({
      date: iso(Date.UTC(2024, m, 1)),
      region,
      value: Math.round(30 + k * 10 + m * 1.5 + r() * 12),
    })),
  );
  const bubble = Array.from({ length: 30 }, (_, i) => {
    const income = Math.round(1000 + r() * r() * 60000);
    return {
      country: `Country ${String(i + 1).padStart(2, "0")}`,
      income,
      life: Math.round((55 + Math.log10(income) * 5 + r() * 6) * 10) / 10,
      population: Math.round(2 + r() * r() * 300),
    };
  });
  const families = ["Produce", "Dairy", "Bakery", "Frozen", "Pantry"];
  const treemap = families.flatMap((family, k) =>
    Array.from({ length: 3 + k }, (_, i) => ({
      family,
      item: `${family} ${i + 1}`,
      sales: Math.round(20 + r() * 180),
    })),
  );
  const sankey = ["Search", "Social", "Email", "Direct", "Referral"].flatMap((source) =>
    ["Bounced", "Browsed", "Signed up", "Bought"].map((target) => ({
      source,
      target,
      value: Math.round(10 + r() * 90),
    })),
  );
  return {
    bar,
    grouped,
    stacked: grouped,
    horizontal: bar,
    line: multiline
      .filter((d) => d.series === "Actual")
      .map(({ date, value }) => ({ date, value })),
    multiline,
    area,
    scatter: base.scatter.slice(0, 500),
    bubble,
    heatmap: base.heatmap,
    treemap,
    sankey,
  };
}

/** Speed suite rows: `n` points for the scatter and line refs (line rows get ISO dates, one per minute). */
export function speedRows(
  n: number,
  seed = 1,
): { scatter: RefData["scatter"]; line: RefData["line"] } {
  const r = rng(seed);
  const scatter = new Array(n);
  const line = new Array(n);
  let v = 100;
  const t0 = Date.UTC(2024, 0, 1);
  for (let i = 0; i < n; i++) {
    const x = r() * 100;
    scatter[i] = { x: Math.round(x * 100) / 100, y: Math.round((x * 0.6 + r() * 40) * 100) / 100 };
    v += r() - 0.5;
    line[i] = { date: new Date(t0 + i * 60_000).toISOString(), value: Math.round(v * 100) / 100 };
  }
  return { scatter, line };
}
