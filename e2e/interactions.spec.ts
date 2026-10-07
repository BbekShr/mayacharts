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
