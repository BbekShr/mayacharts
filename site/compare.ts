/// <reference types="vite/client" />
import "mayacharts/element";
import "mayacharts/constellation";
import "mayacharts/units";
import "mayacharts/orbit";
import "mayacharts/weave";
import { makeData } from "./data.ts";
import { show } from "./show.ts";
import { signature } from "./signature.ts";
import { theme } from "./theme.ts";
import json from "./compare.json";
import type { ChartSpec } from "../src/index.ts";

// Everything shown here comes from compare.json, compare-size.json and compare-ease.json. No number
// or verdict is written in this file. The size and ease files come from other scripts and may be
// missing, so they are read through import.meta.glob, which yields nothing for an absent file.
interface Result {
  supported?: boolean;
  note?: string;
  renders?: boolean;
  firstViolation?: string;
  axeSeriousCritical?: number | null;
  keyboard?: { tabStops: number; arrowStates: number } | null;
  rtl?: { yAxisMovedRight: boolean } | null;
  ssr?: { svg: boolean; bytes: number; note?: string } | null;
  ssrNote?: string;
  ttfpMs?: number | null;
}
interface Cell {
  firstPaintMs?: number;
  loadPaintMs?: number;
  updateP50Ms?: number;
  updateP95Ms?: number;
  heapMB?: number;
  runs?: number;
  error?: string;
}
interface Data {
  generated: string;
  versions: Record<string, string | null>;
  browser: string;
  csp: string;
  arrowCap?: number;
  speedDefinition: string;
  notes: string[];
  libs: string[];
  charts: string[];
  titles: Record<string, string>;
  excluded: Record<string, string>;
  results: Record<string, Record<string, Result>>;
  speed: Record<string, Record<string, Record<string, Record<string, Cell>>>>;
  eval?: {
    model: string;
    date: string;
    n: number;
    libraries: Record<string, { validJsonPct: number; rendersPct: number; nonBlankPct: number }>;
  };
}
interface SizeLib {
  bar: { gzip: number };
  all: { gzip: number; charts: number };
}
interface Size {
  libs: Record<string, SizeLib>;
}
interface EaseCell {
  tokens: number;
  lines: number;
}
interface Ease {
  definition?: string;
  libs: Record<string, Record<string, (EaseCell & { charts?: number }) | null>>;
}
const data = json as unknown as Data;
const first = <T>(m: Record<string, unknown>): T | undefined =>
  (Object.values(m)[0] as { default: T } | undefined)?.default;
const size = first<Size>(import.meta.glob("./compare-size.json", { eager: true }));
const ease = first<Ease>(import.meta.glob("./compare-ease.json", { eager: true }));
interface Looks {
  judge: string;
  rubric: string;
  max: number;
  libs: Record<string, { mean: number; charts: Record<string, { total: number }> }>;
}
const looks = first<Looks>(import.meta.glob("./compare-looks.json", { eager: true }));

const WE = "maya";
const NAME: Record<string, string> = {
  maya: "mayaCharts",
  chartjs: "Chart.js",
  echarts: "ECharts",
  plot: "Observable Plot",
  vegalite: "Vega-Lite",
  recharts: "Recharts",
  nivo: "Nivo",
  plotly: "Plotly.js",
};
const name = (l: string) => NAME[l] ?? l;
const libs = [...data.libs].sort((a, b) => (a === WE ? -1 : b === WE ? 1 : 0));
const num = (n: number) => n.toLocaleString("en-US");
const kb = (b: number) => `${(b / 1024).toFixed(1)} KB`;
const yn = (b: boolean) => (b ? "yes" : "no");
const chartName = (c: string) => data.titles[c] ?? c;

interface Row {
  label: string;
  v: Record<string, number | null>;
  t: Record<string, string>;
  /** Lower is better. */
  low?: boolean;
  /** Left out of the win count (totals). */
  skip?: boolean;
  /** Timing noise: values within this fraction of the best share the win. */
  tie?: number;
}
interface Dim {
  id: string;
  title: string;
  def: string;
  tables: { caption?: string; rows: Row[] }[];
  extra?: HTMLElement;
  /** Drawn above the tables, from the same loaded values; the tables stay as the evidence. */
  charts?: Plot[];
}
interface Plot {
  spec: ChartSpec;
  /** One plain sentence: what the chart shows and in what unit. */
  note: string;
  cls?: string;
}

