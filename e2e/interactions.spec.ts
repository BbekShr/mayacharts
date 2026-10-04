import { test, expect, type Page, type Locator } from "@playwright/test";

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
          // WebKit and Firefox leave the first-paint axis fades "pending" forever; only count
          // animations that actually started.
          return all(document).flatMap((e) =>
            e.getAnimations().filter((a) => !a.pending && a.playState === "running"),
          ).length;
        }),
      { timeout: 5000 },
    )
    .toBe(0);
}

async function open(page: Page): Promise<void> {
  await page.goto("gallery.html");
  for (const id of ["monthly-line", "treemap", "bubble", "pace-lines"])
    await expect(page.locator(`#${id} [data-maya=mark]`).first()).toBeAttached();
  await settle(page);
  // Record every interaction event, by chart id, so tests can assert on detail and counts.
  await page.evaluate(() => {
    const log: { id: string; type: string; detail: any }[] = ((window as any).__ev = []);
    for (const el of document.querySelectorAll("maya-chart"))
      for (const type of ["maya-view", "maya-select"])
        el.addEventListener(type, (e) =>
          log.push({
            id: el.id,
            type,
            detail: JSON.parse(JSON.stringify((e as CustomEvent).detail)),
          }),
        );
  });
}

const events = (page: Page, id: string, type: string) =>
  page.evaluate(([i, t]) => (window as any).__ev.filter((e: any) => e.id === i && e.type === t), [
    id,
    type,
  ] as const);

const view = (page: Page, id: string) =>
  page.evaluate((i) => JSON.parse(JSON.stringify((document.getElementById(i) as any).view)), id);

const selected = (page: Page, id: string) =>
  page.evaluate(
    (i) => JSON.parse(JSON.stringify((document.getElementById(i) as any).selected)),
    id,
  );

async function center(loc: Locator): Promise<{ x: number; y: number }> {
  await loc.scrollIntoViewIfNeeded();
  const b = (await loc.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** Click a mark by coordinates: hit targets overlay the marks. */
async function clickMark(page: Page, loc: Locator): Promise<void> {
  const { x, y } = await center(loc);
  await page.mouse.move(x, y);
  await page.mouse.click(x, y);
}

const animating = (loc: Locator) =>
  loc.evaluateAll((els) => els.reduce((s, e) => s + e.getAnimations().length, 0));

const radios = (page: Page) => page.locator("#monthly-line .maya-ctl [role=radio]");

test.describe("measure toggle", () => {
  test("click morphs marks and fires maya-view {measure:1}", async ({ page }) => {
    await open(page);
    await radios(page).nth(1).scrollIntoViewIfNeeded();
    await radios(page).nth(1).click();
    await expect(radios(page).nth(1)).toHaveAttribute("aria-checked", "true");
    await expect
      .poll(() => animating(page.locator("#monthly-line [data-maya=mark]")), {
        intervals: [0, 10, 10, 20],
        timeout: 1500,
      })
      .toBeGreaterThan(0);
    const ev = await events(page, "monthly-line", "maya-view");
    expect(ev).toHaveLength(1);
    expect(ev[0].detail.measure).toBe(1);
  });

  test("ArrowRight on the radiogroup moves the measure", async ({ page }) => {
    await open(page);
    await radios(page).first().scrollIntoViewIfNeeded();
    await radios(page).first().focus();
    await page.keyboard.press("ArrowRight");
    await expect(radios(page).nth(1)).toHaveAttribute("aria-checked", "true");
    await expect(radios(page).nth(1)).toBeFocused();
    expect((await view(page, "monthly-line")).measure).toBe(1);
    await page.keyboard.press("ArrowLeft");
    await expect(radios(page).first()).toHaveAttribute("aria-checked", "true");
  });

  test("live region text changes after a toggle", async ({ page }) => {
    await open(page);
    const live = page.locator("#monthly-line [data-maya=live]");
    const before = (await live.textContent()) ?? "";
    await radios(page).nth(1).scrollIntoViewIfNeeded();
    await radios(page).nth(1).click();
    await expect.poll(async () => (await live.textContent()) ?? "").not.toBe(before);
    await expect(live).toContainText("Units");
  });

  test("reduced motion: no animations after a toggle", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page);
    await radios(page).nth(1).scrollIntoViewIfNeeded();
    await radios(page).nth(1).click();
    await expect(radios(page).nth(1)).toHaveAttribute("aria-checked", "true");
    await page.waitForTimeout(150);
    expect(await animating(page.locator("#monthly-line [data-maya=mark]"))).toBe(0);
  });

  test("el.view = {measure:1} re-renders without maya-view", async ({ page }) => {
    await open(page);
    await page.evaluate(
      () => ((document.getElementById("monthly-line") as any).view = { measure: 1 }),
    );
    await expect(radios(page).nth(1)).toHaveAttribute("aria-checked", "true");
    await settle(page);
    expect(await events(page, "monthly-line", "maya-view")).toHaveLength(0);
  });
});

