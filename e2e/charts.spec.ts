import { test, expect, type Page, type Locator } from "@playwright/test";

const IDS = ["simple", "grouped", "stacked", "live", "html"];

async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const all = (r: ParentNode): Element[] =>
            [...r.querySelectorAll("*")].flatMap((e) => [
              e,
              ...(e.shadowRoot ? all(e.shadowRoot) : []),
            ]);
          return all(document).filter((e) => e.getAnimations().length > 0).length;
        }),
      { timeout: 5000 },
    )
    .toBe(0);
}

async function open(page: Page, path = "index.html"): Promise<void> {
  await page.goto(path);
  await expect(page.locator("#simple [data-maya=mark]").first()).toBeAttached();
  await settle(page);
}

const inViewport = async (page: Page, loc: Locator) => {
  const b = (await loc.boundingBox())!;
  const v = page.viewportSize()!;
  expect(b).toBeTruthy();
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.y).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width).toBeLessThanOrEqual(v.width);
  expect(b.y + b.height).toBeLessThanOrEqual(v.height);
};

async function hoverMark(page: Page, mark: Locator): Promise<void> {
  await mark.scrollIntoViewIfNeeded();
  const b = (await mark.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.move(b.x + b.width / 2 + 1, b.y + b.height / 2 + 1);
}

test("1. every chart renders marks, no errors, no console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await open(page);
  for (const id of IDS) {
    await expect
      .poll(() => page.locator(`#${id} [data-maya=mark]`).count(), { message: id })
      .toBeGreaterThan(0);
    await expect(page.locator(`#${id} .maya-err`)).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test.describe("screenshots", () => {
  test("simple light", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await open(page);
    await expect(page.locator("#simple")).toHaveScreenshot("simple-light.png");
  });
  test("stacked light", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await open(page);
    await expect(page.locator("#stacked")).toHaveScreenshot("stacked-light.png");
  });
  test("grouped dark", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await open(page);
    await expect(page.locator("#grouped")).toHaveScreenshot("grouped-dark.png");
  });
  test("grouped narrow 320", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.emulateMedia({ colorScheme: "light" });
    await open(page);
    await page.waitForTimeout(300);
    await settle(page);
    await expect(page.locator("#grouped")).toHaveScreenshot("grouped-320.png");
  });
});

test("3. hover tooltip shows, contains label, inside viewport, hides", async ({ page }) => {
  await open(page);
  const marks = page.locator("#grouped [data-maya=mark]");
  const tip = page.locator("#grouped .maya-tip");
  await hoverMark(page, marks.nth(4));
  await expect(tip).toBeVisible();
  await expect(tip).toContainText("Q2");
  await inViewport(page, tip);
  await page.mouse.move(2, 2);
  await expect(tip).toBeHidden();
});

test("4. tooltip near right edge stays in viewport", async ({ page }) => {
  await open(page);
  const tip = page.locator("#simple .maya-tip");
  await hoverMark(page, page.locator("#simple [data-maya=mark]").last());
  await expect(tip).toBeVisible();
  await expect(tip).toContainText("Dec");
  await inViewport(page, tip);
});

test.describe("touch", () => {
  test("5. tap shows tooltip, tap outside hides", async ({ browser, browserName, baseURL }) => {
    test.skip(browserName === "firefox", "Firefox lacks isMobile");
    const ctx = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      baseURL: baseURL!,
      viewport: { width: 390, height: 844 },
    });
    const page = await ctx.newPage();
    await open(page);
    const tip = page.locator("#simple .maya-tip");
    const mark = page.locator("#simple [data-maya=mark]").nth(3);
    await mark.scrollIntoViewIfNeeded();
    const b = (await mark.boundingBox())!;
    await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
    await expect(tip).toBeVisible();
    await inViewport(page, tip);
    await page.evaluate(() => scrollTo(0, 0));
    const h = (await page.locator("h1").boundingBox())!;
    await page.touchscreen.tap(h.x + 5, h.y + 5);
    await expect(tip).toBeHidden();
    await ctx.close();
  });
});