const MAYA = "mayaCharts";
const grey = "light-dark(#b4bbc4, #98a0ab)";
/** A horizontal bar per library, best first, ours in the accent and the rest grey. */
function bars(
  title: string,
  unit: string,
  suffix: string,
  entries: [string, number | null | undefined][],
  low: boolean,
  digits = 1,
): ChartSpec {
  const data = entries.flatMap(([l, v]) =>
    v == null ? [] : [{ lib: name(l), who: l === WE ? MAYA : "Others", value: v }],
  );
  return {
    type: "bar",
    horizontal: true,
    stack: true, // one row per library, so each bar is one series and fills its band
    x: "lib",
    y: "value",
    series: "who",
    sort: low ? "asc" : "desc",
    labels: true,
    legend: false,
    title,
    titles: { value: unit },
    format: { value: { maximumFractionDigits: digits, suffix } },
    colors: { [MAYA]: "var(--maya-accent)", Others: grey },
    data,
  };
}

/** A library by chart grid from a dimension's table rows. A library with no value is an empty cell. */
function heat(
  rows: Row[],
  unit: string,
  title: string,
  labels: boolean,
  map = (v: number) => v,
): ChartSpec {
  const cells = rows
    .filter((r) => !r.skip)
    .flatMap((r, i) =>
      libs.flatMap((l) =>
        r.v[l] == null ? [] : [{ lib: name(l), chart: data.charts[i] ?? r.label, v: map(r.v[l]) }],
      ),
    );
  return {
    type: "heatmap",
    x: "lib",
    y: "v",
    series: "chart",
    labels,
    title,
    titles: { v: unit },
    format: { v: { maximumFractionDigits: 0 } },
    data: cells,
  };
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = "",
  parent?: HTMLElement,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.textContent = text;
  parent?.append(e);
  return e;
}

/** Libraries sharing the best value in a row. At least two must have a value. */
function winners(r: Row): string[] {
  const have = libs.filter((l) => r.v[l] != null);
  if (have.length < 2) return [];
  const vals = have.map((l) => r.v[l] as number);
  const best = r.low ? Math.min(...vals) : Math.max(...vals);
  const near = (x: number) => Math.abs(x - best) <= Math.abs(best) * (r.tie ?? 0);
  return have.filter((l) => near(r.v[l] as number));
}

function wins(d: Dim): Record<string, number> {
  const w = Object.fromEntries(libs.map((l) => [l, 0])) as Record<string, number>;
  for (const t of d.tables)
    for (const r of t.rows) if (!r.skip) for (const l of winners(r)) w[l]!++;
  return w;
}

/** One row per chart; `f` maps a measured result to a value and its text. */
function perChart(f: (r: Result) => { v: number | null; t: string }, low = false): Row[] {
  return data.charts.map((c) => {
    const row: Row = { label: chartName(c), v: {}, t: {}, low };
    for (const l of libs) {
      const r = data.results[l]?.[c];
      const x = !r
        ? { v: null, t: "not measured" }
        : r.supported === false
          ? { v: null, t: "not supported" }
          : f(r);
      row.v[l] = x.v;
      row.t[l] = x.t;
    }
    return row;
  });
}
const notRendered = (r: Result) => r.renders === undefined || r.ttfpMs === null;
const supportedCount = (l: string) =>
  data.charts.filter((c) => data.results[l]?.[c]?.supported !== false).length;

const dims: Dim[] = [];

dims.push({
  id: "support",
  title: "Chart types supported",
  def: "Whether the library can draw the chart at all from its own documentation, with no add-on package.",
  tables: [
    {
      rows: [
        ...perChart(() => ({ v: 1, t: "yes" })),
        {
          label: "Charts supported",
          skip: true,
          v: Object.fromEntries(libs.map((l) => [l, supportedCount(l)])),
          t: Object.fromEntries(
            libs.map((l) => [l, `${supportedCount(l)} of ${data.charts.length}`]),
          ),
        },
      ],
    },
  ],
});

