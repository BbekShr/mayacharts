import "mayacharts/element";
import "mayacharts/hierarchy";
import "mayacharts/flow";
import "mayacharts/geo";
import "mayacharts/radial";
import type { ChartSpec, Row } from "../src/index.ts";
import { DAILY, FACTS, mean, mulberry32, rollup, sum } from "./data.ts";

type Chart = HTMLElement & { spec: ChartSpec; data: Row[] };
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Render `spec` into `#id` and print the exact same object, data cut to 3 rows. */
function show(id: string, spec: ChartSpec): void {
  $<Chart>(id).spec = spec;
  const shown = JSON.stringify({ ...spec, data: [...spec.data.slice(0, 3), "…"] }, null, 2)
    .replace(/,\n\s*"…"/, ",\n    // … more rows")
    .replace(/\n\s*"…"/, "\n    // … more rows");
  $(`${id}-code`).textContent = shown;
}

const R = (n: number, d = 0) => +n.toFixed(d);
const rows = (r: Record<string, unknown>[], f: (x: Record<string, any>) => Row): Row[] => r.map(f);

// 1. Monthly line with a measure toggle.
const monthly = (k: (m: number) => number): Row[] =>
  rows(rollup(FACTS, ["monthMs"], { sales: sum("sales"), units: sum("units") }), (r) => {
    const f = k(r.monthMs);
    return { monthMs: r.monthMs, sales: Math.round(r.sales * f), units: Math.round(r.units * f) };
  });
show("monthly-line", {
  type: "line",
  title: "Monthly sales and units",
  x: "monthMs",
  y: ["sales", "units"],
  format: { monthMs: "month", sales: "compact", units: "compact" },
  titles: { sales: "Sales ($)", units: "Units" },
  zoom: true,
  data: monthly(() => 1),
});
const rand = mulberry32(2025);
$("live-btn").addEventListener("click", () => {
  $<Chart>("monthly-line").data = monthly(() => 0.6 + rand() * 0.8);
});

// 2. Cumulative sales by region.
const byRegionMonth = rollup(FACTS, ["monthMs", "region"], { sales: sum("sales") });
const running = new Map<string, number>();
show("pace-lines", {
  type: "line",
  title: "Cumulative sales by region",
  x: "monthMs",
  y: "sales",
  series: "region",
  format: { monthMs: "month", sales: "compact" },
  zoom: true,
  data: rows(byRegionMonth, (r) => {
    const t = (running.get(r.region) ?? 0) + r.sales;
    running.set(r.region, t);
    return { monthMs: r.monthMs, region: r.region, sales: t };
  }),
});

// 3. Stacked area by family.
show("stacked-area", {
  type: "area",
  title: "Sales by product family",
  x: "monthMs",
  y: "sales",
  series: "family",
  stack: true,
  format: { monthMs: "month", sales: "compact" },
  data: rollup(FACTS, ["monthMs", "family"], { sales: sum("sales") }) as Row[],
});

// 4. Waterfall of monthly deltas.
const total = rollup(FACTS, ["monthMs"], { sales: sum("sales") }) as {
  monthMs: number;
  sales: number;
}[];
const mon = (ms: number) =>
  new Date(ms).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
show("waterfall", {
  type: "waterfall",
  title: "Monthly sales through the year",
  x: "step",
  y: "delta",
  totals: ["Total"],
  labels: true,
  format: "compact",
  data: [
    { step: "Jan", delta: total[0]!.sales },
    ...total.slice(1).map((m, i) => ({ step: mon(m.monthMs), delta: m.sales - total[i]!.sales })),
    { step: "Total", delta: 0 },
  ],
});

// 5. Diverging bars: margin against the national average.
const stateMargin = rollup(FACTS, ["state"], { margin: mean("margin") }) as {
  state: string;
  margin: number;
}[];
const avg = stateMargin.reduce((a, r) => a + r.margin, 0) / stateMargin.length;
const sorted = stateMargin
  .map((r) => ({ state: r.state, vsAvg: R(r.margin - avg, 4) }))
  .sort((a, b) => b.vsAvg - a.vsAvg);
