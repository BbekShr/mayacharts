import { test, expect, type Page } from "@playwright/test";

// The scale page: every chart draws from generated rows, with readouts measured in the browser.
// 100k keeps CI fast; SCALE_1M=1 runs the full million locally.
const IDS = [
  "line-1",
  "line-8",
  "area",
  "kpi",
  "scatter",
  "beeswarm",
  "boxplot",
  "bar-top",
  "bar-ids",
  "sunburst",
  "sankey",
];

async function drawn(page: Page, rows: number) {
  test.setTimeout(rows > 1e5 ? 600_000 : 120_000);
  await page.goto(`scale.html?rows=${rows}`);
  for (const id of IDS) {
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();
    // The resize readout is the last one filled, after the first draw and the 8 px nudge.
    await expect(page.locator(`#${id} [data-k=resize]`)).toContainText("ms", {
      timeout: rows > 1e5 ? 300_000 : 60_000,
    });
  }
}

for (const rows of process.env.SCALE_1M ? [100000, 1000000] : [100000]) {
  test(`scale: ${rows} rows, every chart renders without errors and shows readouts`, async ({
    page,
  }) => {
    await drawn(page, rows);
    for (const id of IDS) {
      const tile = page.locator(`#${id}`);
      expect(
        await tile
          .locator("maya-chart")
          .evaluate((c) => !!c.shadowRoot!.querySelector(".maya-err")),
        id,
      ).toBe(false);
      await expect(tile.locator("[data-k=rows]")).toHaveText(rows.toLocaleString("en-US"));
      for (const k of ["marks", "draw", "resize"]) {
        await expect(tile.locator(`[data-k=${k}]`)).toHaveText(/^[\d,.]+( ms)?$/);
      }
      const marks = Number((await tile.locator("[data-k=marks]").innerText()).replace(/,/g, ""));
      expect(marks, id).toBeGreaterThan(0);
      expect(marks, id).toBeLessThanOrEqual(10000);
    }
  });
}

test("scale: changing the row count redraws every chart", async ({ page }) => {
  test.setTimeout(120_000);
  await drawn(page, 100000);
  await page.locator("[data-rows='10000']").click();
  await expect(page.locator("[data-rows='10000']")).toHaveAttribute("aria-pressed", "true");
  await page.locator("#line-1").scrollIntoViewIfNeeded();
  // The tiles still in view at the bottom draw first, each after its entrance.
  await expect(page.locator("#line-1 [data-k=rows]")).toHaveText("10,000", { timeout: 60_000 });
  await expect(page.locator("#line-1 [data-k=resize]")).toContainText("ms", { timeout: 60_000 });
});

test("scale: density charts match their baselines", async ({ page }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await drawn(page, 100000);
  for (const id of ["beeswarm", "scatter"]) {
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();
    await expect(page.locator(`#${id} maya-chart`)).toHaveScreenshot(`scale-${id}.png`);
  }
});