const kinds = [...new Set(libs.flatMap((l) => Object.keys(data.speed[l] ?? {})))];
const ns = [
  ...new Set(
    libs.flatMap((l) => Object.values(data.speed[l] ?? {}).flatMap((k) => Object.keys(k))),
  ),
].sort((a, b) => +a - +b);
const METRICS: [keyof Cell, string, string][] = [
  ["firstPaintMs", "first paint", "ms"],
  ["loadPaintMs", "load to paint", "ms"],
  ["updateP50Ms", "update p50", "ms"],
  ["updateP95Ms", "update p95", "ms"],
  ["heapMB", "JS heap", "MB"],
];
// Repeat runs of the same cell move by a few percent, so a timing within 5% of the best is a tie.
const TIE = 0.05;
const speedTable = (col: string, caption: string) => ({
  caption,
  rows: kinds.flatMap((k) =>
    ns.flatMap((n) =>
      METRICS.map(([key, label, unit]): Row => {
        const row: Row = {
          label: `${k[0]!.toUpperCase()}${k.slice(1)}, ${num(+n)} rows, ${label}`,
          v: {},
          t: {},
          low: true,
          tie: TIE,
        };
        for (const l of libs) {
          const c = data.speed[l]?.[k]?.[n]?.[col];
          const x = c?.[key];
          row.v[l] = typeof x === "number" ? x : null;
          row.t[l] =
            typeof x === "number"
              ? `${num(x)} ${unit}`
              : c
                ? `failed: ${c.error ?? "no data"}`
                : "not measured";
        }
        return row;
      }),
    ),
  ),
});
dims.push({
  id: "speed",
  title: "Speed and memory",
  def: data.speedDefinition,
  tables: [speedTable("normal", "Normal CPU"), speedTable("throttled", "CPU throttled")],
});

if (size) {
  const row = (label: string, f: (s: SizeLib) => number, t: (s: SizeLib) => string): Row => ({
    label,
    low: true,
    v: Object.fromEntries(libs.map((l) => [l, size.libs[l] ? f(size.libs[l]) : null])),
    t: Object.fromEntries(libs.map((l) => [l, size.libs[l] ? t(size.libs[l]) : "not measured"])),
  });
  dims.push({
    id: "size",
    title: "Bundle size",
    def: "Gzipped size of what a page ships to draw the chart, bundled and minified with the same settings for every library.",
    tables: [
      {
        rows: [
          row(
            "One bar chart, gzipped",
            (s) => s.bar.gzip,
            (s) => kb(s.bar.gzip),
          ),
          row(
            "Every chart it can draw, gzipped",
            (s) => s.all.gzip,
            (s) => `${kb(s.all.gzip)}, ${s.all.charts} charts`,
          ),
        ],
      },
    ],
  });
}

if (ease) {
  const rows: Row[] = data.charts.map((c) => {
    const r: Row = { label: chartName(c), low: true, v: {}, t: {} };
    for (const l of libs) {
      const e = ease.libs[l]?.[c];
      r.v[l] = e ? e.tokens : null;
      r.t[l] = e
        ? `${num(e.tokens)} tokens, ${e.lines} lines`
        : e === null
          ? "not supported"
          : "not measured";
    }
    return r;
  });
  const tot: Row = { label: "Total tokens", low: true, skip: true, v: {}, t: {} };
  for (const l of libs) {
    const t = ease.libs[l]?.["total"];
    tot.v[l] = t ? t.tokens : null;
    tot.t[l] = t ? `${num(t.tokens)} tokens, ${t.lines} lines, ${t.charts} charts` : "not measured";
  }
  dims.push({
    id: "ease",
    title: "Ease of writing",
    def:
      ease.definition ??
      "Tokens and lines in the reference module for each chart. Fewer is easier.",
    tables: [{ rows: [...rows, tot] }],
  });
}

