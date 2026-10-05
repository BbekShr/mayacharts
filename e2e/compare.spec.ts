// Comparison harness: every library in e2e/compare/ref draws the same twelve charts through
// e2e/compare/ref.html, and a speed suite pushes scatter and line rows through each. Everything the
// scoreboard page shows is written to site/compare.json by this run. Run it with `npm run compare`;
// the default `npm run e2e` skips it. Narrow a run with COMPARE_LIBS=maya,echarts and
// COMPARE_SIZES=1000,10000. A narrowed run overwrites only the libraries it ran.
import AxeBuilder from "@axe-core/playwright";
import {
  test,
  type Browser,
  type BrowserContext,
  type CDPSession,
  type Page,
} from "@playwright/test";
import { build } from "esbuild";
import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { CHARTS, EXCLUDED, LIBS, TITLES, type Chart, type Lib } from "./compare/ref/data.ts";

const ORIGIN = "https://compare.test";
const CSP =
  "default-src 'self'; style-src 'self'; require-trusted-types-for 'script'; trusted-types mayacharts";
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const SIZE = { width: 640, height: 360 };
const TTFP_RUNS = 3;
const ARROW_CAP = 40;
const TAB_CAP = 60;
const SPEED_RUNS = 5;
const UPDATES = 10;
const CELL_MS = 30_000;
/** A first paint slower than this skips the larger sizes for that library, chart and CPU. */
const SLOW_MS = 5_000;
const THROTTLE = 4;
const KINDS = ["scatter", "line"] as const;
type Kind = (typeof KINDS)[number];

const BUILD = resolve("e2e/compare/.build");
const ROOT = resolve("e2e/compare");
const OUT = "site/compare.json";
const TYPES: Record<string, string> = {
  ".js": "text/javascript",
  ".html": "text/html",
  ".css": "text/css",
  ".json": "application/json",
};

const only = (name: string): string[] | null =>
  process.env[name]?.split(",").filter(Boolean) ?? null;
const wanted = only("COMPARE_LIBS");
const libs = LIBS.filter(
  (l) => existsSync(join(BUILD, "..", "ref", l)) && (!wanted || wanted.includes(l)),
);
const sizes = (only("COMPARE_SIZES") ?? ["1000", "10000", "100000", "1000000"]).map(Number);

const version = (pkg: string): string | null => {
  try {
    return JSON.parse(readFileSync(`node_modules/${pkg}/package.json`, "utf-8")).version;
  } catch {
    return null;
  }
};
const PKG: Record<Lib, string> = {
  maya: "mayacharts",
  chartjs: "chart.js",
  echarts: "echarts",
  plot: "@observablehq/plot",
  vegalite: "vega-lite",
  recharts: "recharts",
  nivo: "@nivo/core",
  plotly: "plotly.js-dist-min",
};

const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[xs.length >> 1]!;
const r1 = (x: number): number => Math.round(x * 10) / 10;
const pctl = (xs: number[], p: number): number =>
  [...xs].sort((a, b) => a - b)[Math.ceil(p * xs.length) - 1]!;

let prev: Record<string, any> = {};
const results: Record<string, Record<string, unknown>> = {};
const speed: Record<string, Record<string, Record<string, Record<string, unknown>>>> = {};