test.describe("drill", () => {
  test("click a treemap tile drills, breadcrumb shows, Escape pops", async ({ page }) => {
    await open(page);
    const crumbs = page.locator("#treemap .maya-crumbs");
    await expect(crumbs).toHaveCount(0);
    await clickMark(page, page.locator("#treemap [data-maya=mark]").first());
    await expect(crumbs).toBeVisible();
    await expect.poll(async () => (await view(page, "treemap")).drill?.length).toBe(1);
    const ev = await events(page, "treemap", "maya-view");
    expect(ev.at(-1).detail.drill).toHaveLength(1);
    // Library gap: focus is not moved into the chart after a drill (BODY keeps it), so Escape
    // would go nowhere. Focus the svg the way a keyboard user would.
    await page.locator("#treemap svg").focus();
    await page.keyboard.press("Escape");
    await expect.poll(async () => (await view(page, "treemap")).drill?.length ?? 0).toBe(0);
    await expect(crumbs).toHaveCount(0);
  });
});

test.describe("select", () => {
  test("click a bubble selects, data update keeps it, Escape clears", async ({ page }) => {
    await open(page);
    const marks = page.locator("#bubble [data-maya=mark]");
    await clickMark(page, marks.nth(2));
    await expect(page.locator("#bubble [data-maya=mark][data-selected]")).toHaveCount(1);
    const ev = await events(page, "bubble", "maya-select");
    expect(ev).toHaveLength(1);
    expect(ev[0].detail.selected).toHaveLength(1);

    await page.evaluate(() => {
      const el = document.getElementById("bubble") as any;
      el.data = el.spec.data.map((r: any) => ({ ...r, units: r.units * 1.1 }));
    });
    await settle(page);
    await expect(page.locator("#bubble [data-maya=mark][data-selected]")).toHaveCount(1);
    expect(await selected(page, "bubble")).toHaveLength(1);

    await page.keyboard.press("Escape");
    await expect(page.locator("#bubble [data-maya=mark][data-selected]")).toHaveCount(0);
    expect(await selected(page, "bubble")).toHaveLength(0);
  });
});

test.describe("zoom", () => {
  test("drag sets the window, Reset chip shows, double-click resets", async ({ page }) => {
    await open(page);
    const svg = page.locator("#pace-lines svg.maya-svg");
    await svg.scrollIntoViewIfNeeded();
    const b = (await svg.boundingBox())!;
    const y = b.y + b.height / 2;
    await page.mouse.move(b.x + b.width * 0.3, y);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.45, y, { steps: 5 });
    await page.mouse.move(b.x + b.width * 0.6, y, { steps: 5 });
    await page.mouse.up();
    await expect.poll(async () => (await view(page, "pace-lines")).window?.length).toBe(2);
    const ev = await events(page, "pace-lines", "maya-view");
    expect(ev.at(-1).detail.window).toHaveLength(2);
    await expect(page.locator("#pace-lines .maya-reset")).toBeVisible();

    const b2 = (await svg.boundingBox())!;
    await page.mouse.dblclick(b2.x + b2.width * 0.5, b2.y + b2.height / 2);
    await expect.poll(async () => (await view(page, "pace-lines")).window).toBeUndefined();
    await expect(page.locator("#pace-lines .maya-reset")).toHaveCount(0);
  });
});

test.describe("touch", () => {
  const touchPage = async (browser: any, baseURL: string | undefined) => {
    const ctx = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      baseURL: baseURL!,
      viewport: { width: 390, height: 844 },
    });
    return { ctx, page: (await ctx.newPage()) as Page };
  };

  test("tap selects a bubble", async ({ browser, browserName, baseURL }) => {
    test.skip(browserName === "firefox", "Firefox lacks isMobile");
    const { ctx, page } = await touchPage(browser, baseURL);
    await open(page);
    const { x, y } = await center(page.locator("#bubble [data-maya=mark]").nth(2));
    await page.touchscreen.tap(x, y);
    await expect(page.locator("#bubble [data-maya=mark][data-selected]")).toHaveCount(1);
    expect((await events(page, "bubble", "maya-select"))[0].detail.selected).toHaveLength(1);
    await ctx.close();
  });

  test("tap drills into a treemap tile", async ({ browser, browserName, baseURL }) => {
    test.skip(browserName === "firefox", "Firefox lacks isMobile");
    const { ctx, page } = await touchPage(browser, baseURL);
    await open(page);
    const { x, y } = await center(page.locator("#treemap [data-maya=mark]").first());
    await page.touchscreen.tap(x, y);
    await expect(page.locator("#treemap .maya-crumbs")).toBeVisible();
    await expect.poll(async () => (await view(page, "treemap")).drill?.length).toBe(1);
    await ctx.close();
  });
});
