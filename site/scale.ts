import "mayacharts/element";
import "mayacharts/hierarchy";
import "mayacharts/flow";
import "mayacharts/stats";
import type { ChartSpec } from "../src/index.ts";
import { mulberry32 } from "./data.ts";
import { theme } from "./theme.ts";

// One table of synthetic order lines, built in this tab from a fixed seed (the first N rows are
// the same whatever N is). Every chart reads that one array; it is dropped when the count changes.
type Order = {
  t: number;
  s: string;
  v: number;
  o: number;
  p: number;
  a: string;
  b: string;
  c: string;
  i: number;
};

const CH = ["Web", "App", "Store", "Phone", "Trade", "Market", "Partner", "Kiosk"];
const REG = ["Northeast", "Midwest", "South", "West", "Canada", "Overseas"];
const FAM = ["Outerwear", "Tops", "Bottoms", "Accessories", "Footwear", "Home"];
const SKU = Array.from({ length: 432 }, (_, n) => `SKU ${1000 + n * 7}`);
const BASE = [180, 45, 60, 35, 95, 70]; // typical unit price by family
const T0 = Date.UTC(2025, 0, 1);

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const nf = new Intl.NumberFormat("en-US");
const frame = () => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r)));
const tick = () => new Promise<void>((r) => setTimeout(r));
const heap = () => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;

/** Chunked, so the tab keeps painting and answering input while a million rows are built. */
async function make(n: number, live: () => boolean, progress: (done: number) => void) {
  const rnd = mulberry32(7);
  const out: Order[] = new Array(n);
  for (let i = 0; i < n;) {
    for (const end = Math.min(n, i + 50000); i < end; i++) {
      const k = i >> 3;
      const c = i & 7;
      const leaf = Math.floor(rnd() ** 1.6 * 432);
      const b = Math.floor(leaf / 12) % 6;
      const p = Math.round(BASE[b]! * (0.5 + rnd() * rnd() * 2.2) * 100) / 100;
      const wave = 1 + 0.25 * Math.sin(k / 240 + c) + 0.1 * Math.sin(k / 9000);
      const o = Math.round(p * (1 + Math.floor(rnd() ** 2 * 5)) * (0.9 + rnd() * 0.2) * 100) / 100;
      out[i] = {
        t: T0 + k * 6e4,
        s: CH[c]!,
        v: Math.round(BASE[c % 6]! * (0.6 + c / 8) * wave * (0.85 + rnd() * 0.3) * 100) / 100,
        o,
        p,
        a: REG[Math.floor(leaf / 72)]!,
        b: FAM[b]!,
        c: SKU[leaf]!,
        i,
      };
    }
    progress(i);
    await tick();
    if (!live()) break;
  }
  return out;
}

const titles = {
  v: "Revenue ($)",
  o: "Order value ($)",
  p: "Unit price ($)",
  t: "Time",
  s: "Channel",
  i: "Order",
  c: "SKU",
  b: "Family",
};
const money = { v: "compact", o: "compact", p: "compact" } as const;