function write(browser: Browser): void {
  const keep = (old: Record<string, any> | undefined, now: Record<string, any>) => {
    // Libraries this run did not measure keep their last numbers; anything else is dropped.
    const m = Object.fromEntries(
      Object.entries(old ?? {}).filter(([l]) => (LIBS as readonly string[]).includes(l)),
    );
    return { ...m, ...now };
  };
  const json = {
    generated: new Date().toISOString().slice(0, 10),
    versions: {
      commit: execSync("git rev-parse --short HEAD").toString().trim(),
      ...Object.fromEntries(LIBS.map((l) => [l, version(PKG[l])])),
    },
    browser: `Chromium ${browser.version()}`,
    csp: CSP,
    arrowCap: ARROW_CAP,
    speedDefinition: `First paint is the time from before the draw call until the chart holds marks (an svg shape or a canvas with ink) and the next frame has painted (a task after that frame, so its style, layout and paint count). Update is ${UPDATES} calls of the redraw function with fresh rows, each timed from the call until the chart drew (a DOM mutation or a canvas draw call) and the next frame painted; p50 and p95 per load. Heap is JS heap after a forced GC and ${UPDATES} updates. Median of ${SPEED_RUNS} fresh loads per cell, no CSP, reduced motion so animation time is not counted, CPU throttle ${THROTTLE}x in the second column. A cell stops after ${CELL_MS / 1000} s with the runs it finished; one with none is recorded with its reason, and a first paint over ${SLOW_MS / 1000} s skips the larger sizes.`,
    notes: [
      "Each library draws the same data through its own reference module in e2e/compare/ref, written the way its documentation shows, with defaults and no theming.",
      "The CSP row is its own test: a chart that is blocked by the policy is recorded as failing there, and the speed suite runs with no CSP so those numbers survive.",
      "A canvas exposes little to axe, so a low axe count there is not evidence of accessibility.",
    ],
    libs: LIBS.filter((l) => existsSync(join(ROOT, "ref", l))),
    charts: CHARTS,
    titles: TITLES,
    excluded: EXCLUDED,
    results: keep(prev["results"], results),
    // Per size, so a run narrowed with COMPARE_SIZES keeps the other sizes of the same library.
    speed: Object.fromEntries(
      Object.entries(keep(prev["speed"], speed)).map(([l, kinds]) => [
        l,
        Object.fromEntries(
          Object.entries(kinds as Record<string, object>).map(([k, byN]) => [
            k,
            { ...prev["speed"]?.[l]?.[k], ...byN },
          ]),
        ),
      ]),
    ),
    ...(prev["eval"] ? { eval: prev["eval"] } : {}),
  };
  writeFileSync(OUT, JSON.stringify(json, null, 2) + "\n");
  execSync(`npx prettier --write ${OUT}`, { stdio: "ignore" });
}

async function route(ctx: BrowserContext, csp: boolean): Promise<void> {
  await ctx.route(`${ORIGIN}/**`, (r) => {
    const p = new URL(r.request().url()).pathname;
    const headers: Record<string, string> = csp ? { "Content-Security-Policy": CSP } : {};
    const file = resolve(ROOT, p.slice(1));
    if (!file.startsWith(ROOT + sep)) return r.fulfill({ status: 403 });
    if (!existsSync(file)) return r.fulfill({ status: 404, headers });
    return r.fulfill({
      body: readFileSync(file),
      contentType: TYPES[extname(file)] ?? "text/plain",
      headers,
    });
  });
}

interface Done {
  ok: boolean;
  error?: string;
  ttfp?: number;
  unsupported?: boolean;
}
interface Loaded {
  page: Page;
  violations: string[];
  errors: string[];
  done: Done;
}

async function load(
  ctx: BrowserContext,
  lib: string,
  chart: string,
  extra = "",
  timeout = 90_000,
): Promise<Loaded> {
  const page = await ctx.newPage();
  const violations: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.exposeFunction("__violation", (s: string) => violations.push(s));
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) =>
      (window as any).__violation(`${e.violatedDirective}: ${e.blockedURI} ${e.sample}`.trim()),
    );
  });
  await page.goto(`${ORIGIN}/ref.html?lib=${lib}&chart=${chart}${extra}`);
  const done: Done = await page
    .waitForFunction(() => (window as any).__done || false, null, { timeout })
    .then((h) => h.jsonValue() as Promise<Done>)
    .catch(() => ({ ok: false, error: `no result within ${timeout / 1000} s` }));
  return { page, violations, errors, done };
}

/** True when the chart box holds ink: a canvas pixel, or several shapes in an SVG (crossing shadow roots). */
const PAINTED = () => {
  const walk = (n: ParentNode, out: Element[]): Element[] => {
    for (const e of Array.from(n.querySelectorAll("*"))) {
      out.push(e);
      if (e.shadowRoot) walk(e.shadowRoot, out);
    }
    return out;
  };
  const all = walk(document.getElementById("chart")!, []);
  for (const c of all.filter((e): e is HTMLCanvasElement => e instanceof HTMLCanvasElement)) {
    if (!c.width || !c.height) continue;
    const g = c.getContext("2d");
    if (!g) return true;
    const d = g.getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < d.length; i += 4) if (d[i]) return true;
  }
  const shapes = all.filter(
    (e) =>
      /^(path|rect|circle|polygon|ellipse)$/.test(e.tagName) &&
      e.closest("svg") &&
      (e as SVGGraphicsElement).getBBox().width + (e as SVGGraphicsElement).getBBox().height > 0,
  );
  return shapes.length >= 5;
};

/** Deep active element id, and whether it sits inside #chart (crossing shadow roots). */
const ACTIVE = () => {
  const w = window as any;
  w.__ids ??= new WeakMap();
  w.__n ??= 0;
  let el: Element | null = document.activeElement;
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
  if (!el) return { id: -1, inChart: false };
  if (!w.__ids.has(el)) w.__ids.set(el, ++w.__n);
  let n: Node | null = el;
  let inChart = false;
  while (n) {
    if ((n as Element).id === "chart") inChart = true;
    n = n.parentNode ?? (n as ShadowRoot).host ?? null;
  }
  w.__last = el;
  return { id: w.__ids.get(el) as number, inChart, tag: el.tagName.toLowerCase() };
};

