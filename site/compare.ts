import "mayacharts/element";
import type { ChartSpec } from "../src/index.ts";
import json from "./compare.json";

// Everything shown here comes from compare.json. No number or verdict is written in this file.
interface Row {
  library: string;
  chart: string;
  supported?: boolean;
  renders?: boolean;
  firstViolation?: string;
  axeSeriousCritical?: number | null;
  gzipBytes: number;
  ssr: { svg: boolean; bytes: number; note?: string };
  keyboard?: { tabStops: number; arrowStates: number } | null;
  rtl?: { yAxisMovedRight: boolean } | null;
  ttfpMs?: number | null;
  note?: string;
}
interface EvalLib {
  validJsonPct: number;
  rendersPct: number;
  nonBlankPct: number;
}
interface Eval {
  model: string;
  date: string;
  n: number;
  libraries: Record<string, EvalLib>;
}
const data = json as unknown as {
  generated: string;
  versions: Record<string, string>;
  browser: string;
  csp: string;
  notes: string[];
  results: Row[];
  eval?: Eval;
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const LIBS = ["mayacharts", "chartjs", "echarts"];
const NAME: Record<string, string> = {
  mayacharts: "mayaCharts",
  chartjs: "Chart.js",
  echarts: "ECharts",
};
const CHARTS = ["bar", "line", "scatter", "heatmap"];
const CHART_NAME: Record<string, string> = {
  bar: "Grouped bar",
  line: "Multi-line, monthly",
  scatter: "Scatter, 50 000 points",
  heatmap: "Heatmap, 24 x 7",
};
const get = (lib: string, chart: string) =>
  data.results.find((r) => r.library === lib && r.chart === chart);

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

/** A table: one row per chart, one column per library. `cell` returns the text for a result. */
function table(
  caption: string,
  def: string,
  cell: (r: Row) => string,
  charts = CHARTS,
): HTMLElement {
  const s = el("section");
  el("h2", caption, s);
  el("p", def, s);
  const t = el("table", "", s);
  const head = el("tr", "", el("thead", "", t));
  el("th", "Chart", head).scope = "col";
  for (const l of LIBS) el("th", NAME[l] ?? l, head).scope = "col";
  const body = el("tbody", "", t);
  for (const c of charts) {
    const tr = el("tr", "", body);
    el("th", CHART_NAME[c] ?? c, tr).scope = "row";
    for (const l of LIBS) {
      const r = get(l, c);
      el("td", !r ? "not measured" : r.supported === false ? "not supported" : cell(r), tr);
    }
  }
  return s;
}

const yn = (b: boolean) => (b ? "yes" : "no");
const tables = $("tables");
const notRendered = (r: Row) => r.renders === false && r.ttfpMs == null;

tables.append(
  table(
    "Renders under the CSP",
    "Yes when marks were painted with no CSP or Trusted Types violation and no script error.",
    (r) => yn(r.renders === true),
  ),
);
// First violation text, for every row that has one.
const failures = data.results.filter((r) => r.firstViolation);
if (failures.length) {
  const s = el("section");
  el("h2", "First violation or error, per failing chart", s);
  const ul = el("ul", "", s);
  for (const r of failures)
    el(
      "li",
      `${NAME[r.library] ?? r.library}, ${CHART_NAME[r.chart] ?? r.chart}: ${r.firstViolation}`,
      ul,
    );
  tables.append(s);
}
tables.append(
  table(
    "axe-core serious and critical violations",
    "WCAG 2.2 AA rule set, scoped to the chart box. Not measured when the chart did not render. A canvas exposes little to axe, so a low count there is not evidence of accessibility.",
    (r) => (notRendered(r) ? "not rendered" : String(r.axeSeriousCritical ?? "not measured")),
  ),
  table(
    "Server-side render with no DOM",
    "Whether the library produced an SVG string in plain Node with no window or document, and the string length.",
    (r) =>
      r.ssr.svg
        ? `yes, ${r.ssr.bytes.toLocaleString("en-US")} characters`
        : `no. ${r.ssr.note ?? ""}`.trim(),
  ),
  table(
    "Keyboard",
    "Tab stops reached inside the chart, then the number of distinct states produced by pressing ArrowRight (stops counting at 40).",
    (r) =>
      notRendered(r) || !r.keyboard
        ? "not rendered"
        : `${r.keyboard.tabStops} tab stops, ${r.keyboard.arrowStates} arrow states`,
  ),
  table(
    "Right-to-left",
    "With dir=rtl on the page, whether ink moved from the left fifth of the chart to the right fifth, which is where a mirrored y axis would put it.",
    (r) => (notRendered(r) || !r.rtl ? "not rendered" : yn(r.rtl.yAxisMovedRight)),
  ),
  table(
    "Time to first paint",
    "Milliseconds from just before the render call to the next animation frame. Median of fresh page loads.",
    (r) => (r.ttfpMs == null ? "not rendered" : `${r.ttfpMs} ms`),
  ),
  table(
    "JavaScript downloaded, gzipped, per page",
    "Sum of the library scripts the page loaded. Each library loads one file, not tree-shaken.",
    (r) => `${r.gzipBytes.toLocaleString("en-US")} bytes`,
    ["bar"],
  ),
);

// One bar per library, from the same JSON.
const bytes = LIBS.flatMap((l) => {
  const r = get(l, "bar");
  return r ? [{ library: NAME[l] ?? l, bytes: r.gzipBytes }] : [];
});
const spec: ChartSpec = {
  type: "bar",
  title: "Gzipped script bytes loaded by each library",
  x: "library",
  y: "bytes",
  horizontal: true,
  labels: true,
  format: { bytes: "integer" },
  titles: { bytes: "Gzipped bytes", library: "Library" },
  data: bytes,
};
($("bytes") as HTMLElement & { spec: ChartSpec }).spec = spec;

$("method").textContent = data.notes.join(" ");
$("csp").textContent = data.csp;

if (data.eval) {
  const e = data.eval;
  $("llm").hidden = false;
  $("llm-note").textContent =
    `${e.n} prompts sent to ${e.model} on ${e.date}. Valid JSON, renders without throwing, and non-blank output (at least one path or rect in the plot beyond the axes).`;
  const t = el("table", "", $("llm-table"));
  const head = el("tr", "", el("thead", "", t));
  for (const h of ["Library", "Valid JSON", "Renders", "Non-blank"])
    el("th", h, head).scope = "col";
  const body = el("tbody", "", t);
  for (const [lib, v] of Object.entries(e.libraries)) {
    const tr = el("tr", "", body);
    el("th", NAME[lib] ?? lib, tr).scope = "row";
    for (const p of [v.validJsonPct, v.rendersPct, v.nonBlankPct]) el("td", `${p}%`, tr);
  }
}

const v = data.versions;
$("foot").textContent =
  `Generated ${data.generated}. mayaCharts ${v["mayacharts"]}, Chart.js ${v["chartjs"]}, ECharts ${v["echarts"]}. ${data.browser}.`;

// Theme toggle: auto -> light -> dark.
const modes = ["auto", "light", "dark"] as const;
const scheme = { auto: "light dark", light: "light", dark: "dark" } as const;
let mode = 0;
$("theme").addEventListener("click", () => {
  mode = (mode + 1) % modes.length;
  const m = modes[mode] ?? "auto";
  document.documentElement.style.colorScheme = scheme[m];
  $("theme").textContent = `Theme: ${m}`;
});
