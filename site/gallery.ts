import "mayacharts/element";
import "mayacharts/hierarchy";
import "mayacharts/flow";
import "mayacharts/geo";
import "mayacharts/radial";
import type { ChartSpec, Row } from "../src/index.ts";
import {
  makeData,
  makeLive,
  makeMonths,
  makePoints,
  makeReadings,
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

/** Round up to the next whole step of the leading digit: 738K becomes 800K. */
const niceMax = (v: number) =>
  Math.ceil(v / 10 ** Math.floor(Math.log10(v))) * 10 ** Math.floor(Math.log10(v));
const R = (n: number, d = 0) => +n.toFixed(d);
const rows = (r: Record<string, unknown>[], f: (x: Record<string, any>) => Row): Row[] => r.map(f);
const mon = (ms: number) =>
  new Date(ms).toLocaleString("en-US", { month: "short", timeZone: "UTC" });

/** In-motion tiles: frames to step through, and the host loop printed beside the spec. */
const film = new Map<string, { frames: ChartSpec[]; ms: number; loop: string }>();
const reel = (id: string, ms: number, frames: ChartSpec[], step: string, setup = "") =>
  film.set(id, {
    frames,
    ms,
    loop: `const chart = document.querySelector("maya-chart");
const play = document.querySelector("#play");
// spec: the object above, rows: its data
${setup}let i = 0, timer;
play.onclick = () => {
  if (timer) {
    clearInterval(timer);
    timer = 0;
    play.textContent = "Play";
    return;
  }
  play.textContent = "Pause";
  timer = setInterval(() => {
${step}
  }, ${ms});
};`,
  });
/** Setup and step for a tile that cuts `rows` by month: op "<=" is a running total, "===" one month. */
const MONTHS = `const months = [...new Set(rows.map((r) => r.month))];
const mon = (m) =>
  new Date(m).toLocaleString("en", { month: "short", timeZone: "UTC" });
`;
const byMonth = (title: string, op: string) => `    const m = months[i++ % months.length];
    chart.spec = {
      ...spec,
      title: \`${title} \${mon(m)}\`,
      data: rows.filter((r) => r.month ${op} m),
    };`;

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

  // 32. Bar race: the running total by state, one frame per month.
  const months = [...new Set(FACTS.map((r) => r.month))];
  const topStates = new Set(
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
  const rows12 = FACTS.filter((r) => topStates.has(r.stateName));
  const race: ChartSpec = {
    type: "bar",
    title: "Sales by state",
    titles: { sales: "Sales ($)" },
    horizontal: true,
    x: "stateName",
    y: "sales",
    sort: "desc",
    labels: true,
    format: "compact",
    data: rows12,
  };
  const upTo = months.map((m) => ({
    ...race,
    title: `Sales to ${mon(Date.parse(m))}`,
    data: rows12.filter((r) => r.month <= m),
  }));
  reel(
    "race",
    900,
    upTo,
    byMonth("Sales to", "<="),
    "// rows: the 12 states with the highest year total\n" + MONTHS,
  );

  // 33. Moving bubbles: one per state and month, on fixed axes so only the bubbles move.
  const perMonth = rollup(FACTS, ["month", "stateName", "region"], {
    sales: sum("sales"),
    units: sum("units"),
    margin: mean("margin"),
  }) as { month: string; sales: number; margin: number }[];
  const span = (k: "sales" | "margin") => [
    Math.min(...perMonth.map((r) => r[k])),
    Math.max(...perMonth.map((r) => r[k])),
  ];
  const drift: ChartSpec = {
    type: "scatter",
    title: "Sales and margin by state",
    titles: { sales: "Sales ($)", margin: "Margin", units: "Units", stateName: "State" },
    x: "sales",
    y: "margin",
    size: "units",
    name: "stateName",
    series: "region",
    xDomain: [0, niceMax(span("sales")[1]!)],
    yDomain: [span("margin")[0]!, span("margin")[1]!],
    format: { sales: "compact", margin: "percent", units: "compact" },
    data: perMonth,
  };
  const each = months.map((m) => ({
    ...drift,
    title: `Sales and margin, ${mon(Date.parse(m))}`,
    data: perMonth.filter((r) => r.month === m),
  }));
  reel("drift", 900, each, byMonth("Sales and margin,", "==="), MONTHS);

  // 34. Live line: three sensors, a new reading every 600 ms, the last 40 kept.
  const live = makeLive(seedOf(FACTS));
  const feed: ChartSpec = {
    type: "line",
    title: "Sensor load, last 40 readings",
    titles: { load: "Load" },
    x: "time",
    y: "load",
    series: "sensor",
    legend: true,
    yDomain: [
      Math.floor(Math.min(...live.map((r) => r.load)) / 20) * 20,
      Math.ceil(Math.max(...live.map((r) => r.load)) / 20) * 20,
    ],
    data: live,
  };
  const windows = Array.from({ length: live.length / 3 - 39 }, (_, i) => ({
    ...feed,
    data: live.slice(3 * i, 3 * i + 120),
  }));
  reel(
    "feed",
    600,
    windows,
    "    const n = 3 * (i++ % (rows.length / 3 - 39));\n    chart.spec = { ...spec, data: rows.slice(n, n + 120) };",
  );
  for (const [id, { frames }] of film) out[id] = frames[id === "feed" ? 0 : frames.length - 1]!;
  return out;
}

/** A seed derived from the dataset so a re-roll redraws the synthetic points too. */
const seedOf = (f: Dataset["FACTS"]) => Math.round(f.reduce((a, r) => a + r.sales, 0)) >>> 0;
const seed = () => (Math.random() * 2 ** 32) >>> 0;
for (const [id, spec] of Object.entries(specs(makeData(7)))) show(id, spec);

// Play and Pause step a tile through its frames; scrolling a tile away pauses it.
const stops = new Map<Element, () => void>();
const away = new IntersectionObserver((es) =>
  es.forEach((e) => e.isIntersecting || stops.get(e.target)?.()),
);
for (const [id, { loop }] of film) {
  const chart = $<Chart>(id);
  const btn = $(`${id}-play`);
  let i = 0;
  let timer = 0;
  const stop = () => {
    clearInterval(timer);
    timer = 0;
    btn.textContent = "Play";
  };
  const tick = () => {
    const { frames } = film.get(id)!;
    chart.spec = frames[i++]!;
    if (i === frames.length) ((i = 0), stop());
  };
  btn.onclick = () => {
    if (timer) return stop();
    btn.textContent = "Pause";
    tick();
    timer = window.setInterval(tick, film.get(id)!.ms);
  };
  stops.set(chart, stop);
  away.observe(chart);
  $(`${id}-loop`).textContent = loop;
}

// Re-roll one tile, or every tile from the header button.
document.addEventListener("click", (e) => {
  const btn = (e.target as Element).closest<HTMLElement>("[data-reroll]");
  if (!btn) return;
  const all = specs(makeData(seed()));
  const id = btn.dataset.reroll;
  for (const [k, spec] of Object.entries(all)) if (!id || k === id) show(k, spec);
  for (const f of stops.values()) f();
});

theme();
