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

  test("no hover mark or tooltip while a drill zoom moves the marks", async ({ page }) => {
    await open(page);
    await page.locator("#treemap").scrollIntoViewIfNeeded();
    await settle(page);
    await clickMark(page, page.locator("#treemap [data-maya=mark]").first());
    await page.waitForTimeout(250);
    await expect(page.locator("#treemap .maya-tip.maya-open")).toHaveCount(0);
    await expect(page.locator("#treemap [data-active]")).toHaveCount(0);
    await settle(page);
    const { x, y } = await center(page.locator("#treemap [data-maya=mark]").first());
    await page.mouse.move(x + 2, y + 2);
    await expect(page.locator("#treemap .maya-tip.maya-open")).toBeVisible();
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

  test("a quick drill out then in keeps keyboard focus in the chart", async ({ page }) => {
    await open(page);
    await page.locator("#treemap svg").focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await view(page, "treemap")).drill?.length).toBe(1);
    await page.waitForTimeout(900);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await view(page, "treemap")).drill?.length).toBe(1);
    await page.waitForTimeout(900);
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("treemap");
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

  test("weave: same point, empty plot space and the page outside deselect", async ({ page }) => {
    await open(page);
    const marks = page.locator("#weave [data-maya=mark]");
    const on = page.locator("#weave [data-maya=mark][data-selected]");
    await clickMark(page, marks.nth(3));
    await expect(on).toHaveCount(1);
    await clickMark(page, marks.nth(3));
    await expect(on).toHaveCount(0);
    await clickMark(page, marks.nth(3));
    await expect(on).toHaveCount(1);
    const b = await page.locator("#weave .maya-svg").boundingBox();
    // The top-left corner of the svg is margin: no mark, no control.
    await page.mouse.click(b!.x + 3, b!.y + 3);
    await expect(on).toHaveCount(0);
    await clickMark(page, marks.nth(3));
    await expect(on).toHaveCount(1);
    await page.mouse.click(2, 2);
    await expect(on).toHaveCount(0);
    expect((await events(page, "weave", "maya-select")).length).toBe(6);
  });
});