const failures = el("div");
const fails = libs.flatMap((l) =>
  data.charts.flatMap((c) => {
    const r = data.results[l]?.[c];
    return r?.firstViolation ? [`${name(l)}, ${chartName(c)}: ${r.firstViolation}`] : [];
  }),
);
if (fails.length) {
  el("h3", "First violation or error, per failing chart", failures);
  const ul = el("ul", "", failures);
  for (const f of fails) el("li", f, ul);
}
dims.push({
  id: "csp",
  title: "Strict CSP with Trusted Types",
  def: `Yes when marks were painted with no CSP or Trusted Types violation and no script error. The policy is ${data.csp}`,
  tables: [{ rows: perChart((r) => ({ v: r.renders ? 1 : 0, t: yn(r.renders === true) })) }],
  extra: failures,
});

dims.push({
  id: "a11y",
  title: "Accessibility",
  def: "axe-core serious and critical violations, WCAG 2.2 AA rule set, scoped to the chart box. Fewer is better. A canvas exposes little to axe, so a low count there is not evidence of accessibility.",
  tables: [
    {
      rows: perChart(
        (r) =>
          notRendered(r) || r.axeSeriousCritical == null
            ? { v: null, t: "not measured" }
            : { v: r.axeSeriousCritical, t: String(r.axeSeriousCritical) },
        true,
      ),
    },
  ],
});

dims.push({
  id: "keyboard",
  title: "Keyboard",
  def: `Tab stops reached inside the chart, then the number of distinct states produced by pressing ArrowRight${data.arrowCap == null ? "" : ` (stops counting at ${data.arrowCap})`}. More states is better.`,
  tables: [
    {
      rows: perChart((r) =>
        notRendered(r) || !r.keyboard
          ? { v: null, t: "not rendered" }
          : {
              v: r.keyboard.arrowStates,
              t: `${r.keyboard.tabStops} ${r.keyboard.tabStops === 1 ? "stop" : "stops"}, ${r.keyboard.arrowStates} ${r.keyboard.arrowStates === 1 ? "state" : "states"}`,
            },
      ),
    },
  ],
});

dims.push({
  id: "rtl",
  title: "Right-to-left",
  def: "With dir=rtl on the page, whether ink moved from the left fifth of the chart to the right fifth, which is where a mirrored y axis would put it.",
  tables: [
    {
      rows: perChart((r) =>
        notRendered(r) || !r.rtl
          ? { v: null, t: "not rendered" }
          : { v: r.rtl.yAxisMovedRight ? 1 : 0, t: yn(r.rtl.yAxisMovedRight) },
      ),
    },
  ],
});

dims.push({
  id: "ssr",
  title: "Server-side render with no DOM",
  def: "Whether the library produced an SVG string in plain Node with no window or document. A library with no cheap documented path is listed as not measured and takes no part in the ranking.",
  tables: [
    {
      rows: perChart((r) =>
        r.ssr
          ? r.ssr.svg
            ? { v: 1, t: `yes, ${num(r.ssr.bytes)} characters` }
            : { v: 0, t: `no. ${r.ssr.note ?? ""}`.trim() }
          : { v: null, t: r.ssrNote ?? "not measured" },
      ),
    },
  ],
});

if (looks) {
  const row = (label: string, f: (l: string) => number | undefined, skip = false): Row => {
    const r: Row = { label, v: {}, t: {}, skip };
    for (const l of libs) {
      const x = looks.libs[l] ? f(l) : undefined;
      r.v[l] = x ?? null;
      r.t[l] =
        x == null ? (looks.libs[l] ? "not supported" : "not scored") : `${x} of ${looks.max}`;
    }
    return r;
  };
  dims.push({
    id: "looks",
    title: "Looks",
    def: `Judgment, not measurement. Each chart is scored 0 to 2 on seven criteria from the rubric in ${looks.rubric}, with library defaults, at 640 and 360 px and in dark mode. Judge: ${looks.judge}`,
    tables: [
      {
        rows: [
          ...data.charts.map((c) => row(chartName(c), (l) => looks.libs[l]!.charts[c]?.total)),
          row("Mean over supported charts", (l) => looks.libs[l]!.mean, true),
        ],
      },
    ],
  });
}

