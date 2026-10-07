import { test, expect, type Page, type Locator } from "@playwright/test";
import { FRAME } from "./specs.ts";

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
            e
              .getAnimations()
              // The orbit's endless rotation never settles.
              .filter(
                (a) =>
                  !a.pending &&
                  a.playState === "running" &&
                  a.effect?.getTiming().iterations !== Infinity,
              ),
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
    // Timing-free: the marks' committed geometry changes (the morph itself is WAAPI on top).
    const dot = page.locator("#monthly-line [data-maya=mark]").first();
    const before = await dot.getAttribute("cy");
    await radios(page).nth(1).scrollIntoViewIfNeeded();
    await radios(page).nth(1).click();
    await expect(radios(page).nth(1)).toHaveAttribute("aria-checked", "true");
    await expect(dot).not.toHaveAttribute("cy", before!);
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
    const crumbs = page.locator("#treemap nav.maya-crumbs");
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

  test("Enter after an arrow key mid-zoom drills the arrowed mark", async ({ page }) => {
    await open(page);
    await page.locator("#treemap svg").focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await view(page, "treemap")).drill?.length).toBe(1);
    await page.keyboard.press("ArrowRight"); // before the zoom lands
    await settle(page);
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await view(page, "treemap")).drill?.length).toBe(2);
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

