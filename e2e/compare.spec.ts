// Comparison harness: mayaCharts, Chart.js and ECharts draw the same four charts under the same
// strict CSP. Everything the site's compare page shows is written to site/compare.json by this
// run. Run it with `npm run compare`; the default `npm run e2e` skips it.
import AxeBuilder from "@axe-core/playwright";
import { test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { execSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { pathToFileURL } from "node:url";
import { makeData, SIZE } from "./compare/data.ts";
import { echartsOptions, mayaSpecs } from "./compare/specs.js";

const ORIGIN = "https://compare.test";
const CSP =
  "default-src 'self'; style-src 'self'; require-trusted-types-for 'script'; trusted-types mayacharts";
const LIBS = ["mayacharts", "chartjs", "echarts"] as const;
type Lib = (typeof LIBS)[number];
const CHARTS = ["bar", "line", "scatter", "heatmap"] as const;
type ChartName = (typeof CHARTS)[number];
const PAGE: Record<Lib, string> = {
  mayacharts: "maya.html",
  chartjs: "chartjs.html",
  echarts: "echarts.html",
};
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const TTFP_RUNS = 3;
const ARROW_CAP = 40;
const TAB_CAP = 60;

const DIST = resolve("dist/element.js");
const FILES: Record<string, string> = {
  "/lib/maya/element.js": DIST,
  "/lib/chart.umd.min.js": resolve("node_modules/chart.js/dist/chart.umd.min.js"),
  "/lib/echarts.min.js": resolve("node_modules/echarts/dist/echarts.min.js"),
};
const TYPES: Record<string, string> = {
  ".js": "text/javascript",
  ".html": "text/html",
  ".css": "text/css",
  ".json": "application/json",
};

const data = makeData();
const dataJson = JSON.stringify(data);
const version = (pkg: string): string =>
  JSON.parse(readFileSync(`node_modules/${pkg}/package.json`, "utf-8")).version;

interface Loaded {
  page: Page;
  violations: string[];
  errors: string[];
  scriptBytes: number;
  done: { ok: boolean; error?: string; ttfp?: number; unsupported?: boolean };
}

async function route(ctx: BrowserContext): Promise<void> {
  await ctx.route(`${ORIGIN}/**`, (r) => {
    const p = new URL(r.request().url()).pathname;
    const headers = { "Content-Security-Policy": CSP };
    if (p === "/data.json")
      return r.fulfill({ body: dataJson, contentType: TYPES[".json"]!, headers });
    const file = FILES[p] ?? resolve("e2e/compare", p.slice(1));
    if (!file.startsWith(resolve("e2e/compare") + sep) && !FILES[p])
      return r.fulfill({ status: 403 });
    if (!existsSync(file)) return r.fulfill({ status: 404, headers });
    return r.fulfill({
      body: readFileSync(file),
      contentType: TYPES[extname(file)] ?? "text/plain",
      headers,
    });
  });
}

async function load(ctx: BrowserContext, lib: Lib, chart: ChartName, dir = "ltr"): Promise<Loaded> {
  const page = await ctx.newPage();
  const violations: string[] = [];
  const errors: string[] = [];
  let scriptBytes = 0;
  const pending: Promise<void>[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("response", (res) => {
    if (!new URL(res.url()).pathname.startsWith("/lib/")) return;
    pending.push(
      res
        .body()
        .then((b) => void (scriptBytes += gzipSync(b).length))
        .catch(() => {}),
    );
  });
  await page.exposeFunction("__violation", (s: string) => violations.push(s));
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) =>
      (window as any).__violation(`${e.violatedDirective}: ${e.blockedURI} ${e.sample}`.trim()),
    );
  });
  await page.goto(`${ORIGIN}/${PAGE[lib]}?chart=${chart}&dir=${dir}`);
  await page.waitForFunction(() => (window as any).__done || false, null, { timeout: 90_000 });
  await Promise.all(pending);
  const done = await page.evaluate(() => (window as any).__done);
  return { page, violations, errors, scriptBytes, done };
}

const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[xs.length >> 1]!;

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