// Charts, built from the same rows and files as the tables below them.
const dim = (id: string) => dims.find((d) => d.id === id);
const give = (id: string, ...c: Plot[]) => {
  const d = dim(id);
  if (d) d.charts = c;
};
const tableRows = (id: string) => dim(id)?.tables[0]?.rows ?? [];
const gridNote = (what: string) =>
  `${what} Each square is one library on one chart. An empty square means the library has no value there, which includes charts it does not support, so empty is not the same as failed.`;

const speedCols = ["normal", "throttled"].filter((c) =>
  libs.some((l) =>
    Object.values(data.speed[l] ?? {}).some((k) => Object.values(k).some((n) => n[c])),
  ),
);
give(
  "speed",
  ...kinds.flatMap((k) =>
    speedCols.map((col): Plot => {
      const cpu = col === "normal" ? "normal CPU" : "CPU throttled";
      const rows = libs.flatMap((l) =>
        ns.flatMap((n) => {
          const ms = data.speed[l]?.[k]?.[n]?.[col]?.firstPaintMs;
          return typeof ms === "number" ? [{ rows: num(+n), lib: name(l), ms }] : [];
        }),
      );
      return {
        spec: {
          type: "line",
          x: "rows",
          xType: "category",
          y: "ms",
          series: "lib",
          endLabels: true,
          title: `${k[0]!.toUpperCase()}${k.slice(1)}, first paint, ${cpu}`,
          titles: { rows: "Rows", ms: "Milliseconds" },
          format: { ms: { maximumFractionDigits: 0 } },
          data: rows,
        },
        note: `Milliseconds until the first mark is painted for a ${k} chart, by number of rows, under ${cpu}. Lower is faster. A library that failed at a size has no point there.`,
      };
    }),
  ),
);
if (size)
  give("size", {
    spec: bars(
      "One bar chart, gzipped",
      "Kilobytes",
      " KB",
      libs.map((l) => [l, size.libs[l] && size.libs[l].bar.gzip / 1024]),
      true,
    ),
    note: "Kilobytes gzipped for a page that draws one bar chart, bundled and minified the same way for every library. Smaller is better.",
  });
if (ease) {
  const per = (l: string) => {
    const t = ease.libs[l]?.["total"];
    return t ? t.tokens / (t.charts ?? 1) : null;
  };
  give("ease", {
    spec: bars(
      "Tokens to write one chart",
      "Tokens",
      "",
      libs.map((l) => [l, per(l)]),
      true,
      0,
    ),
    note: "Mean tokens in the reference module per chart, over the charts each library can draw. Fewer tokens means less to write and to read.",
  });
}
if (looks)
  give("looks", {
    spec: bars(
      "Judged looks",
      `Score out of ${looks.max}`,
      "",
      libs.map((l) => [l, looks.libs[l]?.mean]),
      false,
      1,
    ),
    note: `Mean judged score out of ${looks.max} over the charts each library supports. This is judgment against a written rubric, not a measurement.`,
  });
const heats: [string, string, string][] = [
  ["support", "Supported", "Whether each library can draw each chart. Filled means yes."],
  [
    "csp",
    "Rendered",
    "Whether the chart painted under the strict CSP with Trusted Types. Dark means it did, pale means it did not.",
  ],
  [
    "a11y",
    "No serious violation",
    "Whether axe found no serious or critical violation. Dark means none, pale means at least one.",
  ],
  [
    "keyboard",
    "Keyboard states",
    "How many distinct states ArrowRight reached. A darker square is more.",
  ],
  [
    "rtl",
    "Mirrored",
    "Whether the y axis moved to the right under right-to-left. Dark means it did, pale means it did not.",
  ],
  [
    "ssr",
    "Rendered to SVG",
    "Whether the library produced an SVG string in plain Node. Dark means it did, pale means it did not.",
  ],
];
for (const [id, unit, note] of heats)
  give(id, {
    spec: heat(
      tableRows(id),
      unit,
      `${dim(id)?.title ?? id}, by library and chart`,
      id === "keyboard",
      id === "a11y" ? (v) => +(v === 0) : undefined,
    ),
    note: gridNote(note),
    cls: "cmp-tall",
  });