test.describe("keyboard order", () => {
  test("orbit goes clockwise by angle; constellation Down steps through the web", async ({
    page,
  }) => {
    await open(page);
    const active = (id: string) =>
      page.evaluate((i) => {
        const m = document.getElementById(i)!.shadowRoot!.querySelector("[data-active]")!;
        return [
          m.getAttribute("data-key"),
          Math.atan2(+m.getAttribute("cx")!, -m.getAttribute("cy")!),
        ] as const;
      }, id);
    await page.locator("#orbit svg.maya-svg").focus();
    const ang: number[] = [];
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("ArrowRight");
      ang.push((await active("orbit"))[1]);
    }
    expect(ang).toEqual([...ang].sort((p, q) => p - q));
    await page.locator("#constellation svg.maya-svg").focus();
    await page.keyboard.press("ArrowRight");
    const k = [(await active("constellation"))[0]];
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("ArrowDown");
      k.push((await active("constellation"))[0]);
    }
    expect(new Set(k).size).toBe(4); // the star and its three, then round again
    expect(k[4]).toBe(k[0]);
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

test("zoom keys: + narrows, - widens, Escape resets", async ({ page }) => {
  await open(page);
  const w = async () => (await view(page, "pace-lines")).window as number[] | undefined;
  const len = async () => ((await w()) ? (await w())![1]! - (await w())![0]! : Infinity);
  await page.locator("#pace-lines svg").focus();
  await page.keyboard.press("+");
  await expect.poll(len).toBeLessThan(Infinity);
  const a = await len();
  await page.keyboard.press("=");
  await expect.poll(len).toBeLessThan(a);
  const b = await len();
  await page.keyboard.press("-");
  await expect.poll(len).toBeGreaterThan(b);
  await page.keyboard.press("Escape");
  await expect.poll(w).toBeUndefined();
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

// Tooltips of the signature charts: pointer position -> tooltip text, and the anchor near the mark.
test.describe("tooltips: weave, units, boxplot", () => {
  const read = (page: Page, id: string) =>
    page.evaluate((i) => {
      const r = document.getElementById(i)!.shadowRoot!;
      const t = r.querySelector<HTMLElement>(".maya-tip")!;
      const p = r.querySelector(".maya-probe")!.getBoundingClientRect();
      const b = t.getBoundingClientRect();
      return {
        open: t.classList.contains("maya-open"),
        head: t.querySelector("b")?.textContent ?? "",
        rows: [...t.children].slice(1).map((c) => c.textContent ?? ""),
        probe: { x: p.x + p.width / 2, y: p.y + p.height / 2, h: p.height },
        box: { top: b.top, bottom: b.bottom, left: b.left, right: b.right },
        active: [...r.querySelectorAll("[data-active]")].map((e) => e.getAttribute("data-key")),
        hot: r.querySelector("[data-hot]") !== null,
      };
    }, id);
  const marks = (page: Page, id: string, sel = "[data-maya=mark]") =>
    page.evaluate(
      ([i, s]) =>
        [...document.getElementById(i!)!.shadowRoot!.querySelectorAll(s!)].map((e) => {
          const r = e.getBoundingClientRect();
          return { key: e.getAttribute("data-key")!, x: r.x + r.width / 2, y: r.y + r.height / 2 };
        }),
      [id, sel],
    );
  // Pointer (or finger) on the first `sel` of chart `id` until the tooltip shows on `key`. The point is read afresh
  // each try: late layout shifts and the scroll they cause close a tooltip, and WebKit delivers events a beat late.
  const hover = async (page: Page, id: string, sel: string, key?: string, tap = false) => {
    let p = { x: 0, y: 0 };
    await expect
      .poll(
        async () => {
          const q = await page.evaluate(
            ([i, s]) => {
              const e = document.getElementById(i!)!.shadowRoot!.querySelector(s!);
              const r = e?.getBoundingClientRect();
              return r && { x: r.x + r.width / 2, y: r.y + r.height / 2 };
            },
            [id, sel],
          );
          if (!q) return false;
          p = q;
          if (tap) await page.touchscreen.tap(q.x, q.y);
          else {
            await page.mouse.move(q.x + 1, q.y + 1);
            await page.mouse.move(q.x, q.y);
          }
          const t = await read(page, id);
          return t.open && (key === undefined || t.active.includes(key));
        },
        { message: sel, timeout: 10_000, intervals: [100, 250, 500] },
      )
      .toBe(true);
    return { ...(await read(page, id)), at: p };
  };
  const at = async (page: Page, id: string) => {
    await open(page);
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();
    await page.evaluate(() => scrollBy(0, -120)); // clear the sticky nav
    await settle(page);
  };
  const inside = (b: { top: number; bottom: number; left: number; right: number }, page: Page) => {
    const v = page.viewportSize()!;
    expect(b.top).toBeGreaterThanOrEqual(-1);
    expect(b.left).toBeGreaterThanOrEqual(-1);
    expect(b.bottom).toBeLessThanOrEqual(v.height + 1);
    expect(b.right).toBeLessThanOrEqual(v.width + 1);
  };

  test("weave: every dot lists its period's leaderboard under the dot's column", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "hover");
    await at(page, "weave");
    for (const m of await marks(page, "weave", "circle[data-maya=mark]")) {
      const t = await hover(page, "weave", `circle[data-key="${m.key}"]`, m.key);
      expect(t.active).toEqual([m.key]);
      expect(t.rows).toHaveLength(6); // all six series, ranked
      expect(Math.abs(t.probe.x - t.at.x)).toBeLessThan(2);
      inside(t.box, page);
    }
  });

  test("weave: between the dots the nearest period answers, the tooltip never closes", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "hover");
    await at(page, "weave");
    // Walk from one slot's dot to the next period's, 14 px below the line: open all the way, then on the nearer period.
    await expect
      .poll(
        async () => {
          const [a, b] = (await marks(page, "weave", "circle[data-maya=mark]")).filter(
            (_, i) => i === 0 || i === 6,
          ); // the same slot in two neighbouring periods
          const seen: boolean[] = [];
          for (const f of [0.1, 0.3, 0.45, 0.6, 0.8]) {
            await page.mouse.move(a!.x + (b!.x - a!.x) * f, a!.y + 14);
            seen.push((await read(page, "weave")).open);
          }
          const t = await read(page, "weave");
          return seen.every(Boolean) && Math.abs(t.probe.x - b!.x) < 2;
        },
        { timeout: 10_000 },
      )
      .toBe(true);
  });

  test("units: a dot shows its own row in every form, anchored on the dot", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "hover");
    await at(page, "units");
    const radios = page.locator("#units [data-maya=form] [role=radio]");
    for (let f = 0; f < 3; f++) {
      if (f) {
        await radios.nth(f).click();
        await settle(page);
        await page.mouse.move(2, 2);
      }
      const all = await marks(page, "units", "circle[data-maya=mark]");
      for (const m of all.filter((_, i) => i % Math.ceil(all.length / 30) === 0)) {
        const t = await hover(page, "units", `circle[data-key="${m.key}"]`, m.key);
        expect(t.active).toEqual([m.key]);
        expect(t.rows).toHaveLength(2); // the region, then the spend
        expect(Math.hypot(t.probe.x - t.at.x, t.probe.y - t.at.y)).toBeLessThan(3);
        inside(t.box, page);
      }
    }
  });

  test("boxplot: the whole box and whisker span answer, dots and lines included", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "hover");
    await at(page, "boxplot");
    for (const sel of ['circle[data-key^="d~"]', 'line[data-key^="ws~"]', 'line[data-key^="m~"]']) {
      const t = await hover(page, "boxplot", sel, "b~~Outerwear");
      expect(t.active[0], sel).toMatch(/^b~/);
      expect(t.rows).toHaveLength(6); // max, q3, median, q1, min, rows
    }
  });

  test("boxplot: an outlier shows its own value only, and the box clears its whiskers", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "hover");
    await at(page, "boxplot");
    await page.evaluate(() => {
      const el = document.getElementById("boxplot") as any;
      const s = structuredClone(el.spec);
      s.data.push({ family: "Tops", item: "Odd, X", margin: 0.9 });
      el.spec = s;
    });
    await settle(page);
    const o = await hover(page, "boxplot", "circle[data-maya=mark][data-last]");
    expect(o.head).toBe("Tops");
    expect(o.rows).toEqual(["Odd, X90%"]);
    const b = await hover(page, "boxplot", 'rect[data-key^="b~"][data-key$="Tops"]', "b~~Tops");
    await expect.poll(async () => (await read(page, "boxplot")).head).toBe("Tops");
    expect(b.rows).toHaveLength(6);
    // The tooltip clears the outlier it belongs with (above, or below the box when there is no room).
    await page.waitForTimeout(300); // the glide between the two tooltips
    const c = (await read(page, "boxplot")).box;
    expect(o.at.x >= c.left && o.at.x <= c.right && o.at.y >= c.top && o.at.y <= c.bottom).toBe(
      false,
    );
  });

  test("a category with many series caps its rows", async ({ page, isMobile }) => {
    test.skip(isMobile, "hover");
    await open(page);
    await page.evaluate(() => {
      const el = document.createElement("maya-chart") as any;
      el.id = "many";
      document.body.prepend(el);
      el.spec = {
        type: "bar",
        x: "c",
        y: "v",
        series: "s",
        data: Array.from({ length: 30 }, (_, i) => ({ c: "A", s: "S" + i, v: i + 1 })),
      };
    });
    await expect(page.locator("#many [data-maya=mark]").first()).toBeAttached();
    await settle(page);
    const t = await hover(page, "many", "[data-maya=mark]");
    expect(t.rows).toHaveLength(13); // 12 series rows and "+18"
    expect(t.rows.at(-1)).toBe("+18");
    inside(t.box, page);
  });

  test("touch: a tap on a unit dot, a weave dot and a box opens the right tooltip", async ({
    browser,
    browserName,
    baseURL,
  }) => {
    test.skip(browserName === "firefox", "Firefox lacks isMobile");
    const ctx = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      baseURL: baseURL!,
      viewport: { width: 390, height: 844 },
    });
    const page = await ctx.newPage();
    await open(page);
    for (const [id, sel, rows] of [
      ["units", "circle[data-maya=mark]", 2],
      ["weave", "circle[data-maya=mark]", 6],
      ["boxplot", 'rect[data-maya=mark][data-key^="b~"]', 6],
    ] as const) {
      await page.locator(`#${id}`).scrollIntoViewIfNeeded();
      await settle(page);
      const m = (await marks(page, id, sel))[3]!;
      const t = await hover(page, id, `[data-key="${m.key}"]`, m.key, true);
      expect(t.rows, id).toHaveLength(rows);
      inside(t.box, page);
      await page.touchscreen.tap(2, 2);
    }
    await ctx.close();
  });
});