show("diverging", {
  type: "bar",
  title: "Margin against the average",
  horizontal: true,
  x: "state",
  y: "vsAvg",
  colorBy: "sign",
  format: "percent",
  sort: "desc",
  limit: 15,
  data: [...sorted.slice(0, 8), ...sorted.slice(-7)],
});

// 6. League table.
show("league", {
  type: "bar",
  title: "Top ten states by sales",
  horizontal: true,
  x: "state",
  y: "sales",
  sort: "desc",
  limit: 10,
  labels: true,
  format: "compact",
  data: rollup(FACTS, ["state"], { sales: sum("sales") }) as Row[],
});

// 7. Bubble.
show("bubble", {
  type: "scatter",
  title: "Price against margin",
  x: "price",
  y: "margin",
  size: "units",
  name: "item",
  series: "family",
  select: true,
  format: { price: "currency", margin: "percent", units: "compact" },
  data: rollup(FACTS, ["item", "family", "price"], {
    margin: mean("margin"),
    units: sum("units"),
  }) as Row[],
});

// 8. Scatter with a color ramp.
show("scatter", {
  type: "scatter",
  title: "Sales against units",
  x: "units",
  y: "sales",
  name: "state",
  colorBy: "margin",
  zoom: true,
  format: { units: "compact", sales: "compact", margin: "percent" },
  data: rollup(FACTS, ["state"], {
    sales: sum("sales"),
    units: sum("units"),
    margin: mean("margin"),
  }) as Row[],
});

// 9. Heatmap.
show("heatmap", {
  type: "heatmap",
  title: "Sales by region and family",
  x: "family",
  y: ["sales", "units"],
  series: "region",
  format: "compact",
  titles: { sales: "Sales", units: "Units" },
  data: rollup(FACTS, ["region", "family"], { sales: sum("sales"), units: sum("units") }) as Row[],
});

// 10. Calendar heatmap.
show("calendar", {
  type: "heatmap",
  title: "Orders by week and weekday",
  x: "week",
  y: "orders",
  series: "weekday",
  aggregate: "sum",
  labels: false,
  data: DAILY.map(({ week, weekday, orders }) => ({ week, weekday, orders })),
});

// 11 and 12. Hierarchy.
const tree = rollup(FACTS, ["region", "family", "item"], { sales: sum("sales") }) as Row[];
show("treemap", {
  type: "treemap",
  title: "Sales by region, family and item",
  path: ["region", "family", "item"],
  y: "sales",
  drill: true,
  format: "compact",
  data: tree,
});
show("sunburst", {
  type: "sunburst",
  title: "Sales by region, family and item",
  path: ["region", "family", "item"],
  y: "sales",
  drill: true,
  format: "compact",
  data: tree,
});

// 13. Sankey over the top items only.
const top = new Set(
  (rollup(FACTS, ["item"], { sales: sum("sales") }) as { item: string; sales: number }[])
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 8)
    .map((r) => r.item),
);
show("sankey", {
  type: "sankey",
  title: "Region to family to item",
  path: ["region", "family", "item"],
  y: "sales",
  format: "compact",
  data: tree.filter((r) => top.has(String(r.item))),
});

// 14. Hexmap.
show("hexmap", {
  type: "hexmap",
  title: "Sales by state",
  x: "state",
  y: "sales",
  format: "compact",
  data: rollup(FACTS, ["state"], { sales: sum("sales") }) as Row[],
});

// 15. KPI with a target bullet: December sales against a goal.
const monthTotals = rollup(FACTS, ["monthMs"], { sales: sum("sales") }) as {
  monthMs: number;
  sales: number;
}[];
show("kpi", {
  type: "kpi",
  title: "December sales",
  x: "month",
  y: "sales",
  colorBy: { target: Math.round((monthTotals[11]!.sales * 1.05) / 1e5) * 1e5 },
  format: { sales: "compact" },
  titles: { sales: "Sales ($)" },
  data: monthTotals.map((m) => ({ month: mon(m.monthMs), sales: m.sales })),
});

// 16. Dumbbell: first half against second half by region and family.
const half = FACTS.map((r) => ({ ...r, half: r.monthMs < Date.UTC(2025, 6, 1) ? "H1" : "H2" }));
show("dumbbell", {
  type: "dumbbell",
  title: "Sales by state, first half to second half",
  x: "state",
  y: "sales",
  series: "half",
  format: "compact",
  data: (rollup(half, ["state", "half"], { sales: sum("sales") }) as Row[]).filter((r) =>
    ["CA", "TX", "NY", "FL", "IL", "WA", "OH", "GA"].includes(String(r.state)),
  ),
});