function box(parent: HTMLElement, label: string): HTMLTableElement {
  const wrap = el("div", "", parent);
  wrap.className = "scroll";
  wrap.tabIndex = 0;
  wrap.setAttribute("role", "region");
  wrap.setAttribute("aria-label", label);
  return el("table", "", wrap);
}

/** Each plot is a `<maya-chart>` with a sentence under it saying what it shows. */
function plots(parent: HTMLElement, list: Plot[]): void {
  const g = el("div", "", parent);
  g.className = "cmp-grid";
  for (const p of list) {
    const f = el("figure", "", g);
    const c = el("maya-chart", "", f);
    c.className = `cmp ${p.cls ?? ""}`;
    c.spec = p.spec;
    el("figcaption", p.note, f);
  }
}

function tag(c: HTMLElement, text: string): void {
  c.append(" ");
  el("span", text, c).className = "tag";
}

function render(d: Dim): HTMLElement {
  const s = el("section");
  s.id = d.id;
  el("h2", d.title, s);
  el("p", d.def, s);
  if (d.charts) plots(s, d.charts);
  const into = d.charts ? el("details", "", s) : s;
  if (d.charts) el("summary", `Table behind the chart${d.charts.length > 1 ? "s" : ""}`, into);
  for (const t of d.tables) {
    if (t.caption) el("h3", t.caption, into);
    const table = box(into, `${d.title}${t.caption ? `, ${t.caption}` : ""}`);
    const head = el("tr", "", el("thead", "", table));
    el("th", "Row", head).scope = "col";
    for (const l of libs) el("th", name(l), head).scope = "col";
    const body = el("tbody", "", table);
    for (const r of t.rows) {
      const tr = el("tr", "", body);
      el("th", r.label, tr).scope = "row";
      const win = winners(r);
      for (const l of libs) {
        const c = el("td", r.t[l] ?? "not measured", tr);
        if (win.includes(l)) {
          c.className = "win";
          tag(c, "best");
        } else if (l === WE && r.v[l] != null && win.length) {
          c.className = "loss";
          tag(c, "behind");
        }
      }
    }
  }
  if (d.extra) s.append(d.extra);
  return s;
}

/** Our rank per dimension, from rows won. */
function summary(): HTMLElement {
  const s = el("section");
  s.id = "summary";
  el("h2", "Summary", s);
  el(
    "p",
    `Rank by rows won. A row is won by the library with the best value, and ties share the win. ${name(WE)} is ranked among the libraries that have a value in that dimension.`,
    s,
  );
  const own = dims.flatMap((d) => {
    const rows = d.tables.flatMap((t) => t.rows).filter((r) => !r.skip);
    const w = wins(d);
    const rivals = libs.filter((l) => l !== WE && rows.some((r) => r.v[l] != null));
    return rows.some((r) => r.v[WE] != null) && rivals.length
      ? [
          { dim: d.title, who: MAYA, share: w[WE]! / rows.length },
          {
            dim: d.title,
            who: "Best rival",
            share: Math.max(...rivals.map((l) => w[l]!)) / rows.length,
          },
        ]
      : [];
  });
  plots(s, [
    {
      spec: {
        type: "bar",
        horizontal: true,
        x: "dim",
        y: "share",
        series: "who",
        labels: true,
        title: "Share of rows won, per dimension",
        titles: { share: "Rows won" },
        format: { share: { style: "percent", maximumFractionDigits: 0 } },
        yDomain: [0, 1],
        colors: { [MAYA]: "var(--maya-accent)", "Best rival": grey },
        data: own,
      },
      note: `Share of the rows in each dimension won by ${MAYA} and by the single best other library, where ties share the win. A shorter accent bar than the grey one is a loss.`,
      cls: "cmp-tall",
    },
  ]);
  const table = box(s, "Summary");
  const head = el("tr", "", el("thead", "", table));
  for (const h of ["Dimension", `${name(WE)} rank`, "Rows won by us", "Leader"])
    el("th", h, head).scope = "col";
  const body = el("tbody", "", table);
  for (const d of dims) {
    const w = wins(d);
    const rows = d.tables.flatMap((t) => t.rows).filter((r) => !r.skip);
    const present = libs.filter((l) => rows.some((r) => r.v[l] != null));
    const tr = el("tr", "", body);
    const th = el("th", "", tr);
    th.scope = "row";
    el("a", d.title, th).href = `#${d.id}`;
    if (!present.includes(WE)) {
      el("td", "not measured", tr).colSpan = 3;
      continue;
    }
    const rank = 1 + present.filter((l) => w[l]! > w[WE]!).length;
    const top = Math.max(...present.map((l) => w[l]!));
    const c = el("td", `${rank} of ${present.length}`, tr);
    c.className = rank === 1 ? "win" : "loss";
    el("td", `${w[WE]} of ${rows.length}`, tr);
    el(
      "td",
      top
        ? present
            .filter((l) => w[l] === top)
            .map(name)
            .join(", ")
        : "no row has a winner",
      tr,
    );
  }
  return s;
}