test.describe("tooltip", () => {
  test("a keyboard tooltip closes when its chart scrolls away", async ({ page }) => {
    await open(page);
    await page.locator("#waffle").scrollIntoViewIfNeeded();
    await settle(page);
    await page.locator("#waffle svg.maya-svg").focus();
    await page.keyboard.press("ArrowRight");
    const tip = page.locator("#waffle .maya-tip.maya-open");
    await expect(tip).toBeVisible();
    await page.evaluate(() => scrollBy(0, 1500));
    await expect(tip).toHaveCount(0);
  });

  test("a clamped keyboard tooltip fades on scroll even while its mark is on screen", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await browser.newContext({
      baseURL: baseURL!,
      viewport: { width: 360, height: 900 },
    });
    const page = await ctx.newPage();
    await open(page);
    await page.locator("#boxplot").scrollIntoViewIfNeeded();
    await settle(page);
    await page.locator("#boxplot svg.maya-svg").focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    const tip = page.locator("#boxplot .maya-tip.maya-open");
    await expect(tip).toBeVisible();
    expect(await tip.evaluate((t) => getComputedStyle(t).position)).toBe("fixed");
    await page.evaluate(() => scrollBy(0, 120));
    await expect(tip).toHaveCount(0);
    await ctx.close();
  });
});

