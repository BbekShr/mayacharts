import { test, expect, type Page } from "@playwright/test";

// 0.9 signature marks (units, orbit, constellation) and the bar `was` ghosts, on the gallery page.

const open = async (page: Page, id: string) => {
  await page.goto("gallery.html");
  const tile = page.locator(`#${id}`);
  await expect(tile.locator("[data-maya=mark]").first()).toBeAttached();
  await tile.scrollIntoViewIfNeeded();
  return tile;
};
const view = (page: Page, id: string) =>
  page.evaluate((i) => JSON.parse(JSON.stringify((document.getElementById(i) as any).view)), id);
/** Running animations on the svg's descendants (the infinite orbit rotation is not counted). */
const flying = (page: Page, id: string) =>
  page.evaluate(
    (i) =>
      document
        .getElementById(i)!
        .shadowRoot!.querySelector("svg")!
        .getAnimations({ subtree: true })
        .filter((a) => a.effect?.getTiming().iterations !== Infinity).length,
    id,
  );
const circles = (page: Page, id: string) =>
  page.evaluate(
    (i) =>
      Object.fromEntries(
        [
          ...document
            .getElementById(i)!
            .shadowRoot!.querySelectorAll<SVGCircleElement>("circle[data-maya=mark]"),
        ].map((c) => [c.getAttribute("data-key"), [c.getAttribute("cx"), c.getAttribute("cy")]]),
      ),
    id,
  );

test.describe("units form control", () => {
  test("switching form keeps every key, moves the dots and flies them", async ({ page }) => {
    const tile = await open(page, "units");
    await page.waitForTimeout(1500); // first-paint entrance
    const before = await circles(page, "units");
    const radios = tile.locator("[data-maya=form] [role=radio]");
    await expect(radios).toHaveCount(3);
    await radios.nth(2).click();
    // The flight is under way on the next frame (the keyed FLIP: transform, not geometry).
    expect(await flying(page, "units")).toBeGreaterThan(0);
    await expect.poll(() => view(page, "units")).toEqual({ form: 2 });
    const after = await circles(page, "units");
    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
    expect(
      Object.keys(after).filter((k) => String(after[k]) !== String(before[k])).length,
    ).toBeGreaterThan(0);
    await expect(radios.nth(2)).toHaveAttribute("aria-checked", "true");
    // The measure toggle's handlers ignore this control: nothing else is written.
    expect(await view(page, "units")).not.toHaveProperty("measure");
  });

  test("arrow keys on the form control switch form and keep focus on it", async ({
    page,
    isMobile,
  }) => {
    test.skip(!!isMobile, "keyboard");
    const tile = await open(page, "units");
    const radios = tile.locator("[data-maya=form] [role=radio]");
    await radios.first().focus();
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => view(page, "units")).toEqual({ form: 1 });
    await expect(radios.nth(1)).toBeFocused();
    await page.keyboard.press("Enter"); // a button: the click re-applies the same form
    expect(await view(page, "units")).toEqual({ form: 1 });
  });
});

