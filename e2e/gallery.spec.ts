import { test, expect } from "@playwright/test";

const TILES = [
  "race",
  "drift",
  "feed",
  "monthly-line",
  "pace-lines",
  "area",
  "rules",
  "line-labels",
  "stacked-area",
  "waterfall",
  "ridgeline",
  "radial",
  "hbar",
  "league",
  "diverging",
  "bar-y2",
  "memory",
  "dumbbell",
  "parallel",
  "weave",
  "scatter",
  "bubble",
  "boxplot",
  "funnel",
  "beeswarm",
  "heatmap",
  "calendar",
  "constellation",
  "waffle",
  "units",
  "marimekko",
  "share-bar",
  "treemap",
  "sunburst",
  "sankey",
  "sankey-drill",
  "chord",
  "hexmap",
  "kpi",
  "kpi-multi",
  "kpi-goals",
  "gauge",
  "table",
  "orbit",
  "time-line",
  "time-bar",
  "scatter-dense",
];

test("gallery: every tile renders marks, no errors, spec shown as JSON", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("gallery.html");
  await expect(page.locator("section")).toHaveCount(TILES.length);
  await expect(page.locator("#sample-note")).toContainText("synthetic");
  for (const id of TILES) {
    const section = page.locator(`section:has(#${id})`);
    await expect(section.locator("h2")).toHaveCount(1);
    await expect(page.locator(`#${id}`)).toHaveCSS("height", id === "calendar" ? "210px" : "320px");
    await expect
      .poll(() => page.locator(`#${id} [data-maya=mark]`).count(), { message: id })
      .toBeGreaterThan(0);
    await expect(page.locator(`#${id} .maya-err`), id).toHaveCount(0);
    const code = (await page.locator(`#${id}-code`).textContent()) ?? "";
    expect(code, id).toContain('"type"');
    expect(code, id).toContain("// … more rows");
    const json = JSON.parse(code.replace(/,?\s*\/\/ … more rows/g, ""));
    expect(json.data.length, id).toBeLessThanOrEqual(3);
  }
  for (const id of ["race", "drift"]) await expect(page.locator(`#${id} .maya-play`)).toBeVisible();
  expect(errors).toEqual([]);
});