test.describe("update", () => {
  test("a changed description keeps the marks group and focus on a mark", async ({ page }) => {
    await open(page);
    await page.locator("#hbar").scrollIntoViewIfNeeded();
    await settle(page);
    const same = await page.evaluate(async () => {
      const el = document.getElementById("hbar") as any;
      const r = el.shadowRoot as ShadowRoot;
      const g = r.querySelector("[data-maya=marks]")!;
      const m = g.firstElementChild as HTMLElement;
      m.setAttribute("tabindex", "-1");
      m.focus();
      const d = r.querySelector("desc")?.textContent;
      el.spec = {
        ...el.spec,
        data: el.spec.data.map((x: any) => ({ ...x, sales: x.sales * 1.7 })),
      };
      await new Promise((f) => setTimeout(f, 100));
      return {
        desc: d !== r.querySelector("desc")?.textContent,
        group: r.querySelector("[data-maya=marks]") === g,
        focus: r.activeElement === m,
      };
    });
    expect(same).toEqual({ desc: true, group: true, focus: true });
  });
});

for (const type of ["line", "bar"])
  test(`maya-settled fires after the last animation, and el.settled resolves (${type})`, async ({
    page,
  }) => {
    await page.goto("gallery.html");
    const r = await page.evaluate(async (type) => {
      const el = document.createElement("maya-chart") as any;
      el.style.height = "300px";
      document.body.append(el);
      const t0 = performance.now();
      let renderAt = 0;
      let left = -1;
      let at = 0;
      el.addEventListener("maya-render", () => (renderAt = performance.now() - t0));
      el.addEventListener("maya-settled", () => {
        at = performance.now() - t0;
        left = el.shadowRoot
          .getAnimations()
          .filter(
            (a: Animation) =>
              a.effect?.getTiming().iterations !== Infinity && a.playState !== "finished",
          ).length;
      });
      el.spec = {
        type,
        x: "m",
        y: "v",
        series: "s",
        data: ["a", "b", "c", "d"].flatMap((m, i) => [
          { m, s: "S", v: i + 1 },
          { m, s: "T", v: 4 - i },
        ]),
      };
      await el.settled;
      return { renderAt, at, left };
    }, type);
    expect(r.left).toBe(0);
    expect(r.at).toBeGreaterThan(r.renderAt + 300); // the entrance had time left at maya-render
    expect(r.at).toBeLessThan(4000);
  });

test("a compact tile clamps the title to a line and hides the subtitle", async ({ page }) => {
  await open(page);
  const r = await page.evaluate(async () => {
    const out: Record<string, unknown> = {};
    for (const [k, w, h] of [
      ["small", 200, 130],
      ["big", 400, 300],
    ] as const) {
      const el = document.createElement("maya-chart") as any;
      el.style.cssText = `display:block;width:${w}px;height:${h}px`;
      el.spec = {
        type: "bar",
        x: "c",
        y: "v",
        title: "A rather long title for a tiny tile",
        subtitle: "And a subtitle that would wrap",
        data: [
          { c: "a", v: 1 },
          { c: "b", v: 2 },
        ],
      };
      document.body.prepend(el);
      await el.settled;
      const q = (s: string) => el.shadowRoot.querySelector(s) as HTMLElement;
      out[k] = {
        compact: el.hasAttribute("data-compact"),
        titleH: q(".maya-title").getBoundingClientRect().height,
        sub: getComputedStyle(q(".maya-sub")).display,
        plotH: q(".maya-box").clientHeight,
        tip: q(".maya-title").title,
      };
    }
    return out as Record<string, any>;
  });
  console.log(JSON.stringify(r));
  expect(r.small.compact).toBe(true);
  expect(r.small.sub).toBe("none");
  expect(r.small.titleH).toBeLessThan(24);
  expect(r.small.tip).toContain("tiny tile");
  expect(r.big.compact).toBe(false);
  expect(r.big.sub).not.toBe("none");
  expect(r.big.tip).toBe("");
});