async function ssr(lib: Lib, chart: ChartName): Promise<Record<string, unknown>> {
  const noDom =
    typeof (globalThis as any).window === "undefined" &&
    typeof (globalThis as any).document === "undefined";
  try {
    if (lib === "mayacharts") {
      const m = await import(pathToFileURL(resolve("dist/index.js")).href);
      const svg: string = m.render(mayaSpecs(data)[chart], SIZE);
      return { noDom, svg: svg.includes("<svg"), bytes: svg.length };
    }
    if (lib === "echarts") {
      const e = await import("echarts");
      const c = e.init(null as any, null as any, { renderer: "svg", ssr: true, ...SIZE });
      c.setOption(echartsOptions(data)[chart]);
      const svg = c.renderToSVGString();
      c.dispose();
      return { noDom, svg: svg.includes("<svg"), bytes: svg.length };
    }
    // Chart.js draws to a canvas context. Try it with no DOM and see what comes out.
    const { Chart } = await import("chart.js/auto");
    let c: unknown = null;
    try {
      c = new Chart(null as any, { type: "bar", data: { labels: [], datasets: [] } });
    } catch {}
    return {
      noDom,
      svg: false,
      bytes: 0,
      note: `Chart.js has no SVG output${c ? "" : " and made no chart without a canvas"}.`,
    };
  } catch (e) {
    return {
      noDom,
      svg: false,
      bytes: 0,
      note: `could not render without a DOM: ${String((e as Error).message).slice(0, 120)}`,
    };
  }
}

test("compare libraries under one CSP", async ({ browser }: { browser: Browser }) => {
  test.setTimeout(20 * 60_000);
  const ctx = await browser.newContext({
    viewport: { width: 800, height: 500 },
    reducedMotion: "reduce",
    colorScheme: "light",
  });
  await route(ctx);
  const helper = await browser.newPage();
  const results: Record<string, unknown>[] = [];

  for (const lib of LIBS) {
    for (const chart of CHARTS) {
      const row: Record<string, unknown> = { library: lib, chart };
      const l = await load(ctx, lib, chart);
      row["supported"] = !l.done.unsupported;
      row["gzipBytes"] = l.scriptBytes;
      row["ssr"] = await ssr(lib, chart);
      if (l.done.unsupported) {
        row["note"] = l.done.error;
        await l.page.close();
        results.push(row);
        continue;
      }
      const probe: { painted: boolean; error?: string } = l.done.ok
        ? await l.page.evaluate(() => (window as any).__probe())
        : { painted: false };
      const painted = probe.painted;
      const first =
        l.violations[0] ?? l.errors[0] ?? (probe.error || (l.done.ok ? "" : (l.done.error ?? "")));
      row["rendered"] = painted;
      row["renders"] = painted && !l.violations.length && !l.errors.length;
      row["firstViolation"] = first.replace(/\|$/, "").trim();
      await l.page.waitForTimeout(300);

      if (!painted) {
        row["axeSeriousCritical"] = null;
        row["keyboard"] = null;
        row["rtl"] = null;
        row["ttfpMs"] = null;
        row["note"] = "did not render, so the remaining measures do not apply";
        await l.page.close();
        results.push(row);
        console.log(`${lib} ${chart}: did not render: ${first}`);
        continue;
      }

      // axe: serious and critical only, scoped to the chart box.
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

      // RTL: does ink move from the left fifth to the right fifth of the chart box?
      const r = await load(ctx, lib, chart, "rtl");
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

      // Time to first paint: median of fresh loads (the first load counts).
      const times = [l.done.ttfp!];
      for (let i = 1; i < TTFP_RUNS; i++) {
        const x = await load(ctx, lib, chart);
        if (x.done.ttfp) times.push(x.done.ttfp);
        await x.page.close();
      }
      row["ttfpMs"] = Math.round(median(times) * 10) / 10;
      results.push(row);
      console.log(`${lib} ${chart}: renders=${row["renders"]} ttfp=${row["ttfpMs"]}ms`);
    }
  }
  await helper.close();

  const out = "site/compare.json";
  const prev = existsSync(out) ? JSON.parse(readFileSync(out, "utf-8")) : {};
  const json = {
    generated: new Date().toISOString().slice(0, 10),
    versions: {
      mayacharts: JSON.parse(readFileSync("package.json", "utf-8")).version,
      chartjs: version("chart.js"),
      echarts: version("echarts"),
      commit: execSync("git rev-parse --short HEAD").toString().trim(),
    },
    arrowCap: ARROW_CAP,
    browser: `Chromium ${browser.version()}`,
    csp: CSP,
    notes: [
      "Chart.js loads chart.umd.min.js and ECharts loads echarts.min.js, the full builds, not tree-shaken. mayaCharts loads dist/element.js.",
      "Chart.js and ECharts draw to canvas in the browser. ECharts SSR uses its SVG renderer.",
      "Chart.js has no heatmap type in core, and its time scale needs a separate date adapter, so months are category labels.",
      "Accessibility setup: Chart.js canvas gets role=img and an aria-label, ECharts gets aria.enabled. mayaCharts runs with defaults.",
    ],
    results,
    ...(prev.eval ? { eval: prev.eval } : {}),
  };
  writeFileSync(out, JSON.stringify(json, null, 2) + "\n");
});
