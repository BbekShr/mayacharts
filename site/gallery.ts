import "mayacharts/element";
import "mayacharts/hierarchy";
import "mayacharts/flow";
import "mayacharts/geo";
import "mayacharts/radial";
import "mayacharts/stats";
import "mayacharts/constellation";
import "mayacharts/units";
import "mayacharts/orbit";
import "mayacharts/weave";
import type { ChartSpec, Row } from "../src/index.ts";
import {
  makeAccounts,
  makeData,
  makeGrowth,
  makeLive,
  makeFunnel,
  makeMonths,
  makePoints,
  makeRanks,
  makeReadings,
  makeUnits,
  mean,
  rollup,
  sum,
  type Dataset,
} from "./data.ts";
import { theme } from "./theme.ts";

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
const mon = (ms: number) =>
  new Date(ms).toLocaleString("en-US", { month: "short", timeZone: "UTC" });

/** The live feed has no frame field: its windows are stepped by the loop printed beside it. */
let feedWindows: ChartSpec[] = [];
const feedLoop = `const chart = document.querySelector("maya-chart");
const rows = spec.data; // spec: the object above
let i = 0;
setInterval(() => {
  const n = 3 * (i++ % (rows.length / 3 - 39));
  chart.spec = { ...spec, data: rows.slice(n, n + 120) };
}, 600);`;