test.describe("parallel brush and beeswarm peers", () => {
  const stores = Array.from({ length: 12 }, (_, i) => ({
    s: `S${i}`,
    a: i * 10,
    b: (i * 37) % 100,
    c: 100 - i * 7,
  }));
  const par = { type: "parallel", x: "s", y: ["a", "b", "c"], brush: true, data: stores };

  test("dragging an axis keeps the lines inside; a click clears it; Escape clears all", async ({
    page,
  }) => {
    await mount(page, "par", par);
    const axes = page.locator("#par [data-maya=axis][data-field]");
    // The chart is 800 px wide: on a phone the middle axis starts off screen, where mouse events go nowhere.
    const box = async (n: number) => {
      await axes.nth(n).scrollIntoViewIfNeeded();
      return (await axes.nth(n).boundingBox())!;
    };
    const drag = async (n: number, from: number, to: number) => {
      const b = await box(n);
      const x = b.x + b.width / 2;
      await page.mouse.move(x, b.y + b.height * from);
      await page.mouse.down();
      await page.mouse.move(x, b.y + (b.height * (from + to)) / 2, { steps: 4 });
      await page.mouse.move(x, b.y + b.height * to, { steps: 4 });
      await page.mouse.up();
    };
    const off = () => page.locator("#par [data-maya=line][data-off]").count();
    await drag(0, 0.1, 0.5);
    await expect.poll(async () => (await view(page, "par")).brush?.length).toBe(1);
    const [f, lo, hi] = (await view(page, "par")).brush[0];
    expect(f).toBe(await axes.nth(0).getAttribute("data-field"));
    expect(lo).toBeLessThan(hi);
    await expect.poll(off).toBeGreaterThan(0);
    const one = await off();
    await drag(1, 0.2, 0.6); // a second axis combines (AND): never fewer hidden
    await expect.poll(async () => (await view(page, "par")).brush?.length).toBe(2);
    expect(await off()).toBeGreaterThanOrEqual(one);
    const b = await box(1);
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    await expect.poll(async () => (await view(page, "par")).brush?.length).toBe(1);
    await page.keyboard.press("Escape");
    await expect.poll(async () => (await view(page, "par")).brush).toBeUndefined();
    await expect.poll(off).toBe(0);
  });

  test("keyboard and two clicks brush an axis without dragging", async ({ page }) => {
    await mount(page, "par", par);
    const ax = page.locator("#par [data-maya=axis][data-field]").first();
    await expect(ax).toHaveAttribute("role", "slider");
    await ax.focus();
    await page.keyboard.press("ArrowUp");
    await expect.poll(async () => (await view(page, "par")).brush?.length).toBe(1);
    const [, lo, hi] = (await view(page, "par")).brush[0];
    await page.keyboard.press("Shift+ArrowUp"); // grows; focus survives the repaint
    await expect
      .poll(
        async () => (await view(page, "par")).brush[0][2] - (await view(page, "par")).brush[0][1],
      )
      .toBeGreaterThan(hi - lo);
    await page.keyboard.press("Delete");
    await expect.poll(async () => (await view(page, "par")).brush).toBeUndefined();
    await ax.scrollIntoViewIfNeeded();
    const b = (await ax.boundingBox())!;
    for (const f of [0.2, 0.6]) await page.mouse.click(b.x + b.width / 2, b.y + b.height * f);
    await expect.poll(async () => (await view(page, "par")).brush?.length).toBe(1);
  });

  test("select { peers } sets view.peers from the mark and Escape clears both", async ({
    page,
  }) => {
    const data = Array.from({ length: 24 }, (_, i) => ({
      n: `P${i}`,
      f: i % 2 ? "A" : "B",
      i: `T${i % 4}`,
      p: 10 + ((i * 13) % 50),
    }));
    await mount(page, "bs", {
      type: "beeswarm",
      x: "f",
      y: "p",
      name: "n",
      select: { peers: "i" },
      data,
    });
    const m = page.locator("#bs [data-maya=mark][data-peer]").first();
    const peer = await m.getAttribute("data-peer");
    expect(peer).toMatch(/^T\d$/);
    await clickMark(page, m);
    await expect.poll(async () => (await view(page, "bs")).peers).toBe(peer);
    expect(await selected(page, "bs")).toHaveLength(1);
    await page.keyboard.press("Escape");
    await expect.poll(async () => (await view(page, "bs")).peers).toBeUndefined();
    expect(await selected(page, "bs")).toHaveLength(0);
  });
});