async function keyboard(page: Page): Promise<{ tabStops: number; arrowStates: number }> {
  const stops = new Set<number>();
  let entered = false;
  for (let i = 0; i < TAB_CAP; i++) {
    await page.keyboard.press("Tab");
    const a = await page.evaluate(ACTIVE);
    if (a.inChart) {
      entered = true;
      stops.add(a.id);
      await page.evaluate(() => {
        const w = window as any;
        (w.__stops ??= new Map()).set(w.__ids.get(w.__last), w.__last);
      });
    } else if (entered) break;
  }
  if (!stops.size) return { tabStops: 0, arrowStates: 0 };
  const chart = page.locator("#chart");
  const sig = async (): Promise<string> => {
    const a = await page.evaluate(() => {
      let el: Element | null = document.activeElement;
      while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
      return `${el?.tagName}|${el?.getAttribute("aria-activedescendant") ?? ""}|${el?.id ?? ""}`;
    });
    return a + "|" + (await chart.ariaSnapshot({ timeout: 10_000 }).catch(() => ""));
  };
  // Arrow keys count from the first tab stop where ArrowRight changes anything.
  let best = 0;
  for (const id of stops) {
    await page.evaluate((i) => (window as any).__stops.get(i).focus(), id);
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
    const seen = new Set([await sig()]);
    for (let i = 0; i < ARROW_CAP; i++) {
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(30);
      seen.add(await sig());
      if (i === 2 && seen.size === 1) break;
    }
    best = Math.max(best, seen.size - 1);
    if (best) break;
  }
  return { tabStops: stops.size, arrowStates: best };
}

/** Ink (non-white pixels) in the left and right fifth of the chart screenshot. */
async function ink(helper: Page, png: Buffer): Promise<{ left: number; right: number }> {
  return helper.evaluate(async (b64) => {
    const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const g = c.getContext("2d")!;
    g.drawImage(bmp, 0, 0);
    const w = Math.floor(bmp.width / 5);
    const count = (x0: number) => {
      const d = g.getImageData(x0, 0, w, bmp.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4)
        if (d[i]! < 215 || d[i + 1]! < 215 || d[i + 2]! < 215) n++;
      return n / (w * bmp.height);
    };
    return { left: count(0), right: count(bmp.width - w) };
  }, png.toString("base64"));
}

/**
 * Server-side render with no DOM. maya: the spec the reference set on <maya-chart>, through
 * render(). echarts: the real reference module, bundled for node with init() redirected to the SVG
 * renderer. Other libraries need a browser or have no cheap documented path, so they record null.
 */
const NO_SSR: Partial<Record<Lib, string>> = {
  chartjs: "Chart.js draws to a canvas and has no SVG output.",
  plot: "Plot needs a document to build its SVG.",
  vegalite:
    "Vega can render SVG in node, but it is a separate compile and view step, not measured here.",
  recharts: "Recharts server rendering needs React and its DOM measurement, not measured here.",
  nivo: "Nivo server rendering needs React and a fixed size, not measured here.",
  plotly: "Plotly needs a DOM to draw.",
};
let echartsScratch = "";
async function ssr(lib: Lib, chart: Chart, spec: unknown, rows: unknown): Promise<unknown> {
  const noDom = typeof (globalThis as any).window === "undefined";
  const note = NO_SSR[lib];
  if (note) return null;
  try {
    let svg = "";
    if (lib === "maya") {
      const m = await import(pathToFileURL(resolve("dist/index.js")).href);
      for (const f of ["flow", "hierarchy", "geo", "radial"])
        await import(pathToFileURL(resolve(`dist/${f}.js`)).href);
      svg = m.render(spec, SIZE);
    } else if (lib === "echarts") {
      echartsScratch ||= mkdtempSync(join(tmpdir(), "compare-ssr-"));
      const inner = resolve("node_modules/echarts/index.js");
      const file = join(echartsScratch, `${chart}.mjs`);
      await build({
        entryPoints: [`e2e/compare/ref/echarts/${chart}.js`],
        outfile: file,
        bundle: true,
        format: "esm",
        platform: "node",
        logLevel: "silent",
        plugins: [
          {
            name: "ssr-shim",
            setup(b) {
              b.onResolve({ filter: /^echarts$/ }, () => ({ path: "echarts", namespace: "shim" }));
              b.onLoad({ filter: /.*/, namespace: "shim" }, () => ({
                resolveDir: ROOT,
                contents: `import * as real from ${JSON.stringify(inner)};
export * from ${JSON.stringify(inner)};
export const init = (_d, _t, o) => (globalThis.__ssrChart = real.init(null, null, { ...o, renderer: "svg", ssr: true, ...${JSON.stringify(SIZE)} }));`,
              }));
            },
          },
        ],
      });
      const mod = await import(pathToFileURL(file).href + `?${Date.now()}`);
      await mod.default({}, rows);
      svg = (globalThis as any).__ssrChart.renderToSVGString();
      (globalThis as any).__ssrChart.dispose();
    } else return null;
    return { noDom, svg: svg.includes("<svg"), bytes: svg.length };
  } catch (e) {
    return { noDom, svg: false, bytes: 0, note: String((e as Error).message).slice(0, 160) };
  }
}