test.describe("orbit", () => {
  // Contract: at rest (sweep done) the planets stand still and the names show; a mouse over the
  // chart spins them and hides the names; an active planet holds the spin; leaving glides home.
  test("hover spins and hides the names, a planet pauses it, leaving glides home", async ({
    page,
    isMobile,
  }) => {
    test.skip(!!isMobile, "hover");
    const tile = await open(page, "orbit");
    const read = () =>
      page.evaluate(() => {
        const R = document.getElementById("orbit")!.shadowRoot!;
        const gs = [...R.querySelectorAll("g[data-v]")];
        return {
          spin: R.querySelector(".maya")!.hasAttribute("data-spin"),
          play: [...new Set(gs.flatMap((g) => g.getAnimations().map((a) => a.playState)))],
          turned: gs.some((g) => Math.abs(new DOMMatrix(getComputedStyle(g).transform).b) > 1e-4),
          names: +getComputedStyle(R.querySelector("g[data-up]")!).opacity,
        };
      });
    // The entrance sweep settles, then it is still and named.
    await expect
      .poll(read, { timeout: 5000 })
      .toMatchObject({ turned: false, names: 1, play: ["paused"] });
    const b = (await tile.boundingBox())!;
    await page.mouse.move(b.x + 20, b.y + 60);
    await expect.poll(read).toMatchObject({ spin: true, play: ["running"], names: 0 });
    await expect.poll(async () => (await read()).turned).toBe(true);
    await page.evaluate(() => {
      const c = document
        .getElementById("orbit")!
        .shadowRoot!.querySelector("circle[data-maya=mark]")!;
      c.dispatchEvent(
        new PointerEvent("pointerover", { bubbles: true, composed: true, pointerType: "mouse" }),
      );
    });
    await expect.poll(read).toMatchObject({ play: ["paused"] });
    await page.mouse.move(0, 0);
    await expect
      .poll(read, { timeout: 5000 })
      .toMatchObject({ spin: false, turned: false, names: 1 });
    expect((await read()).play).toEqual(["paused"]);
  });

  // Keyboard focus never spins the orbit and never hides the names: a reader steps planet by
  // planet with the names beside them, and the tooltip carries the active one.
  test("keyboard focus keeps the orbit still and named", async ({ page }) => {
    await open(page, "orbit");
    await page.locator("#orbit svg.maya-svg").focus();
    await page.keyboard.press("ArrowRight");
    const read = () =>
      page.evaluate(() => {
        const R = document.getElementById("orbit")!.shadowRoot!;
        return [
          R.querySelector(".maya")!.hasAttribute("data-spin"),
          R.querySelector("g[data-v]")!.getAnimations()[0]!.playState,
          Math.min(
            ...[...R.querySelectorAll("g[data-up]")].map((g) => +getComputedStyle(g).opacity),
          ) >= 0.4, // the others only dim behind the active one
        ];
      });
    await expect.poll(read, { timeout: 5000 }).toEqual([false, "paused", true]);
  });

  test("planets are reachable by arrows and Enter selects", async ({ page, isMobile }) => {
    test.skip(!!isMobile, "keyboard");
    await open(page, "orbit");
    const svg = page.locator("#orbit svg.maya-svg");
    await svg.focus();
    const active = () =>
      page.evaluate(() =>
        document
          .getElementById("orbit")!
          .shadowRoot!.querySelector("[data-active]")
          ?.getAttribute("data-key"),
      );
    await page.keyboard.press("ArrowRight");
    const first = await active();
    expect(first).toMatch(/^[^~]*~/);
    await page.keyboard.press("ArrowRight");
    expect(await active()).not.toBe(first);
    await page.keyboard.press("Enter");
    await expect
      .poll(() => page.evaluate(() => (document.getElementById("orbit") as any).selected.length))
      .toBe(1);
    await page.keyboard.press("Escape"); // pinned tooltip none, selection next
    await expect
      .poll(() => page.evaluate(() => (document.getElementById("orbit") as any).selected.length))
      .toBe(0);
  });
});

