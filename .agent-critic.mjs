import { chromium } from "playwright";
const OUT = "/private/tmp/claude-501/-Users-bibekshrestha-mayaCharts/f87bc104-4a19-45aa-90d5-bc1cc9d7fc5a/scratchpad/critic/";
const URL = "http://localhost:5173/mayacharts/gallery.html";
const IDS = ["dash-line","annotate-bars","slope-scatter","log-scatter","treemap-nested","ratio-drill","rules-band","headline","sankey-drill","share-bar","sunburst","chord","marimekko"];
const b = await chromium.launch();
async function page(scheme, w = 1280) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2, colorScheme: scheme, reducedMotion: "reduce" });
  await ctx.addInitScript((s) => localStorage.setItem("maya-theme", s), scheme);
  const p = await ctx.newPage();
  p.on("console", (m) => m.type() === "error" && console.log("console:", m.text()));
  await p.goto(URL); await p.waitForTimeout(2500);
  return p;
}
const mode = process.argv[2] || "all";
if (mode === "all") {
  for (const [scheme, w, tag] of [["light",1280,"L"],["dark",1280,"D"],["light",360,"N"],["dark",360,"ND"]]) {
    const p = await page(scheme, w);
    for (const id of IDS) {
      const el = p.locator(`#${id}`); await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(150);
      await el.screenshot({ path: `${OUT}${id}-${tag}.png` });
    }
    await p.context().close();
  }
}
await b.close();
