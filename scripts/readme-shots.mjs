// One PNG per chart type for the README picture grid, cropped from the gallery tiles and written
// to site/public/readme/<type>.png (Pages serves them; the npm package does not ship them).
// Usage: npm run dev, then npm run readme:shots. GALLERY_URL overrides the default dev URL.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const URL = process.env.GALLERY_URL ?? "http://localhost:5173/mayacharts/gallery.html";
const OUT = "site/public/readme";
// Chart type to the gallery tile that shows it best.
export const TILES = {
  bar: "hbar",
  line: "monthly-line",
  area: "stacked-area",
  scatter: "scatter",
  heatmap: "heatmap",
  waterfall: "waterfall",
  kpi: "kpi",
  dumbbell: "dumbbell",
  ridgeline: "ridgeline",
  beeswarm: "beeswarm",
  parallel: "parallel",
  table: "table",
  treemap: "treemap",
  sunburst: "sunburst",
  marimekko: "marimekko",
  waffle: "waffle",
  sankey: "sankey",
  chord: "chord",
  radial: "radial",
  hexmap: "hexmap",
  boxplot: "boxplot",
  funnel: "funnel",
  weave: "weave",
  units: "units",
  orbit: "orbit",
  constellation: "constellation",
};

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 900, height: 900 },
  deviceScaleFactor: 1,
  colorScheme: "light",
  reducedMotion: "reduce",
});
await page.goto(URL);
for (const [type, id] of Object.entries(TILES)) {
  const chart = page.locator(`maya-chart#${id}`);
  await chart.evaluate((el) => (el.style.width = "640px"));
  await chart.scrollIntoViewIfNeeded();
  await chart.locator("svg").first().waitFor();
  await page.waitForTimeout(400);
  await chart.screenshot({ path: `${OUT}/${type}.png` });
}
await browser.close();
console.log(`${Object.keys(TILES).length} shots in ${OUT}`);