// 17. Ridgeline: monthly sales profile for each region.
show("ridgeline", {
  type: "ridgeline",
  title: "Monthly sales profile by region",
  x: "monthMs",
  y: "sales",
  series: "region",
  format: { monthMs: "month", sales: "compact" },
  data: byRegionMonth as Row[],
});

// 18. Beeswarm: every item's margin, grouped by family.
show("beeswarm", {
  type: "beeswarm",
  title: "Item margin by product family",
  x: "family",
  y: "margin",
  name: "item",
  format: { margin: "percent" },
  data: rollup(FACTS, ["item", "family"], { margin: mean("margin") }) as Row[],
});

// 19. Parallel coordinates: one line per region across three measures.
show("parallel", {
  type: "parallel",
  title: "Regions across sales, units and margin",
  x: "region",
  y: ["sales", "units", "margin"],
  format: { sales: "compact", units: "compact", margin: "percent" },
  data: rollup(FACTS, ["region"], {
    sales: sum("sales"),
    units: sum("units"),
    margin: mean("margin"),
  }) as Row[],
});

// 20. Table with in-cell bars.
show("table", {
  type: "table",
  title: "Item scorecard",
  x: "item",
  y: ["sales", "units", "margin"],
  format: { sales: "compact", units: "compact", margin: "percent" },
  titles: { sales: "Sales", units: "Units", margin: "Margin" },
  data: rollup(FACTS, ["item"], {
    sales: sum("sales"),
    units: sum("units"),
    margin: mean("margin"),
  }) as Row[],
});

// 21. Chord: region to family.
show("chord", {
  type: "chord",
  title: "Region to product family",
  path: ["region", "family"],
  y: "sales",
  format: "compact",
  data: rollup(FACTS, ["region", "family"], { sales: sum("sales") }) as Row[],
});

// 22. Marimekko: column width is the region total, segments are families.
show("marimekko", {
  type: "marimekko",
  title: "Region size and family mix",
  x: "region",
  y: "sales",
  series: "family",
  format: "compact",
  data: rollup(FACTS, ["region", "family"], { sales: sum("sales") }) as Row[],
});

// 23. Waffle: one hundred cells, one per percent of sales.
show("waffle", {
  type: "waffle",
  title: "Share of sales by family",
  x: "family",
  y: "sales",
  format: "compact",
  data: rollup(FACTS, ["family"], { sales: sum("sales") }) as Row[],
});

// 24. Radial bars: sales by month, stacked by region.
show("radial", {
  type: "radial",
  title: "Sales by month and region",
  x: "monthMs",
  y: "sales",
  series: "region",
  format: { monthMs: "month", sales: "compact" },
  data: byRegionMonth as Row[],
});

// 25. Bar with a second axis: sales as bars, units as the right axis.
show("bar-y2", {
  type: "bar",
  title: "Sales and units by family",
  x: "family",
  y: "sales",
  y2: "units",
  format: { sales: "compact", units: "compact" },
  titles: { sales: "Sales ($)", units: "Units" },
  data: rollup(FACTS, ["family"], { sales: sum("sales"), units: sum("units") }) as Row[],
});

// 26. Horizontal bars with value labels.
show("hbar", {
  type: "bar",
  title: "Sales by product family",
  horizontal: true,
  x: "family",
  y: "sales",
  sort: "desc",
  labels: true,
  format: "compact",
  data: rollup(FACTS, ["family"], { sales: sum("sales") }) as Row[],
});

// 27. Single-series area, which gets the gradient fill.
show("area", {
  type: "area",
  title: "Monthly sales",
  x: "monthMs",
  y: "sales",
  format: { monthMs: "month", sales: "compact" },
  data: monthTotals as Row[],
});

// 28. Line with value labels.
show("line-labels", {
  type: "line",
  title: "Monthly units",
  x: "monthMs",
  y: "units",
  labels: true,
  format: { monthMs: "month", units: "compact" },
  data: rollup(FACTS, ["monthMs"], { units: sum("units") }) as Row[],
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
