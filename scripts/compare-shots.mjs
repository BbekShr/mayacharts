// Screenshots of every reference chart (e2e/compare/ref/<lib>/<chart>) for the side-by-side
// view on site/compare.html, written to site/public/compare/<lib>-<chart>.png. Library defaults,
// 640x360, light scheme, no CSP. Run after `node scripts/compare-bundle.mjs`.
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";

const ROOT = resolve("e2e/compare");
const OUT = "site/public/compare";
const CHARTS = [
  "bar",
  "grouped",
  "stacked",
  "horizontal",
  "line",
  "multiline",
  "area",
  "scatter",
  "bubble",
  "heatmap",
  "treemap",
  "sankey",
];
const TYPES = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css" };
const libs = readdirSync(resolve(ROOT, ".build"), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 680, height: 400 },
  colorScheme: "light",
});
await ctx.route("https://shots.test/**", (r) => {
  const file = resolve(ROOT, new URL(r.request().url()).pathname.slice(1));
  if (!file.startsWith(ROOT) || !existsSync(file)) return r.fulfill({ status: 404 });
  return r.fulfill({ body: readFileSync(file), contentType: TYPES[extname(file)] ?? "text/plain" });
});
let n = 0;
for (const lib of libs)
  for (const chart of CHARTS) {
    const page = await ctx.newPage();
    await page.goto(`https://shots.test/ref.html?lib=${lib}&chart=${chart}`);
    await page.waitForFunction(() => window.__done, null, { timeout: 30_000 }).catch(() => {});
    const done = await page.evaluate(() => window.__done);
    if (done?.ok) {
      await page.waitForTimeout(1500); // entrance animations settle
      await page.locator("#chart").screenshot({ path: `${OUT}/${lib}-${chart}.png` });
      n++;
    } else if (!done?.unsupported) console.log(`${lib} ${chart}: ${done?.error ?? "timed out"}`);
    await page.close();
  }
await browser.close();
console.log(`wrote ${n} screenshots to ${OUT}`);