test("6. update animates via WAAPI", async ({ page }) => {
  await open(page);
  await page.click("#update");
  await expect
    .poll(
      () =>
        page
          .locator("#live [data-maya=mark]")
          .evaluateAll((els) => els.filter((e) => e.getAnimations().length > 0).length),
      { intervals: [0, 10, 10, 10, 20, 20], timeout: 1500 },
    )
    .toBeGreaterThan(0);
});

test("7. reduced motion: no animations after update", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  await page.click("#update");
  await page.waitForTimeout(150);
  const n = await page
    .locator("#live [data-maya=mark]")
    .evaluateAll((els) => els.reduce((s, e) => s + e.getAnimations().length, 0));
  expect(n).toBe(0);
});

test("8. toggle series changes mark count and settles", async ({ page }) => {
  await open(page);
  const marks = page.locator("#live [data-maya=mark]");
  const before = await marks.count();
  await page.click("#toggle-series");
  await expect.poll(() => marks.count()).toBe(before * 2);
  await settle(page);
  await expect(marks).toHaveCount(before * 2);
  await page.click("#toggle-series");
  await settle(page);
  await expect(marks).toHaveCount(before);
});

test("9. legend toggles series", async ({ page }) => {
  await open(page);
  const btn = page.locator("#grouped [data-maya=legend] button").first();
  const s0 = page.locator('#grouped [data-maya=mark][data-s="0"]');
  expect(await s0.count()).toBeGreaterThan(0);
  await btn.click();
  await expect(btn).toHaveAttribute("aria-pressed", "false");
  await settle(page);
  await expect(s0).toHaveCount(0);
  await btn.click();
  await expect(btn).toHaveAttribute("aria-pressed", "true");
  await settle(page);
  expect(await s0.count()).toBeGreaterThan(0);
});

test("10. keyboard navigation", async ({ page }) => {
  await open(page);
  const svg = page.locator("#grouped svg");
  const tip = page.locator("#grouped .maya-tip");
  await svg.scrollIntoViewIfNeeded();
  await svg.focus();
  // Firefox dispatches the scroll event from scrollIntoView on the next frame; the tooltip hides on scroll.
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#grouped [data-maya=mark][data-active]")).toHaveCount(1);
  await expect(tip).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tip).toBeHidden();
});

test("11. accessibility", async ({ page }) => {
  await open(page);
  const svg = page.locator("#simple svg");
  await expect(svg).toHaveAttribute("role", "img");
  // Named by aria-label, with no root <title> (that pops the browser's own tooltip on hover).
  const text = (await svg.getAttribute("aria-label")) ?? "";
  expect(await svg.locator(":scope > title").count()).toBe(0);
  expect(text.trim().length).toBeGreaterThan(0);
  const table = page.locator("#simple table.maya-sr");
  await expect(table.locator("caption")).not.toBeEmpty();
  const cats = await page
    .locator("#simple [data-maya=mark]")
    .evaluateAll((e) => new Set(e.map((x) => x.getAttribute("data-c"))).size);
  await expect(table.locator("tbody tr")).toHaveCount(cats);
});

test.describe("SSR", () => {
  test("12a. marks exist without JS", async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false, baseURL: baseURL! });
    const page = await ctx.newPage();
    await page.goto("ssr.html");
    expect(await page.locator("maya-chart [data-maya=mark]").count()).toBeGreaterThan(0);
    await ctx.close();
  });
  test("12b. becomes interactive with JS", async ({ page }) => {
    await page.goto("ssr.html");
    await expect(page.locator("maya-chart [data-maya=mark]").first()).toBeAttached();
    await settle(page);
    // Hydration may swap the SSR marks under the pointer: retry the hover until the tip shows.
    await expect(async () => {
      await hoverMark(page, page.locator("maya-chart [data-maya=mark]").nth(2));
      await expect(page.locator("maya-chart .maya-tip")).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 10000 });
  });
});

test("13. anchor positioning support (informational)", async ({ page, browserName }) => {
  await page.goto("index.html");
  const ok = await page.evaluate(() => CSS.supports("anchor-name: --x"));
  test.info().annotations.push({ type: "anchor-name", description: `${browserName}: ${ok}` });
  console.log(`CSS.supports("anchor-name: --x") [${browserName}] = ${ok}`);
});
