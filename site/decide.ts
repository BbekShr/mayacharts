import type { ChartSpec, Row } from "../src/index.ts";
import { mean, rollup, sum, type Dataset } from "./data.ts";

const R = (n: number, d = 0) => +n.toFixed(d);
const mon = (ms: number) =>
  new Date(ms).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
const top = (rows: Row[], k: string, n: number) =>
  [...rows].sort((a, b) => Number(b[k]) - Number(a[k])).slice(0, n);

/** The 0.17 tiles: decisions, what-ifs, small multiples and playback. */
export function decide({ FACTS }: Pick<Dataset, "FACTS">): Record<string, ChartSpec> {
  const out: Record<string, ChartSpec> = {};
  const tile = (id: string, spec: ChartSpec) => (out[id] = spec);
  const months = rollup(FACTS, ["monthMs"], { sales: sum("sales"), units: sum("units") }) as {
    monthMs: number;
    sales: number;
    units: number;
  }[];
  const states = top(
    rollup(FACTS, ["stateName", "region"], {
      sales: sum("sales"),
      margin: mean("margin"),
    }) as Row[],
    "sales",
    12,
  );
  const name = new Set(states.map((s) => s.stateName));
  const six = new Set(states.slice(0, 6).map((s) => s.stateName));

  // Insight list: three moves, each with the rows that prove it, bars local to the move.
  const fam = top(
    (rollup(FACTS, ["family"], { sales: sum("sales"), units: sum("units") }) as Row[]).map((r) => ({
      ...r,
      price: Number(r.sales) / Number(r.units),
    })),
    "price",
    1,
  )[0]!;
  const items = top(
    (
      rollup(
        FACTS.filter((r) => r.family === fam.family),
        ["item"],
        { sales: sum("sales"), units: sum("units") },
      ) as Row[]
    ).map((r) => ({ ...r, price: Number(r.sales) / Number(r.units) })),
    "price",
    3,
  );
  const qs = rollup(
    FACTS.map((r) => ({ ...r, q: `Q${Math.floor((new Date(r.monthMs).getUTCMonth() + 3) / 3)}` })),
    ["q"],
    { sales: sum("sales") },
  ) as { q: string; sales: number }[];
  const year = qs.reduce((a, r) => a + r.sales, 0);
  const peak = top(qs, "sales", 1)[0] as { q: string; sales: number };
  const thin = [...states].sort((a, b) => Number(a.margin) - Number(b.margin)).slice(0, 3);
  tile("list", {
    type: "list",
    title: "Three moves for next quarter",
    path: ["move", "evidence"],
    y: "value",
    body: "text",
    rowFormat: "format",
    bars: true,
    data: [
      {
        move: `Lead with ${fam.family}`,
        text: `Earns the most per unit, $${R(Number(fam.price), 2)} on average`,
        value: R(Number(fam.price), 2),
        format: "currency",
      },
      ...items.map((r) => ({
        move: `Lead with ${fam.family}`,
        evidence: String(r.item),
        value: R(Number(r.price), 2),
        format: "currency",
      })),
      {
        move: `Stock for ${peak.q}`,
        text: "The peak quarter of the year",
        value: R(peak.sales / year, 3),
        format: "percent",
      },
      ...qs.map((r) => ({
        move: `Stock for ${peak.q}`,
        evidence: r.q,
        value: R(r.sales / year, 3),
        format: "percent",
      })),
      {
        move: "Check the lowest margins",
        text: `${thin[0]!.stateName} keeps the least of each sale`,
        value: R(Number(thin[0]!.margin), 3),
        format: "percent",
      },
      ...thin.map((r) => ({
        move: "Check the lowest margins",
        evidence: String(r.stateName),
        value: R(Number(r.margin), 3),
        format: "percent",
      })),
    ],
  });

  // Small multiples: one panel per state, the biggest first, on one scale or each its own.
  tile("facet", {
    type: "area",
    title: "Monthly sales in the six biggest states",
    titles: { sales: "Sales ($)" },
    x: "monthMs",
    y: "sales",
    facet: "stateName",
    facetScale: ["shared", "own"],
    sort: "desc",
    limit: 6,
    format: { monthMs: "month", sales: "compact" },
    data: rollup(FACTS, ["monthMs", "stateName"], { sales: sum("sales") }) as Row[],
  });

  // What-if: a price lever on the projected half and a goal line, both set by the viewer.
  const mid = Math.round(months.reduce((a, m) => a + m.sales, 0) / months.length / 1e5) * 1e5;
  tile("what-if", {
    type: "bar",
    title: "Year-end {total}, {total.base} before the change",
    titles: { sales: "Sales ($)" },
    x: "month",
    y: "sales",
    series: "kind",
    stack: true,
    format: { sales: { style: "currency", currency: "USD", notation: "compact" } },
    params: [
      { id: "price", label: "Price change", min: -20, max: 20, step: 1, value: 0, suffix: "%" },
      {
        id: "goal",
        label: "Monthly goal",
        min: mid / 2,
        max: mid * 2,
        step: 1e5,
        value: mid,
        format: { style: "currency", currency: "USD", notation: "compact" },
      },
    ],
    scale: { where: { kind: "Projected" }, by: ["price"] },
    rules: [{ y: { param: "goal" }, label: "Goal" }],
    data: months.map((m, i) => ({
      month: mon(m.monthMs),
      kind: i < 6 ? "Actual" : "Projected",
      sales: m.sales,
    })),
  });

  // Bubble race with a scrubber and trails: each state leaves a path over the months.
  tile("trail", {
    type: "scatter",
    title: "Sales and margin, month by month",
    titles: { sales: "Sales ($)", margin: "Margin", stateName: "State" },
    x: "sales",
    y: "margin",
    name: "stateName",
    series: "region",
    frame: "month",
    frameControl: "both",
    frameSpeed: 700,
    trail: 3,
    format: { month: { month: "short" }, sales: "compact", margin: "percent" },
    data: rollup(
      FACTS.filter((r) => six.has(r.stateName)),
      ["month", "stateName", "region"],
      { sales: sum("sales"), margin: mean("margin") },
    ) as Row[],
  });

  // KPI scopes as tabs, a measure toggle, and a back face with the detail.
  const scope = (label: string, n: number) =>
    months.slice(-n).map((m) => ({
      scope: label,
      month: mon(m.monthMs),
      sales: m.sales,
      units: m.units,
    }));
  tile("kpi-flip", {
    type: "kpi",
    title: "Sales and units",
    x: "month",
    y: ["sales", "units"],
    toggle: true,
    frame: "scope",
    frameControl: "tabs",
    format: "compact",
    titles: { sales: "Sales ($)", units: "Units" },
    back: { type: "bar", x: "month", y: "sales", horizontal: true, sort: "desc", limit: 3 },
    data: [...scope("Q4", 3), ...scope("H2", 6), ...scope("Year", 12)],
  });

  // Radar: the shape of the year, one closed line per region.
  tile("radar", {
    type: "radial",
    form: "line",
    title: "Seasonality by region",
    titles: { sales: "Sales ($)" },
    x: "month",
    y: "sales",
    series: "region",
    format: "compact",
    data: (rollup(FACTS, ["monthMs", "region"], { sales: sum("sales") }) as Row[]).map((r) => ({
      ...r,
      month: mon(Number(r.monthMs)),
    })),
  });

  // Closed ring gauge with last month's marker.
  tile("gauge-ring", {
    type: "gauge",
    title: "Orders shipped on time",
    y: "onTime",
    aggregate: "mean",
    arc: 360,
    yDomain: [0, 100],
    colorBy: { target: 95, warn: 90 },
    was: "lastMonth",
    format: { onTime: { maximumFractionDigits: 1, suffix: "%" }, lastMonth: { suffix: "%" } },
    titles: { onTime: "On time", lastMonth: "last month" },
    data: [{ onTime: 93.4, lastMonth: 91.2 }],
  });

  // Table: page, search, a diverging change column and a monthly chart under each state.
  const half = new Map<string, number[]>();
  for (const r of FACTS)
    if (name.has(r.stateName)) {
      const h = half.get(r.stateName) ?? [0, 0];
      h[r.monthMs < Date.UTC(2025, 6, 1) ? 0 : 1]! += r.sales;
      half.set(r.stateName, h);
    }
  const nation =
    [...half.values()].reduce((a, h) => a + h[1]!, 0) /
    [...half.values()].reduce((a, h) => a + h[0]!, 0);
  tile("table-rich", {
    type: "table",
    title: "State growth against the nation",
    x: "stateName",
    y: ["sales", "change"],
    columns: ["region"],
    page: 5,
    filter: true,
    bars: { sales: "bar", change: "diverging" },
    aggregate: "mean",
    expand: { type: "bar", x: "month", y: "sales" },
    format: { sales: "compact", change: "percent" },
    titles: {
      stateName: "State",
      region: "Region",
      sales: "Average month",
      change: "Against the nation",
    },
    data: (
      rollup(
        FACTS.filter((r) => name.has(r.stateName)),
        ["stateName", "region", "monthMs"],
        { sales: sum("sales") },
      ) as { stateName: string; region: string; monthMs: number; sales: number }[]
    ).map((r) => ({
      ...r,
      month: mon(r.monthMs),
      change: R(half.get(r.stateName)![1]! / half.get(r.stateName)![0]! - nation, 3),
    })),
  });

  // Streamgraph: the mix drifts around a centred baseline.
  tile("stream", {
    type: "area",
    title: "Sales by family, centred",
    titles: { sales: "Sales ($)" },
    x: "monthMs",
    y: "sales",
    series: "family",
    stack: "stream",
    format: { monthMs: "month", sales: "compact" },
    data: rollup(FACTS, ["monthMs", "family"], { sales: sum("sales") }) as Row[],
  });

  return out;
}
