import "mayacharts/element";
import "mayacharts/units";
import "mayacharts/weave";
import "mayacharts/orbit";
import "mayacharts/constellation";
import { makeData } from "./data.ts";
import size from "./compare-size.json";
import { signature } from "./signature.ts";
import { theme } from "./theme.ts";
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
  const code = document.getElementById(`${id}-code`);
  if (code) code.textContent = shown;
}

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const revenue = [
  12000, 15500, 14200, 18900, 21000, 19800, 24500, 27300, 26100, 29800, 33200, 38500,
];
show("simple", {
  type: "bar",
  title: "Revenue more than tripled in 2025",
  x: "month",
  y: "revenue",
  labels: true,
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
  labels: true,
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
  labels: true,
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
  const spec: ChartSpec = { type: "bar", title: "Live data", x: "cat", y: "value", data: rows };
  if (twoSeries) spec.series = "series";
  return spec;
}
show("live", liveSpec());

$("update").addEventListener("click", () => {
  a = values();
  b = values();
  live.data = liveSpec().data as Row[];
});
$("toggle-series").addEventListener("click", () => {
  twoSeries = !twoSeries;
  show("live", liveSpec()); // the series field comes and goes with the second series
});

// Re-roll: scale each value of the first-drawn data by 0.4 to 1.6 so the change animates.
const base = new Map<string, ChartSpec>();
document.addEventListener("click", (e) => {
  const id = (e.target as Element).closest<HTMLElement>("[data-reroll]")?.dataset.reroll;
  if (!id) return;
  const el = $<Chart>(id);
  if (!base.has(id)) base.set(id, el.spec);
  const spec = base.get(id)!;
  const y = spec.y as string;
  show(id, {
    ...spec,
    data: spec.data.map((r) => ({ ...r, [y]: Math.round(Number(r[y]) * (0.4 + rand() * 1.2)) })),
  });
});

// Showcase: the hero shapeshifter draws now; the rest draw as they scroll into view, so their
// entrance plays where it is seen. The spec demos above stay eager (the e2e suite reads them).
const sig = signature(makeData(7));
const hero = $<Chart & { view: { form?: number } }>("units");
hero.spec = sig.units!;

// Cycle the hero's forms while it is on screen, until someone touches it. Off under reduced motion.
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
let seen = false;
let timer = 0;
const cycle = (): void => {
  clearInterval(timer);
  if (seen && !still)
    timer = window.setInterval(() => {
      hero.view = { ...hero.view, form: ((hero.view.form ?? 0) + 1) % 3 };
    }, 3200);
};
new IntersectionObserver(([e]) => {
  seen = !!e?.isIntersecting;
  cycle();
}).observe(hero);
hero.addEventListener("pointerdown", () => ((seen = false), cycle()), { once: true });

const later = new IntersectionObserver(
  (es) =>
    es.forEach((e) => {
      if (!e.isIntersecting) return;
      later.unobserve(e.target);
      (e.target as Chart).spec = lazy.get(e.target.id)!;
    }),
  { rootMargin: "0px 0px -15% 0px", threshold: 0.2 },
);
const lazy = new Map<string, ChartSpec>([
  ["weave", sig.weave!],
  ["orbit", sig.orbit!],
  ["constellation", sig.constellation!],
  ["memory", sig.memory!],
  [
    "weight",
    {
      type: "bar",
      horizontal: true,
      x: "library",
      y: "kb",
      labels: true,
      grid: false,
      xAxis: false,
      titles: { library: "Library", kb: "Bundle for the compare set, gzip" },
      format: { kb: { maximumFractionDigits: 0, suffix: " KB" } },
      title: "Gzip bundle for the same twelve charts, modules included",
      // The compare page's own measurement: every chart of the set in one bundle, gzip.
      data: Object.entries({
        maya: "mayaCharts",
        chartjs: "Chart.js",
        recharts: "Recharts",
        echarts: "ECharts",
        plotly: "Plotly",
      }).map(([k, library]) => ({
        library,
        kb: size.libs[k as keyof typeof size.libs].all.gzip / 1024,
      })),
    },
  ],
]);
for (const id of lazy.keys()) later.observe($(id));

$("install").addEventListener("click", () => {
  const done = (msg: string) => ($("install-status").textContent = msg);
  navigator.clipboard.writeText("npm i mayacharts").then(
    () => done("Copied npm i mayacharts"),
    () => done("Copy failed; select the text instead"),
  );
  // Swap the label in place: the span's min-width keeps the button from growing and wrapping.
  const btn = $("install");
  const label = btn.querySelector(".copy")!;
  btn.dataset.copied = "";
  label.textContent = "Copied";
  setTimeout(() => {
    delete btn.dataset.copied;
    label.textContent = "Copy";
  }, 1600);
});

theme();