test.describe("tooltip:false", () => {
  test("arrow keys and Enter still select", async ({ page }) => {
    const data = ["A", "B", "C"].map((c, i) => ({ c, v: i + 1 }));
    await mount(page, "notip", { type: "bar", x: "c", y: "v", data, tooltip: false, select: true });
    await page.locator("#notip svg.maya-svg").focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await selected(page, "notip")).length).toBe(1);
    await expect(page.locator("#notip .maya-tip.maya-open")).toHaveCount(0);
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

/** Mount a chart on the gallery page (the element is already defined there). */
async function mount(page: Page, id: string, spec: object, fresh = true): Promise<void> {
  if (fresh) await open(page);
  await page.evaluate(
    ([i, sp]) => {
      const el = document.createElement("maya-chart") as any;
      el.id = i;
      el.style.cssText = "display:block;width:800px;height:320px";
      el.spec = sp;
      document.body.prepend(el);
    },
    [id, spec] as const,
  );
  await expect(page.locator(`#${id} [data-maya=mark]`).first()).toBeAttached();
  await settle(page);
}

const day = (i: number) => new Date(Date.UTC(2010, 0, 1 + i)).toISOString().slice(0, 10);
const xs = (page: Page, id: string) =>
  page.evaluate((i) => {
    const m = [
      ...document.getElementById(i)!.shadowRoot!.querySelectorAll("[data-maya=mark][data-x]"),
    ];
    return [m[0]!.getAttribute("data-x"), m.at(-1)!.getAttribute("data-x")];
  }, id);

test.describe("time axis", () => {
  test("brush maps to absolute indexes on a downsampled line; Escape restores", async ({
    page,
  }) => {
    const data = Array.from({ length: 3000 }, (_, i) => ({
      d: day(i),
      v: 50 + 30 * Math.sin(i / 90),
    }));
    const line = { type: "line", x: "d", y: "v", zoom: true, data };
    await mount(page, "tl", line);
    const svg = page.locator("#tl svg.maya-svg");
    const b = (await svg.boundingBox())!;
    const [px, py, pw, ph, vw] = await svg.evaluate((e) => [
      ...e.getAttribute("data-plot")!.split(" ").map(Number),
      +e.getAttribute("viewBox")!.split(" ")[2]!,
    ]);
    const k = b.width / vw!;
    const x0 = b.x + (px! + pw! * 0.25) * k,
      x1 = b.x + (px! + pw! * 0.5) * k,
      y = b.y + (py! + ph! / 2) * k;
    await page.mouse.move(x0, y);
    await page.mouse.down();
    await page.mouse.move((x0 + x1) / 2, y, { steps: 5 });
    await page.mouse.move(x1, y, { steps: 5 });
    await page.mouse.up();
    await expect.poll(async () => (await view(page, "tl")).window?.length).toBe(2);
    const [w0, w1] = (await view(page, "tl")).window;
    expect(Math.abs(w0 - 750)).toBeLessThanOrEqual(60);
    expect(Math.abs(w1 - 1500)).toBeLessThanOrEqual(60);
    // A reference chart over exactly that slice has the same first and last labels.
    await mount(page, "ref", { ...line, zoom: false, data: data.slice(w0, w1 + 1) }, false);
    await expect.poll(() => xs(page, "tl")).toEqual(await xs(page, "ref"));
    await page.mouse.move(b.x + 2, b.y + 2);
    await page.keyboard.press("Escape");
    await expect.poll(async () => (await view(page, "tl")).window).toBeUndefined();
  });

  test("bar hover column sits under an unevenly spaced bar", async ({ page }) => {
    const months = ["01", "02", "03", "04", "05", "07", "08", "09", "10", "11", "12"];
    const data = months.map((m, i) => ({ d: `2024-${m}-01`, v: 10 + i * 3 }));
    await mount(page, "tb", { type: "bar", x: "d", y: "v", data });
    const bar = page.locator("#tb [data-maya=mark]").nth(5); // July, after the gap
    const { x, y } = await center(bar);
    await page.mouse.move(x - 20, y);
    await page.mouse.move(x, y);
    const band = page.locator("#tb [data-maya=band][data-on]");
    await expect(band).toBeAttached();
    await settle(page);
    const bb = (await band.boundingBox())!;
    expect(Math.abs(bb.x + bb.width / 2 - x)).toBeLessThanOrEqual(2);
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
    await expect(page.locator("#treemap nav.maya-crumbs")).toBeVisible();
    await expect.poll(async () => (await view(page, "treemap")).drill?.length).toBe(1);
    await ctx.close();
  });
});

test.describe("tooltip clamp", () => {
  test("stays inside a narrow viewport at the right edge", async ({
    browser,
    browserName,
    baseURL,
  }) => {
    test.skip(browserName !== "chromium", "chromium only");
    const ctx = await browser.newContext({
      baseURL: baseURL!,
      viewport: { width: 360, height: 700 },
    });
    const page = await ctx.newPage();
    await open(page);
    const bubble = page.locator("#bubble");
    await bubble.scrollIntoViewIfNeeded();
    // The mark whose centre is furthest right.
    const marks = await bubble.locator("[data-maya=mark]").all();
    let best = marks[0]!,
      bx = -1;
    for (const m of marks) {
      const b = await m.boundingBox();
      if (b && b.x + b.width / 2 > bx) ((bx = b.x + b.width / 2), (best = m));
    }
    const { x, y } = await center(best);
    await page.mouse.move(x, y);
    await expect(page.locator("#bubble .maya-tip.maya-open")).toBeVisible();
    const r = await page.locator("#bubble .maya-tip").evaluate((e) => {
      const b = e.getBoundingClientRect();
      return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: innerWidth, h: innerHeight };
    });
    expect(r.l).toBeGreaterThanOrEqual(0);
    expect(r.r).toBeLessThanOrEqual(r.w);
    expect(r.t).toBeGreaterThanOrEqual(0);
    expect(r.b).toBeLessThanOrEqual(r.h);
    await ctx.close();
  });
});

test.describe("frame playback", () => {
  test("Play steps from the first frame to the last and stops", async ({ page }) => {
    await open(page);
    await page.evaluate((spec) => {
      const el = document.createElement("maya-chart") as any;
      el.id = "frames";
      el.style.cssText = "display:block;width:640px;height:320px";
      document.body.prepend(el);
      el.spec = spec;
    }, FRAME);
    const title = page.locator("#frames .maya-title");
    const play = page.locator("#frames .maya-play");
    await expect(title).toContainText("2023");
    await play.click();
    await expect(play).toHaveText("Pause");
    await expect(title).toContainText("2021");
    await expect(title).toContainText("2023", { timeout: 5000 });
    await expect(play).toHaveText("Play");
    expect((await view(page, "frames")).frame).toBe(2);
  });
});

test.describe("units form control", () => {
  test("a click or tap writes view.form, fires maya-view and keeps the dots", async ({ page }) => {
    await open(page);
    const keys = () =>
      page.evaluate(() =>
        [...document.getElementById("units")!.shadowRoot!.querySelectorAll("circle[data-key]")]
          .map((c) => c.getAttribute("data-key"))
          .sort(),
      );
    const before = await keys();
    const radio = page.locator("#units [data-maya=form] [role=radio]").nth(1);
    await radio.scrollIntoViewIfNeeded();
    await page.evaluate(() =>
      document
        .getElementById("units")!
        .addEventListener("maya-view", (e) => ((window as any).__form = (e as CustomEvent).detail)),
    );
    await radio.click();
    await expect.poll(() => view(page, "units")).toEqual({ form: 1 });
    expect(await page.evaluate(() => (window as any).__form)).toEqual({ form: 1 });
    expect(await keys()).toEqual(before);
  });
});