/** Every tile's spec, built from one dataset. Re-rolling a tile rebuilds it from a new seed. */
function specs({ FACTS, DAILY }: Dataset): Record<string, ChartSpec> {
  const out: Record<string, ChartSpec> = {};
  const tile = (id: string, spec: ChartSpec) => (out[id] = spec);

  // 1. Monthly line with a measure toggle.
  tile("monthly-line", {
    type: "line",
    title: "Monthly sales and units",
    x: "monthMs",
    y: ["sales", "units"],
    format: { monthMs: "month", sales: "compact", units: "compact" },
    titles: { sales: "Sales ($)", units: "Units" },
    zoom: true,
    data: FACTS,
  });

  // 2. Cumulative sales by region.
  const byRegionMonth = rollup(FACTS, ["monthMs", "region"], { sales: sum("sales") });
  const running = new Map<string, number>();
  tile("pace-lines", {
    type: "line",
    title: "Cumulative sales by region",
    titles: { sales: "Sales ($)" },
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
  tile("stacked-area", {
    type: "area",
    title: "Sales by product family",
    titles: { sales: "Sales ($)" },
    x: "monthMs",
    y: "sales",
    series: "family",
    stack: true,
    format: { monthMs: "month", sales: "compact" },
    data: FACTS,
  });

  // 4. Waterfall of monthly deltas.
  const total = rollup(FACTS, ["monthMs"], { sales: sum("sales") }) as {
    monthMs: number;
    sales: number;
  }[];
  tile("waterfall", {
    type: "waterfall",
    title: "Monthly sales through the year",
    titles: { delta: "Change ($)" },
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
  tile("diverging", {
    type: "bar",
    title: "Margin against the average",
    titles: { vsAvg: "Margin vs average" },
    horizontal: true,
    x: "state",
    y: "vsAvg",
    colorBy: "sign",
    format: "percent",
    sort: "desc",
    limit: 15,
    labels: true,
    data: [...sorted.slice(0, 8), ...sorted.slice(-7)],
  });

  // 6. League table.
  tile("league", {
    type: "bar",
    title: "Top ten states by sales",
    titles: { sales: "Sales ($)" },
    horizontal: true,
    x: "state",
    y: "sales",
    sort: "desc",
    limit: 10,
    labels: true,
    format: "compact",
    data: FACTS,
  });

  // 7. Bubble.
  tile("bubble", {
    type: "scatter",
    title: "Price against margin",
    titles: { price: "Price", margin: "Margin", units: "Units", item: "Item" },
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
  tile("scatter", {
    type: "scatter",
    title: "Sales against units",
    titles: { units: "Units", sales: "Sales ($)", margin: "Margin", state: "State" },
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
  tile("heatmap", {
    type: "heatmap",
    title: "Sales by region and family",
    x: "family",
    y: ["sales", "units"],
    series: "region",
    format: "compact",
    titles: { sales: "Sales", units: "Units" },
    data: FACTS,
  });

  // 10. Calendar heatmap.
  tile("calendar", {
    type: "heatmap",
    title: "Orders by week and weekday",
    x: "week",
    y: "orders",
    series: "weekday",
    aggregate: "sum",
    labels: false,
    titles: { orders: "Orders", week: "Week" },
    // Rows follow first appearance, so start on the first Monday: weeks run Mon to Sun.
    data: DAILY.filter((d) => d.week > 1).map(({ week, weekday, orders }) => ({
      week: `Week ${week - 1}`,
      weekday,
      orders,
    })),
  });

  // 11 and 12. Hierarchy.
  const tree = rollup(FACTS, ["region", "family", "item"], { sales: sum("sales") }) as Row[];
  tile("treemap", {
    type: "treemap",
    title: "Sales by region, family and item",
    titles: { sales: "Sales ($)" },
    path: ["region", "family", "item"],
    y: "sales",
    drill: true,
    format: "compact",
    data: tree,
  });
  tile("sunburst", {
    type: "sunburst",
    title: "Sales by region, family and item",
    titles: { sales: "Sales ($)" },
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
  tile("sankey", {
    type: "sankey",
    title: "Region to family to item",
    titles: { sales: "Sales ($)" },
    path: ["region", "family", "item"],
    y: "sales",
    format: "compact",
    data: tree.filter((r) => top.has(String(r.item))),
  });

  // 13b. Sankey you can drill: a family opens into its items and the regions that buy them.
  tile("sankey-drill", {
    type: "sankey",
    title: "Family to item to region",
    titles: { sales: "Sales ($)", family: "Family", item: "Item", region: "Region" },
    path: ["family", "item", "region"],
    y: "sales",
    drill: true,
    format: "compact",
    data: (rollup(FACTS, ["family", "item", "region"], { sales: sum("sales") }) as Row[]).filter(
      (r) => top.has(String(r.item)),
    ),
  });

  // 14. Hexmap.
  tile("hexmap", {
    type: "hexmap",
    title: "Sales by state",
    titles: { sales: "Sales ($)" },
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
  tile("kpi", {
    type: "kpi",
    title: "December sales",
    x: "month",
    y: "sales",
    colorBy: { target: Math.round((monthTotals[11]!.sales * 1.05) / 1e5) * 1e5 },
    format: "compact",
    titles: { sales: "Sales ($)" },
    data: monthTotals.map((m) => ({ month: mon(m.monthMs), sales: m.sales })),
  });

  // Weave: a bump chart of product lines; the climbing thread passes over the falling one.
  tile("weave", {
    type: "weave",
    title: "Product line rank by quarter",
    titles: { sales: "Sales ($K)" },
    x: "quarter",
    y: "sales",
    series: "line",
    select: true,
    data: makeRanks(5),
  });

  // 16. Dumbbell: first half against second half by region and family.
  const half = FACTS.map((r) => ({ ...r, half: r.monthMs < Date.UTC(2025, 6, 1) ? "H1" : "H2" }));
  tile("dumbbell", {
    type: "dumbbell",
    title: "Sales by state, first half to second half",
    titles: { sales: "Sales ($)" },
    x: "state",
    y: "sales",
    series: "half",
    format: "compact",
    data: (rollup(half, ["state", "half"], { sales: sum("sales") }) as Row[]).filter((r) =>
      ["CA", "TX", "NY", "FL", "IL", "WA", "OH", "GA"].includes(String(r.state)),
    ),
  });

  // 17. Ridgeline: monthly sales profile for each region.
  tile("ridgeline", {
    type: "ridgeline",
    title: "Monthly sales profile by region",
    x: "monthMs",
    y: "sales",
    series: "region",
    format: { monthMs: "month", sales: "compact" },
    data: FACTS,
  });

  // 18. Beeswarm: every item's margin, grouped by family.
  tile("beeswarm", {
    type: "beeswarm",
    title: "Item margin by product family",
    titles: { margin: "Margin", item: "Item" },
    x: "family",
    y: "margin",
    name: "item",
    format: "percent",
    data: rollup(FACTS, ["item", "family"], { margin: mean("margin") }) as Row[],
  });

  // 18b. Box plot: the same margins as boxes, one dot per row.
  tile("boxplot", {
    type: "boxplot",
    title: "Margin spread by product family",
    titles: { margin: "Margin", family: "Family", item: "Item" },
    x: "family",
    y: "margin",
    name: "item",
    format: { margin: "percent" },
    data: rows(rollup(FACTS, ["item", "family", "region"], { margin: mean("margin") }), (r) => ({
      family: r.family,
      item: `${r.item}, ${r.region}`,
      margin: r.margin,
    })),
  });

  // 18c. Funnel: five shopping stages with the share kept at each step.
  tile("funnel", {
    type: "funnel",
    title: "Visits to paid orders",
    titles: { users: "Users" },
    x: "stage",
    y: "users",
    format: "compact",
    data: makeFunnel(seedOf(FACTS)),
  });

  // 19. Parallel coordinates: one line per region across three measures.
  tile("parallel", {
    type: "parallel",
    title: "Regions across sales, units and margin",
    titles: { sales: "Sales ($)", units: "Units", margin: "Margin" },
    x: "region",
    y: ["sales", "units", "margin"],
    series: "region",
    format: { sales: "compact", units: "compact", margin: "percent" },
    data: rollup(FACTS, ["region"], {
      sales: sum("sales"),
      units: sum("units"),
      margin: mean("margin"),
    }) as Row[],
  });

  // 20. Table with in-cell bars.
  tile("table", {
    type: "table",
    title: "Item scorecard",
    x: "item",
    y: ["sales", "units", "margin"],
    format: { sales: "compact", units: "compact", margin: "percent" },
    titles: { item: "Item", sales: "Sales", units: "Units", margin: "Margin" },
    data: rollup(FACTS, ["item"], {
      sales: sum("sales"),
      units: sum("units"),
      margin: mean("margin"),
    }) as Row[],
  });

  // 21. Chord: region to family.
  tile("chord", {
    type: "chord",
    title: "Region to product family",
    titles: { sales: "Sales ($)", region: "Region", family: "Family" },
    path: ["region", "family"],
    y: "sales",
    format: "compact",
    data: FACTS,
  });

  // 22. Marimekko: column width is the region total, segments are families.
  tile("marimekko", {
    type: "marimekko",
    title: "Region size and family mix",
    titles: { sales: "Sales ($)" },
    x: "region",
    y: "sales",
    series: "family",
    format: "compact",
    data: FACTS,
  });

  // 23. Waffle: one hundred cells, one per percent of sales.
  tile("waffle", {
    type: "waffle",
    title: "Share of sales by family",
    titles: { sales: "Sales ($)" },
    x: "family",
    y: "sales",
    format: "compact",
    data: FACTS,
  });

  // 23c. Units: one dot per customer, flying between a waffle, bars by region and a spend swarm.
  tile("units", {
    type: "units",
    title: "Customers by region and spend",
    titles: { spend: "Annual spend ($)", region: "Region", customer: "Customer" },
    x: "region",
    y: "spend",
    name: "customer",
    format: { spend: "compact" },
    select: true,
    data: makeUnits(11),
  });

  // 23b. Percent stack: every bar filled to 100%, so the mix compares across regions.
  tile("share-bar", {
    type: "bar",
    title: "Family mix by region",
    titles: { sales: "Share of sales" },
    x: "region",
    y: "sales",
    series: "family",
    stack: "percent",
    data: FACTS,
  });

  // 24. Radial bars: monthly sales (one series, so the tip totals show).
  tile("radial", {
    type: "radial",
    title: "Sales by month",
    titles: { sales: "Sales ($)" },
    x: "monthMs",
    y: "sales",
    format: { monthMs: "month", sales: "compact" },
    data: FACTS,
  });

  // 25. Bar with a second axis: sales as bars, units as the right axis.
  tile("bar-y2", {
    type: "bar",
    title: "Sales and units by family",
    x: "family",
    y: "sales",
    y2: "units",
    format: { sales: "compact", units: "compact" },
    titles: { sales: "Sales ($)", units: "Units" },
    data: FACTS,
  });

  // 26. Horizontal bars with value labels; click a family to drill into its items.
  tile("hbar", {
    type: "bar",
    title: "Sales by product family and item",
    titles: { sales: "Sales ($)" },
    horizontal: true,
    path: ["family", "item"],
    drill: true,
    y: "sales",
    sort: "desc",
    labels: true,
    format: "compact",
    data: FACTS,
  });

  // 27. Single-series area, which gets the gradient fill.
  tile("area", {
    type: "area",
    title: "Monthly sales",
    titles: { sales: "Sales ($)" },
    x: "monthMs",
    y: "sales",
    format: { monthMs: "month", sales: "compact" },
    data: monthTotals as Row[],
  });

  // 27b. Reference lines: a numeric target above most of the data widens the axis, "mean" is computed.
  tile("rules", {
    type: "bar",
    title: "Monthly sales against target",
    titles: { sales: "Sales ($)" },
    x: "month",
    y: "sales",
    rules: [
      {
        y: Math.round((Math.max(...monthTotals.map((m) => m.sales)) * 1.15) / 1e5) * 1e5,
        label: "Target",
      },
      "mean",
    ],
    format: "compact",
    data: monthTotals.map((m) => ({ month: mon(m.monthMs), sales: m.sales })),
  });

  // 28. Line with value labels.
  tile("line-labels", {
    type: "line",
    title: "Monthly units",
    titles: { units: "Units" },
    x: "monthMs",
    y: "units",
    labels: true,
    format: { monthMs: "month", units: "compact" },
    data: rollup(FACTS, ["monthMs"], { units: sum("units") }) as Row[],
  });

  // 29. Scatter past the mark cap: 50 000 points become density cells; zoom brings circles back.
  tile("scatter-dense", {
    type: "scatter",
    title: "50 000 points",
    legend: true,
    x: "spend",
    y: "revenue",
    zoom: true,
    titles: { spend: "Spend", revenue: "Revenue" },
    format: { spend: "compact", revenue: "compact" },
    data: makePoints(seedOf(FACTS)),
  });

  // 30. Time axis: 20 000 irregular ISO timestamps with two gaps.
  tile("time-line", {
    type: "line",
    title: "Load, 20 000 readings",
    x: "time",
    y: "load",
    zoom: true,
    titles: { load: "Load" },
    data: makeReadings(seedOf(FACTS)),
  });

  // 31. Time axis on bars: ISO months, one missing.
  tile("time-bar", {
    type: "bar",
    title: "Orders by month",
    titles: { orders: "Orders", month: "Month" },
    x: "month",
    y: "orders",
    format: "compact",
    data: makeMonths(seedOf(FACTS)),
  });

  // 32. Bar race: one frame per month. A running total is host prep: one row per state and month.
  const best = new Set(
    (
      rollup(FACTS, ["stateName"], { sales: sum("sales") }) as {
        stateName: string;
        sales: number;
      }[]
    )
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 12)
      .map((r) => r.stateName),
  );
  const cum = new Map<string, number>();
  tile("race", {
    type: "bar",
    title: "Sales race by state",
    titles: { sales: "Sales ($)" },
    horizontal: true,
    x: "stateName",
    y: "sales",
    sort: "desc",
    labels: true,
    frame: "month",
    format: { month: { month: "short" }, sales: "compact" },
    data: rows(
      rollup(
        FACTS.filter((r) => best.has(r.stateName)),
        ["month", "stateName"],
        { sales: sum("sales") },
      ),
      (r) => {
        const t = (cum.get(r.stateName) ?? 0) + r.sales;
        cum.set(r.stateName, t);
        return { month: r.month, stateName: r.stateName, sales: t };
      },
    ),
  });

  // 35. Orrery: size is sales, orbit rank follows size, speed and direction are growth.
  tile("orbit", {
    type: "orbit",
    title: "Sales and growth by family",
    titles: { sales: "Sales ($)", growth: "Growth (%)" },
    x: "family",
    y: "sales",
    y2: "growth",
    format: { sales: "compact" },
    colorBy: "sign",
    select: true,
    data: makeGrowth(23),
  });

  // 33. Moving bubbles: one per state and month; the axes span every frame, so only the bubbles move.
  tile("drift", {
    type: "scatter",
    title: "Sales and margin by state",
    titles: { sales: "Sales ($)", margin: "Margin", units: "Units", stateName: "State" },
    x: "sales",
    y: "margin",
    size: "units",
    name: "stateName",
    series: "region",
    frame: "month",
    format: { month: { month: "short" }, sales: "compact", margin: "percent", units: "compact" },
    data: rollup(FACTS, ["month", "stateName", "region"], {
      sales: sum("sales"),
      units: sum("units"),
      margin: mean("margin"),
    }) as Row[],
  });

  // 34. Live line: three sensors, a new reading every 600 ms, the last 40 kept.
  const live = makeLive(seedOf(FACTS));
  const feed: ChartSpec = {
    type: "line",
    title: "Sensor load, last 40 readings",
    titles: { load: "Load" },
    x: "time",
    y: "load",
    series: "sensor",
    yDomain: [
      Math.floor(Math.min(...live.map((r) => r.load)) / 20) * 20,
      Math.ceil(Math.max(...live.map((r) => r.load)) / 20) * 20,
    ],
    data: live,
  };
  feedWindows = Array.from({ length: live.length / 3 - 39 }, (_, i) => ({
    ...feed,
    data: live.slice(3 * i, 3 * i + 120),
  }));
  tile("feed", feedWindows[0]!);
  // Constellation: 40 accounts placed by how alike their five measures are.
  tile("constellation", {
    type: "constellation",
    title: "Accounts that behave alike",
    titles: {
      revenue: "Revenue ($M)",
      growth: "Growth (%)",
      margin: "Margin (%)",
      tickets: "Tickets",
      nps: "NPS",
    },
    x: "account",
    y: ["revenue", "growth", "margin", "tickets", "nps"],
    size: "revenue",
    colorBy: "growth",
    select: true,
    data: makeAccounts(FACTS.reduce((a, f) => a + f.units, 0)) as Row[],
  });

  return out;
}

/** A seed derived from the dataset so a re-roll redraws the synthetic points too. */
const seedOf = (f: Dataset["FACTS"]) => Math.round(f.reduce((a, r) => a + r.sales, 0)) >>> 0;
const seed = () => (Math.random() * 2 ** 32) >>> 0;
for (const [id, spec] of Object.entries(specs(makeData(7)))) show(id, spec);

// The feed's Play button steps its windows; scrolling it away, or a re-roll, pauses it.
const feedChart = $<Chart>("feed");
const feedBtn = $("feed-play");
let i = 0;
let timer = 0;
const stop = () => {
  clearInterval(timer);
  timer = 0;
  feedBtn.textContent = "Play";
};
const tick = () => {
  feedChart.spec = feedWindows[i++]!;
  if (i === feedWindows.length) ((i = 0), stop());
};
feedBtn.onclick = () => {
  if (timer) return stop();
  feedBtn.textContent = "Pause";
  tick();
  timer = window.setInterval(tick, 600);
};
new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting || stop())).observe(feedChart);
$("feed-loop").textContent = feedLoop;

// Re-roll one tile, or every tile from the header button.
document.addEventListener("click", (e) => {
  const btn = (e.target as Element).closest<HTMLElement>("[data-reroll]");
  if (!btn) return;
  const all = specs(makeData(seed()));
  const id = btn.dataset.reroll;
  for (const [k, spec] of Object.entries(all)) if (!id || k === id) show(k, spec);
  stop();
});

theme();