test.describe("constellation", () => {
  test("hovering a star lights the stars whose data-a lists it", async ({ page, isMobile }) => {
    test.skip(!!isMobile, "hover");
    const tile = await open(page, "constellation");
    const star = tile.locator("circle[data-maya=mark]").nth(3);
    const n = await star.getAttribute("data-n");
    expect(n).not.toBeNull();
    await star.scrollIntoViewIfNeeded();
    const b = (await star.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    const lit = () =>
      page.evaluate((i) => {
        const r = document.getElementById("constellation")!.shadowRoot!;
        return [
          [...r.querySelectorAll("[data-lit]")].map((e) => e.getAttribute("data-key")).sort(),
          [...r.querySelectorAll(`[data-a~="${i}"]`)].map((e) => e.getAttribute("data-key")).sort(),
        ];
      }, n);
    await expect.poll(async () => (await lit())[0]!.length).toBeGreaterThan(0);
    const [on, listed] = await lit();
    // The star itself and every star that counts it among its 3 nearest.
    const self = await star.getAttribute("data-key");
    expect(on).toEqual([...new Set([...listed!, self!])].sort());
  });

  test("the pointer finds a star within a few pixels (no hit shapes)", async ({
    page,
    isMobile,
  }) => {
    test.skip(!!isMobile, "hover");
    const tile = await open(page, "constellation");
    const b = (await tile.locator("circle[data-maya=mark]").nth(1).boundingBox())!;
    await page.mouse.move(b.x + b.width / 2 + 3, b.y + b.height / 2 + 3);
    await expect(tile.locator("[data-active]")).toHaveCount(1);
  });

  test("arrows move between stars; Enter selects", async ({ page, isMobile }) => {
    test.skip(!!isMobile, "keyboard");
    await open(page, "constellation");
    await page.locator("#constellation svg.maya-svg").focus();
    const active = () =>
      page.evaluate(() =>
        document
          .getElementById("constellation")!
          .shadowRoot!.querySelector("[data-active]")
          ?.getAttribute("data-key"),
      );
    await page.keyboard.press("ArrowRight");
    const first = await active();
    expect(first).toMatch(/^c~/);
    await page.keyboard.press("ArrowRight");
    expect(await active()).not.toBe(first);
    await page.keyboard.press("Enter");
    await expect
      .poll(() =>
        page.evaluate(() => (document.getElementById("constellation") as any).selected.length),
      )
      .toBe(1);
  });
});

/** A bar chart with a `was` field, appended to the page; resolves at its first render. */
const memory = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<{ moves: number; ghosts: number; ok: boolean; anim: number; label: boolean }>(
        (done) => {
          const el = document.createElement("maya-chart") as any;
          el.style.height = "300px";
          el.addEventListener("maya-render", () => {
            const r = el.shadowRoot;
            const g = [...r.querySelectorAll("rect[data-past]")] as SVGRectElement[];
            let ok = g.length > 0;
            let moves = 0;
            for (const ghost of g) {
              const key = ghost.getAttribute("data-key")!.slice(7);
              const bar = [...r.querySelectorAll("rect[data-key]:not([data-past])")].find(
                (b: any) => b.getAttribute("data-key") === key,
              ) as SVGRectElement;
              const a = bar.getAnimations()[0];
              const t = (a?.effect as KeyframeEffect | undefined)?.getKeyframes()[0]?.transform;
              if (!t) {
                ok = false;
                continue;
              }
              moves++;
              const m = new DOMMatrix(String(t));
              const n = (e: Element, k: string) => +e.getAttribute(k)!;
              // The first keyframe lays the bar exactly over its ghost.
              const close = (x: number, y: number) => Math.abs(x - y) < 0.6;
              ok &&=
                close(n(bar, "x") + m.e, n(ghost, "x")) &&
                close(n(bar, "y") + m.f, n(ghost, "y")) &&
                close(n(bar, "width") * m.a, n(ghost, "width")) &&
                close(n(bar, "height") * m.d, n(ghost, "height"));
            }
            done({
              moves,
              ghosts: g.length,
              ok,
              anim: g.reduce((s, e) => s + e.getAnimations().length, 0),
              label: [...r.querySelectorAll("[data-maya=labels] [data-key]")].every(
                (l: any) => l.getAnimations().length > 0,
              ),
            });
          });
          el.spec = {
            type: "bar",
            x: "k",
            y: "v",
            was: "w",
            labels: true,
            data: [
              { k: "A", v: 40, w: 25 },
              { k: "B", v: 22, w: 30 },
              { k: "C", v: 55, w: 50 },
            ],
          };
          document.body.append(el);
        },
      ),
  );

test.describe("memory first paint", () => {
  test("each bar starts at its ghost's box; ghosts and labels behave", async ({ page }) => {
    await page.goto("gallery.html");
    await expect(page.locator("#units [data-maya=mark]").first()).toBeAttached();
    const r = await memory(page);
    expect(r.ghosts).toBe(3);
    expect(r.moves).toBe(3);
    expect(r.ok).toBe(true);
    expect(r.anim).toBe(0); // ghosts do not animate
    expect(r.label).toBe(true); // labels follow their bars
  });
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("form switch is instant", async ({ page }) => {
    const tile = await open(page, "units");
    await tile.locator("[data-maya=form] [role=radio]").nth(1).click();
    await expect.poll(() => view(page, "units")).toEqual({ form: 1 });
    expect(await flying(page, "units")).toBe(0);
  });

  test("orbit does not rotate", async ({ page }) => {
    await open(page, "orbit");
    const n = await page.evaluate(
      () =>
        document
          .getElementById("orbit")!
          .shadowRoot!.querySelector("svg")!
          .getAnimations({ subtree: true }).length,
    );
    expect(n).toBe(0);
    await expect(page.locator("#orbit [data-trail]").first()).toBeAttached(); // the trail still reads
  });

  test("constellation lights neighbours without motion", async ({ page, isMobile }) => {
    test.skip(!!isMobile, "hover");
    const tile = await open(page, "constellation");
    const star = tile.locator("circle[data-maya=mark]").nth(3);
    await star.scrollIntoViewIfNeeded();
    const b = (await star.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await expect.poll(() => tile.locator("[data-lit]").count()).toBeGreaterThan(0);
    expect(await flying(page, "constellation")).toBe(0);
  });

  test("memory bars appear without growth", async ({ page }) => {
    await page.goto("gallery.html");
    await expect(page.locator("#units [data-maya=mark]").first()).toBeAttached();
    const r = await memory(page);
    expect(r.ghosts).toBe(3);
    expect(r.moves).toBe(0);
  });
});