/** The same chart from every library, as screenshots written by scripts/compare-shots.mjs. */
function sideBySide(): HTMLElement {
  const s = el("section");
  s.id = "side";
  el("h2", "Side by side", s);
  el(
    "p",
    "Each library's reference chart for the same data, with its defaults, at 640 by 360 pixels in the light theme. These are pictures of the charts, so hover and keyboard do not work here.",
    s,
  );
  const label = el("label", "Chart ", s);
  const pick = el("select", "", label);
  for (const c of data.charts) el("option", chartName(c), pick).value = c;
  const grid = el("div", "", s);
  grid.className = "side";
  const show = () => {
    const c = pick.value;
    grid.replaceChildren();
    for (const l of libs) {
      const f = el("figure", "", grid);
      const r = data.results[l]?.[c];
      if (r?.supported === false) {
        el("div", r.note ?? "Not supported.", f).className = "none";
      } else {
        const img = el("img", "", f);
        img.src = `${import.meta.env.BASE_URL}compare/${l}-${c}.png`;
        img.alt = `${name(l)}: ${chartName(c)}`;
        img.width = 640;
        img.height = 360;
        img.loading = "lazy";
      }
      el("figcaption", name(l), f);
    }
  };
  pick.addEventListener("change", show);
  show();
  return s;
}

const host = document.getElementById("tables")!;
const sum = summary();
host.append(sum, sideBySide(), document.getElementById("signature")!, ...dims.map(render));
for (const [id, spec] of Object.entries(signature(makeData(7)))) show(id, spec);
const absent = [!size && "bundle size", !ease && "ease of writing", !looks && "looks"]
  .filter(Boolean)
  .join(" and ");
if (absent) el("p", `Not shown yet, because its script has not written its file: ${absent}.`, sum);

document.getElementById("method")!.textContent = data.notes.join(" ");
const ex = document.getElementById("excluded")!;
for (const [k, why] of Object.entries(data.excluded))
  el("li", `${name(k[0]!.toUpperCase() + k.slice(1))}: ${why}`, ex);

if (data.eval) {
  const e = data.eval;
  document.getElementById("llm")!.hidden = false;
  document.getElementById("llm-note")!.textContent =
    `${e.n} prompts sent to ${e.model} on ${e.date}. Valid JSON, renders without throwing, and non-blank output (at least one path or rect in the plot beyond the axes).`;
  const t = box(document.getElementById("llm-table")!, "LLM-written specs");
  const head = el("tr", "", el("thead", "", t));
  for (const h of ["Library", "Valid JSON", "Renders", "Non-blank"])
    el("th", h, head).scope = "col";
  const body = el("tbody", "", t);
  for (const [lib, v] of Object.entries(e.libraries)) {
    const tr = el("tr", "", body);
    el("th", name(lib), tr).scope = "row";
    for (const p of [v.validJsonPct, v.rendersPct, v.nonBlankPct]) el("td", `${p}%`, tr);
  }
}

const vs = data.versions;
document.getElementById("foot")!.textContent =
  `Generated ${data.generated}, commit ${vs["commit"] ?? "unknown"}. ${libs.map((l) => `${name(l)} ${vs[l] ?? "unknown"}`).join(", ")}. ${data.browser}.`;

theme();