test.describe("stack toggle, card flip, kpi toggle and select", () => {
  const months = ["2026-07", "2026-08", "2026-09", "2026-10"].map((m, i) => ({
    m,
    s: 10 + i * 3,
    u: 5 + i,
    a: 1 + i,
    b: 2 + i,
  }));

  test("a stack radio sets view.stack and the svg's data-stack, not view.measure", async ({
    page,
  }) => {
    await mount(page, "st", {
      type: "bar",
      x: "m",
      y: ["a", "b"],
      stack: [false, true, "percent"],
      data: months,
    });
    const radios = page.locator("#st [data-maya=stack] [role=radio]");
    await expect(radios).toHaveCount(3);
    await expect(page.locator("#st svg.maya-svg")).not.toHaveAttribute("data-stack", /.+/);
    await radios.nth(2).click();
    await expect.poll(async () => (await view(page, "st")).stack).toBe(2);
    expect((await view(page, "st")).measure).toBeUndefined();
    await expect(page.locator("#st svg.maya-svg")).toHaveAttribute("data-stack", "percent");
    await radios.nth(2).focus();
    await page.keyboard.press("ArrowLeft");
    await expect.poll(async () => (await view(page, "st")).stack).toBe(1);
    // A plain stacked mode is a bare attribute.
    await expect(page.locator("#st svg.maya-svg")).toHaveAttribute("data-stack", "");
  });

  test("kpi toggle: the measure radios show one tile at a time", async ({ page }) => {
    await mount(page, "kt", { type: "kpi", x: "m", y: ["s", "u"], toggle: true, data: months });
    const radios = page.locator("#kt .maya-ctl [role=radio]");
    await expect(radios).toHaveCount(2);
    const head = page.locator("#kt [data-key^='v~']");
    await expect(head).toHaveCount(1);
    const before = await head.textContent();
    await radios.nth(1).click();
    await expect.poll(async () => (await view(page, "kt")).measure).toBe(1);
    await expect.poll(() => head.textContent()).not.toBe(before);
  });

  test("kpi select: a sparkline point selects its month; Escape clears", async ({ page }) => {
    await mount(page, "ks", { type: "kpi", x: "m", y: "s", select: true, data: months });
    const dot = page.locator("#ks [data-maya=mark][data-c]").nth(1);
    await clickMark(page, dot);
    await expect.poll(async () => (await selected(page, "ks")).length).toBe(1);
    await page.keyboard.press("Escape");
    await expect.poll(async () => (await selected(page, "ks")).length).toBe(0);
  });

  test("card flip: the button turns to the back, Escape and the button return", async ({
    page,
  }) => {
    await mount(page, "fl", {
      type: "kpi",
      x: "m",
      y: "s",
      data: months,
      back: { type: "bar", x: "m", y: "s", horizontal: true },
    });
    const flipBtn = page.locator("#fl .maya-flip");
    await expect(flipBtn).toHaveAttribute("aria-pressed", "false");
    await flipBtn.click();
    await expect.poll(async () => (await view(page, "fl")).face).toBe("back");
    await settle(page);
    await expect(page.locator("#fl .maya-flip")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#fl rect[data-maya=mark]")).toHaveCount(months.length);
    await expect(page.locator("#fl [data-key=v]")).toHaveCount(0);
    await page.locator("#fl .maya-flip").focus();
    await page.keyboard.press("Escape");
    await expect.poll(async () => (await view(page, "fl")).face).toBeUndefined();
    await settle(page);
    await expect(page.locator("#fl [data-key=v]")).toHaveCount(1);
    await page.locator("#fl .maya-flip").focus();
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await view(page, "fl")).face).toBe("back");
  });
});