type Tile = { id: string; title: string; note: string; spec: Omit<ChartSpec, "data">; h?: number };
const TILES: Tile[] = [
  {
    id: "line-1",
    title: "Revenue over time",
    note: "One line: revenue per minute, eight channels summed. A time axis keeps about one point per 2 px, so the drawing does not grow with the rows. Drag to zoom.",
    spec: { type: "line", x: "t", xType: "time", y: "v", zoom: true, titles, format: money },
  },
  {
    id: "line-8",
    title: "Eight channels",
    note: "The same rows split by channel. Each series is thinned on its own and the legend toggles it.",
    spec: {
      type: "line",
      x: "t",
      xType: "time",
      y: "v",
      series: "s",
      zoom: true,
      legend: true,
      titles,
      format: money,
    },
  },
  {
    id: "area",
    title: "Channels stacked",
    note: "The eight channels as stacked areas over the same time axis.",
    spec: {
      type: "area",
      x: "t",
      xType: "time",
      y: "v",
      series: "s",
      stack: true,
      titles,
      format: money,
    },
  },
  {
    id: "kpi",
    title: "Latest revenue",
    note: "A headline number and a sparkline thinned to what fits, computed from every row.",
    spec: { type: "kpi", x: "t", y: "v", titles, format: { ...money, t: "datetime" } },
  },
  {
    id: "scatter",
    title: "Unit price against order value",
    note: "Past 10,000 points the scatter becomes density cells. The bands are orders of one to five units.",
    spec: { type: "scatter", x: "p", y: "o", zoom: true, legend: true, titles, format: money },
  },
  {
    id: "beeswarm",
    title: "Unit price by family",
    note: "A beeswarm draws a dot per row until 10,000, then a violin of cells per family, taller where more rows fall.",
    spec: { type: "beeswarm", x: "b", y: "p", titles, format: money },
  },
  {
    id: "boxplot",
    title: "Revenue by channel",
    note: "Quartiles and whiskers computed from every row of each channel. A box shows its outliers when there are any.",
    spec: { type: "boxplot", x: "s", y: "v", titles, format: money },
  },
  {
    id: "bar-top",
    title: "Top 15 SKUs by revenue",
    note: "Rows are summed per SKU, 432 of them. The limit keeps the top fifteen and folds the rest into Other.",
    spec: {
      type: "bar",
      x: "c",
      y: "v",
      sort: "desc",
      limit: 15,
      horizontal: true,
      titles,
      format: money,
    },
  },
  {
    id: "bar-ids",
    title: "Largest orders",
    note: "One distinct category per row, no limit set. The biggest are kept and the rest become one Other bar.",
    spec: { type: "bar", x: "i", y: "o", sort: "desc", titles, format: money },
  },
  {
    id: "sunburst",
    title: "Region, family and SKU",
    note: "A million rows folded into a three level tree. Click a slice to drill in.",
    spec: { type: "sunburst", path: ["a", "b", "c"], y: "v", drill: true, titles, format: money },
  },
  {
    id: "sankey",
    title: "Region to family to channel",
    note: "Revenue flowing through three levels, summed from every row.",
    spec: { type: "sankey", path: ["a", "b", "s"], y: "v", titles, format: money },
    h: 380,
  },
];

type Chart = HTMLElement & { spec: ChartSpec };
type State = { tile: Tile; box: HTMLElement; done: boolean; queued: boolean; seen: boolean };
const states = new Map<string, State>();

for (const tile of TILES) {
  const box = document.createElement("section");
  box.id = tile.id;
  box.innerHTML = `<div class="tile-head"><h2></h2></div><p></p><maya-chart></maya-chart>
    <dl class="stats">${["rows", "marks", "draw", "resize"]
      .map(
        (k) =>
          `<div><dt>${{ rows: "Rows in", marks: "Marks drawn", draw: "First draw", resize: "Resize" }[k]}</dt><dd data-k="${k}">-</dd></div>`,
      )
      .join("")}</dl>
    <details><summary>Spec</summary><pre><code></code></pre></details>`;
  box.querySelector("h2")!.textContent = tile.title;
  box.querySelector("p")!.textContent = tile.note;
  box.querySelector("maya-chart")!.setAttribute("style", `height: ${tile.h ?? 320}px`);
  $("tiles").append(box);
  states.set(tile.id, { tile, box, done: false, queued: false, seen: false });
}

const set = (s: State, k: string, v: string) =>
  (s.box.querySelector(`[data-k=${k}]`)!.textContent = v);
const ms = (v: number) => `${v < 10 ? v.toFixed(1) : Math.round(v)} ms`;
const chartOf = (s: State) => s.box.querySelector<Chart>("maya-chart")!;

/** Fires first on every size change (created before any chart connects), so it times the whole re-layout. */
const resize = new ResizeObserver((es) => {
  for (const e of es) {
    const s = states.get(e.target.closest("section")?.id ?? "");
    if (!s) continue; // a chart dropped by a new row count
    if (!s.seen) {
      s.seen = true;
      continue;
    }
    if (!s.done) continue;
    const t0 = performance.now();
    void rendered(chartOf(s), 400)
      .then(frame)
      .then(() => set(s, "resize", ms(performance.now() - t0)));
  }
});
for (const s of states.values()) resize.observe(chartOf(s));

/** Resolves on the chart's next render or error, or after `wait` ms when it has nothing to redraw. */
const rendered = (c: Chart, wait = 120000) =>
  new Promise<string | null>((done) => {
    const end = (v: string | null) => {
      clearTimeout(timer);
      c.removeEventListener("maya-render", ok);
      c.removeEventListener("maya-error", bad);
      done(v);
    };
    const ok = () => end(null);
    const bad = (e: Event) => end(String((e as CustomEvent).detail?.message ?? "error"));
    const timer = setTimeout(() => end(null), wait);
    c.addEventListener("maya-render", ok);
    c.addEventListener("maya-error", bad);
  });