// The two tests share one JSON and the speed suite needs a quiet CPU, so they run in order in one worker.
test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  execSync("node scripts/compare-bundle.mjs", { stdio: "inherit" });
  if (existsSync(OUT)) prev = JSON.parse(readFileSync(OUT, "utf-8"));
});

test("compare libraries under one CSP", async ({ browser }: { browser: Browser }) => {
  test.setTimeout(3 * 60 * 60_000);
  const { refData } = await import("./compare/ref/data.ts");
  const rows = refData();
  const ctx = await browser.newContext({
    viewport: { width: 800, height: 500 },
    reducedMotion: "reduce",
    colorScheme: "light",
  });
  await route(ctx, true);
  const helper = await browser.newPage();

  for (const lib of libs) {
    results[lib] = {};
    for (const chart of CHARTS) {
      const row: Record<string, unknown> = {};
      results[lib]![chart] = row;
      if (!existsSync(join(BUILD, lib, `${chart}.js`))) {
        row["supported"] = false;
        row["note"] = "no reference module";
        continue;
      }
      const l = await load(ctx, lib, chart);
      row["supported"] = !l.done.unsupported;
      if (l.done.unsupported) {
        row["note"] = l.done.error;
        await l.page.close();
        continue;
      }
      const painted = l.done.ok ? await l.page.evaluate(PAINTED).catch(() => false) : false;
      const first = l.violations[0] ?? l.errors[0] ?? (l.done.ok ? "" : (l.done.error ?? ""));
      row["rendered"] = painted;
      row["renders"] = painted && !l.violations.length && !l.errors.length;
      row["firstViolation"] = first.replace(/\|$/, "").trim();
      const spec =
        lib === "maya"
          ? await l.page
              .evaluate(() => (document.querySelector("maya-chart") as any)?.spec ?? null)
              .catch(() => null)
          : null;
      row["ssr"] = await ssr(lib, chart, spec, rows[chart]);
      if (!(lib in NO_SSR) && row["ssr"] === null) row["ssrNote"] = "not measured";
      if (lib in NO_SSR) row["ssrNote"] = NO_SSR[lib];
      await l.page.waitForTimeout(300);

      if (!painted) {
        row["axeSeriousCritical"] = null;
        row["keyboard"] = null;
        row["rtl"] = null;
        row["ttfpMs"] = null;
        row["note"] = "did not render, so the remaining measures do not apply";
        await l.page.close();
        console.log(`${lib} ${chart}: did not render: ${first}`);
        continue;
      }

      try {
        const a = await new AxeBuilder({ page: l.page }).include("#chart").withTags(TAGS).analyze();
        row["axeSeriousCritical"] = a.violations.filter((v) =>
          ["serious", "critical"].includes(v.impact ?? ""),
        ).length;
        row["axeRules"] = a.violations.map((v) => `${v.id} (${v.impact})`);
      } catch (e) {
        row["axeSeriousCritical"] = null;
        row["axeError"] = String((e as Error).message).slice(0, 160);
      }
      row["ariaSnapshotLines"] = (
        await l.page
          .locator("#chart")
          .ariaSnapshot({ timeout: 10_000 })
          .catch(() => "")
      )
        .split("\n")
        .filter(Boolean).length;

      const ltr = await l.page.locator("#chart").screenshot();
      row["keyboard"] = await keyboard(l.page);
      await l.page.close();

      // RTL: does ink move from the left fifth of the chart box to the right fifth?
      const r = await load(ctx, lib, chart, "&dir=rtl");
      await r.page.waitForTimeout(300);
      const rtl = await r.page.locator("#chart").screenshot();
      await r.page.close();
      const a = await ink(helper, ltr);
      const b = await ink(helper, rtl);
      const t = 0.003;
      row["rtl"] = {
        yAxisMovedRight: b.right - a.right > t && a.left - b.left > t,
        inkLtr: a,
        inkRtl: b,
      };

      // Time to first paint under the CSP: median of fresh loads (the first load counts).
      const times = [l.done.ttfp!];
      for (let i = 1; i < TTFP_RUNS; i++) {
        const x = await load(ctx, lib, chart);
        if (x.done.ttfp) times.push(x.done.ttfp);
        await x.page.close();
      }
      row["ttfpMs"] = r1(median(times));
      console.log(`${lib} ${chart}: renders=${row["renders"]} ttfp=${row["ttfpMs"]}ms`);
    }
    write(browser);
  }
  await helper.close();
  await ctx.close();
  write(browser);
});