test.describe("M4 drills, table paging and expand", () => {
  const fam = ["Outerwear", "Bottoms"];
  const items: Record<string, string[]> = {
    Outerwear: ["Jackets", "Vests"],
    Bottoms: ["Jeans", "Chino"],
  };
  const rows = fam.flatMap((f, i) =>
    items[f]!.map((item, j) => ({ f, item, q: "2025", sales: 10 + 7 * i + 3 * j })),
  );
  const drilled = (page: Page, id: string, n: number) =>
    expect.poll(async () => ((await view(page, id)).drill ?? []).length).toBe(n);

  for (const type of ["radial", "waffle"] as const)
    test(`${type}: click a mark drills, Back pops`, async ({ page }) => {
      await mount(page, "d", { type, path: ["f", "item"], y: "sales", drill: true, data: rows });
      // A radial arc's bounding-box centre can sit in its hole: click the mark itself.
      await page.locator("#d [data-maya=mark]").first().dispatchEvent("click");
      await drilled(page, "d", 1);
      await settle(page);
      await page.locator("#d .maya-crumbs [data-depth='0']").click();
      await drilled(page, "d", 0);
    });

  test("heatmap: a column header drills on its own axis, Escape pops columns first", async ({
    page,
  }) => {
    const data = fam.flatMap((f) =>
      items[f]!.flatMap((item) => ["W", "E"].map((r) => ({ f, item, r, sales: 5 }))),
    );
    await mount(page, "h", {
      type: "heatmap",
      y: "sales",
      xPath: ["f", "item"],
      path: ["r"],
      drill: true,
      data,
    });
    await clickMark(page, page.locator("#h [data-maya=axis-x] text[data-key]").first());
    await expect.poll(async () => (await view(page, "h")).xDrill).toEqual(["Outerwear"]);
    await expect(page.locator("#h .maya-crumbs[data-axis=x]")).toBeVisible();
    await settle(page);
    await page.locator("#h svg").focus();
    await page.keyboard.press("Escape");
    await expect.poll(async () => (await view(page, "h")).xDrill ?? []).toEqual([]);
  });

  test("area: a band's point drills the series", async ({ page }) => {
    const data = ["1", "2", "3"].flatMap((q) =>
      rows.map((r) => ({ ...r, q, sales: r.sales + +q })),
    );
    await mount(page, "a", {
      type: "area",
      x: "q",
      y: "sales",
      seriesPath: ["f", "item"],
      drill: true,
      data,
    });
    await clickMark(page, page.locator("#a [data-maya=mark]").first());
    await drilled(page, "a", 1);
  });

  const stores = Array.from({ length: 12 }, (_, i) => ({
    s: "Store " + i,
    ytd: 100 - i,
    m: "Jan",
    v: i + 1,
  }));
  const table = { type: "table", x: "s", y: "ytd", page: 4, filter: true, data: stores };

  test("table: Show more pages, the filter keeps focus and caret", async ({ page }) => {
    await mount(page, "t", table);
    await page.locator("#t [data-maya=more]").click();
    await expect.poll(async () => (await view(page, "t")).page).toBe(1);
    const input = page.locator("#t .maya-filter");
    await input.click();
    await page.keyboard.type("Store 1");
    await expect.poll(async () => (await view(page, "t")).filter).toBe("Store 1");
    await expect(input).toBeFocused();
    await page.keyboard.type("1");
    await expect.poll(async () => (await view(page, "t")).filter).toBe("Store 11");
  });

  test("table: a row opens its sub-chart, another row closes it", async ({ page }) => {
    await mount(page, "t", { ...table, expand: { type: "bar", x: "m", y: "v" } });
    const hit = (i: number) => page.locator("#t [data-maya=hit][aria-expanded]").nth(i);
    await clickMark(page, hit(0));
    await expect.poll(async () => (await view(page, "t")).expanded).toBe("Store 0");
    await expect(page.locator("#t svg[data-maya=expand]")).toHaveCount(1);
    await clickMark(page, hit(0));
    await expect.poll(async () => (await view(page, "t")).expanded).toBe("");
  });

  test("list: the first move starts open and a click moves the opening", async ({ page }) => {
    const data = ["A", "B", "C"].flatMap((m, i) => [
      { m, v: i + 1 },
      { m, e: "x", v: 1 },
      { m, e: "y", v: 2 },
    ]);
    await mount(page, "l", { type: "list", x: "m", y: "v", path: ["m", "e"], bars: true, data });
    await expect(page.locator("#l [data-maya=hit][aria-expanded=true]")).toHaveCount(1); // the first move starts open
    await page.locator("#l [data-maya=hit][data-key='m~B']").dispatchEvent("click"); // 800 px wide: its centre is off a phone screen
    await expect.poll(async () => (await view(page, "l")).expanded).toBe("B");
  });
});