let rows = 100000;
let table: Order[] | null = null;
let buildMs = 0;
let epoch = 0;
let job: Promise<void> = Promise.resolve();

const status = (text: string) => ($("status").textContent = text);

async function ensure(): Promise<Order[] | null> {
  if (table) return table;
  const mine = epoch;
  const h0 = heap()?.usedJSHeapSize ?? 0;
  const t0 = performance.now();
  const t = await make(
    rows,
    () => mine === epoch,
    (d) => status(`Building ${nf.format(d)} of ${nf.format(rows)} rows`),
  );
  if (mine !== epoch) return null;
  buildMs = performance.now() - t0;
  const mb = Math.round(((heap()?.usedJSHeapSize ?? 0) - h0) / 1048576);
  const grew = mb > 0 ? `, heap +${mb} MB` : "";
  status(`${nf.format(rows)} rows built in ${ms(buildMs)}${grew}`);
  return (table = t);
}

async function draw(s: State) {
  const mine = epoch;
  const data = await ensure();
  if (!data || mine !== epoch) return;
  const c = chartOf(s);
  await frame();
  const t0 = performance.now();
  const done = rendered(c);
  c.spec = { ...s.tile.spec, data } as ChartSpec;
  const err = await done;
  await frame();
  if (mine !== epoch) return;
  set(s, "draw", ms(performance.now() - t0));
  set(s, "rows", nf.format(data.length));
  set(
    s,
    "marks",
    err ? "error" : nf.format(c.shadowRoot!.querySelectorAll("[data-maya=mark]").length),
  );
  const spec = JSON.stringify(
    { ...s.tile.spec, data: [...data.slice(0, 2), "…"] },
    null,
    2,
  ).replace(/\n\s*"…"/, `\n    // … ${nf.format(data.length - 2)} more rows`);
  s.box.querySelector("code")!.textContent = spec;
  s.done = true;
  // Zoom and legend toggles redraw: keep the mark count current.
  c.addEventListener("maya-render", () =>
    set(s, "marks", nf.format(c.shadowRoot!.querySelectorAll("[data-maya=mark]").length)),
  );
  // The entrance (about 1.5 s with its labels) finishes before the next tile's row pass stalls it.
  // Reduced motion has no animations, so no wait. Resize is timed on a real resize (ResizeObserver above).
  await Promise.race([
    Promise.allSettled(c.shadowRoot!.getAnimations().map((a) => a.finished)),
    new Promise((r) => setTimeout(r, 2000)),
  ]);
}

const enqueue = (s: State) => {
  if (s.queued || s.done) return;
  s.queued = true;
  // A chain left over from the previous row count must not draw beside the new one.
  const mine = epoch;
  job = job.then(() => (mine === epoch ? draw(s) : undefined)).catch(() => {});
};

const watch = new IntersectionObserver(
  (es) => es.forEach((e) => e.isIntersecting && enqueue(states.get(e.target.id)!)),
  { rootMargin: "300px" },
);
for (const s of states.values()) watch.observe(s.box);

/** A new count drops the table and every chart (fresh elements: no zoom or hidden series carry over). */
function setRows(n: number) {
  rows = n;
  epoch++;
  table = null;
  job = Promise.resolve();
  document
    .querySelectorAll<HTMLElement>("[data-rows]")
    .forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.rows! === n)));
  history.replaceState(null, "", `?rows=${n}`);
  for (const s of states.values()) {
    const old = chartOf(s);
    const fresh = document.createElement("maya-chart");
    fresh.setAttribute("style", old.getAttribute("style")!);
    resize.unobserve(old);
    old.replaceWith(fresh);
    resize.observe(fresh);
    Object.assign(s, { done: false, queued: false, seen: false });
    for (const k of ["rows", "marks", "draw", "resize"]) set(s, k, "-");
    watch.unobserve(s.box);
    watch.observe(s.box); // re-reports visibility, which queues the visible tiles
  }
  status("");
}

$("rows").addEventListener("click", (e) => {
  const n = +((e.target as HTMLElement).closest<HTMLElement>("[data-rows]")?.dataset.rows ?? 0);
  if (n && n !== rows) setRows(n);
});
const asked = +(new URLSearchParams(location.search).get("rows") ?? 0);
setRows([1e4, 1e5, 5e5, 1e6].includes(asked) ? asked : 1e5);
theme();