// Speed: no CSP, so a blocked chart does not erase its numbers.
interface Run {
  paint: number;
  p50: number;
  p95: number;
  heap: number;
}

async function run(
  ctx: BrowserContext,
  lib: string,
  kind: Kind,
  n: number,
  rate: number,
  ms: number,
): Promise<Run | string> {
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate });
    await cdp.send("Performance.enable");
    await page.goto(`${ORIGIN}/ref.html?lib=${lib}&chart=${kind}&n=${n}`);
    const done: Done = await page
      .waitForFunction(() => (window as any).__done || false, null, { timeout: ms })
      .then((h) => h.jsonValue() as Promise<Done>);
    if (done.unsupported) return `unsupported: ${done.error}`;
    if (!done.ok) return done.error ?? errors[0] ?? "failed";
    const times: number[] | string = await page.evaluate(async (count) => {
      const w = window as any;
      if (typeof w.__update !== "function") return "no redraw function";
      const out: number[] = [];
      for (let i = 0; i < count; i++) {
        out.push(await w.__timedUpdate(w.__rows(i + 2)));
      }
      return out;
    }, UPDATES);
    if (typeof times === "string") return times;
    await cdp.send("HeapProfiler.collectGarbage");
    const m = (await cdp.send("Performance.getMetrics")).metrics;
    const heap = m.find((x) => x.name === "JSHeapUsedSize")?.value ?? 0;
    return { paint: done.ttfp!, p50: median(times), p95: pctl(times, 0.95), heap: heap / 1e6 };
  } catch (e) {
    return String((e as Error).message)
      .split("\n")[0]!
      .slice(0, 160);
  } finally {
    await page.close().catch(() => {});
  }
}

async function cell(
  ctx: BrowserContext,
  lib: string,
  kind: Kind,
  n: number,
  rate: number,
): Promise<Record<string, unknown>> {
  const end = Date.now() + CELL_MS;
  const ok: Run[] = [];
  let why = "";
  for (let i = 0; i < SPEED_RUNS && Date.now() < end; i++) {
    const r = await run(ctx, lib, kind, n, rate, Math.max(1000, end - Date.now()));
    if (typeof r === "string") {
      why = r;
      break;
    }
    ok.push(r);
  }
  if (!ok.length) return { error: why || `no run finished within ${CELL_MS / 1000} s` };
  const med = (f: (r: Run) => number) => r1(median(ok.map(f)));
  return {
    firstPaintMs: med((r) => r.paint),
    updateP50Ms: med((r) => r.p50),
    updateP95Ms: med((r) => r.p95),
    heapMB: med((r) => r.heap),
    runs: ok.length,
    ...(why ? { note: why } : {}),
  };
}

test("speed: scatter and line at growing row counts", async ({ browser }: { browser: Browser }) => {
  test.setTimeout(8 * 60 * 60_000);
  const ctx = await browser.newContext({
    viewport: { width: 800, height: 500 },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  await route(ctx, false);
  for (const lib of libs) {
    speed[lib] = {};
    for (const kind of KINDS) {
      const byN: Record<string, Record<string, unknown>> = (speed[lib]![kind] = {});
      const failed = new Set<number>();
      for (const n of sizes) {
        byN[n] = {};
        for (const rate of [1, THROTTLE]) {
          const key = rate === 1 ? "normal" : "throttled";
          if (failed.has(rate)) {
            byN[n]![key] = {
              error: `skipped: failed or took over ${SLOW_MS / 1000} s at a smaller size`,
            };
            continue;
          }
          const c = await cell(ctx, lib, kind, n, rate);
          if ("error" in c || (c["firstPaintMs"] as number) > SLOW_MS) failed.add(rate);
          byN[n]![key] = c;
          console.log(`${lib} ${kind} ${n} x${rate}: ${JSON.stringify(c)}`);
        }
      }
    }
    write(browser);
  }
  await ctx.close();
  write(browser);
});
