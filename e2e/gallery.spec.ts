import { test, expect } from "@playwright/test";

const TILES = [
  "monthly-line",
  "pace-lines",
  "stacked-area",
  "waterfall",
  "diverging",
  "league",
  "bubble",
  "scatter",
  "heatmap",
  "calendar",
  "treemap",
  "sunburst",
  "sankey",
  "sankey-drill",
  "hexmap",
  "hbar",
  "bar-y2",
  "dumbbell",
  "table",
  "parallel",
  "area",
  "line-labels",
  "ridgeline",
  "radial",
  "waffle",
  "marimekko",
  "chord",
  "beeswarm",
  "kpi",
  "time-line",
  "time-bar",
  "scatter-dense",
  "race",
  "drift",
  "feed",
  "rules",
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
  expect(errors).toEqual([]);
});