test.describe("params, frame controls, facet panels (M5)", () => {
  const sr = (id: string) => `#${id}`;
  const prm = {
    type: "bar",
    x: "q",
    y: "v",
    colorBy: { target: { param: "t" }, better: "higher" },
    params: [{ id: "t", label: "Target", min: 0, max: 100, step: 5, value: 40 }],
    data: ["A", "B", "C", "D"].map((q, i) => ({ q, v: 20 + i * 18 })),
  };
  const facet = {
    type: "line",
    x: "m",
    y: "v",
    facet: "s",
    drill: true,
    facetScale: ["shared", "own"],
    data: ["North", "South", "East", "West"].flatMap((s, i) =>
      ["Jan", "Feb", "Mar", "Apr"].map((m, j) => ({ s, m, v: (i + 1) * 10 + j * (i + 2) * 3 })),
    ),
  };

  test("a params slider keeps focus while the keyboard drags it; Reset restores the value", async ({
    page,
  }) => {
    await mount(page, "p", prm);
    const input = page.locator(`${sr("p")} [data-maya=param]`);
    await input.focus();
    for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
    await expect.poll(async () => (await view(page, "p")).params).toEqual({ t: 55 });
    await expect(input).toBeFocused();
    await expect(input).toHaveValue("55");
    await page.locator(`${sr("p")} [data-maya=params-reset]`).focus(); // a real click moves focus off the slider
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await view(page, "p")).params).toBeUndefined();
    await expect(input).toHaveValue("40");
  });

  test("the frame slider and tabs set view.frame; the tabs are a radiogroup", async ({ page }) => {
    const data = ["2021", "2022", "2023"].flatMap((yr, i) => [
      { yr, k: "A", v: i + 1 },
      { yr, k: "B", v: 3 },
    ]);
    await mount(page, "f", {
      type: "bar",
      x: "k",
      y: "v",
      frame: "yr",
      frameControl: "both",
      data,
    });
    const sl = page.locator("#f input[data-maya=frame]");
    await sl.focus();
    await page.keyboard.press("Home");
    await expect.poll(async () => (await view(page, "f")).frame).toBe(0);
    await expect(sl).toBeFocused();
    await page.evaluate(() => {
      const el = document.getElementById("f") as any;
      el.spec = { ...el.spec, frameControl: "tabs" };
    });
    const tabs = page.locator("#f [data-maya=frame] [role=radio]");
    await expect(tabs).toHaveCount(3);
    await tabs.nth(1).dispatchEvent("click");
    await expect.poll(async () => (await view(page, "f")).frame).toBe(1);
    await expect(tabs.nth(1)).toHaveAttribute("aria-checked", "true");
  });

  test("facet: panels, a shared crosshair, Tab between panels, drill and back", async ({
    page,
    isMobile,
  }) => {
    await mount(page, "x", facet);
    const panels = page.locator("#x svg[data-maya=panel]");
    await expect(panels).toHaveCount(4);
    if (!isMobile) {
      const b = (await panels.first().boundingBox())!;
      await page.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.5);
      await expect(page.locator("#x [data-maya=cross][data-on]")).toHaveCount(4);
    }
    // Arrow keys stay in the focused panel; Enter opens it.
    await panels.nth(2).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#x [data-active]")).toHaveCount(1);
    expect(await panels.nth(2).locator("[data-active]").count()).toBe(1);
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await view(page, "x")).drill).toEqual(["East"]);
    await expect(panels).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect.poll(async () => (await view(page, "x")).drill ?? []).toEqual([]);
    await expect(panels).toHaveCount(4);
    // A click on a panel's empty area (not a hit target: it lands on the root svg) opens it too.
    if (!isMobile) {
      const b = (await panels.nth(1).boundingBox())!;
      await page.mouse.click(b.x + 4, b.y + b.height - 4);
      await expect.poll(async () => (await view(page, "x")).drill).toEqual(["South"]);
      await page.keyboard.press("Escape");
      await expect(panels).toHaveCount(4);
    }
    // The scale radios.
    await page.locator("#x [data-maya=facetScale] [role=radio]").nth(1).dispatchEvent("click");
    await expect.poll(async () => (await view(page, "x")).facetScale).toBe("own");
  });
});
