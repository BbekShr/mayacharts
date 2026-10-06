import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";

const PAGES = [
  "index.html",
  "builder.html",
  ...(existsSync("site/gallery.html") ? ["gallery.html"] : []),
];
// `page#chart-id` -> axe rule id: a real library violation, tracked as fixme.
const FIXME: Record<string, string> = {};
test.use({ reducedMotion: "reduce" });
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function open(page: Page, path: string): Promise<number> {
  await page.goto(path);
  await expect(page.locator("maya-chart [data-maya=mark]").first()).toBeAttached();
  await page.evaluate(() => document.fonts.ready);
  // Settle: no running animations anywhere in any shadow root.
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
  return page.evaluate(() => {
    const cs = [...document.querySelectorAll("maya-chart")];
    cs.forEach((c, i) => c.setAttribute("data-axe", String(i)));
    return cs.length;
  });
}

for (const path of PAGES) {
  for (const scheme of ["light", "dark"] as const) {
    test(`axe WCAG 2.x AA: ${path} ${scheme}`, async ({ page }) => {
      test.setTimeout(180_000); // one axe run per chart; the gallery has 31 (about 60 s in Firefox)
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      const n = await open(page, path);
      expect(n).toBeGreaterThan(0);
      const bad: string[] = [];
      for (let i = 0; i < n; i++) {
        const c = page.locator(`maya-chart[data-axe="${i}"]`);
        await c.scrollIntoViewIfNeeded();
        const id = (await c.getAttribute("id")) ?? `#${i}`;
        if (FIXME[`${path}#${id}`]) continue; // test.fixme tile: see FIXME map
        const r = await new AxeBuilder({ page })
          .include(`maya-chart[data-axe="${i}"]`)
          .withTags(TAGS)
          .analyze();
        for (const v of r.violations)
          bad.push(
            `${id}: ${v.id} (${v.impact}) ${v.nodes.map((x) => x.target.join(" ")).join(" | ")}`,
          );
      }
      expect(bad).toEqual([]);
    });
  }
}

for (const path of PAGES) {
  test(`forced colors: ${path} marks keep a visible stroke`, async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "WebKit cannot emulate forced-colors");
    await page.emulateMedia({ forcedColors: "active" });
    await open(page, path);
    const r = await page.evaluate(() => {
      let marks = 0;
      const none: string[] = [];
      for (const c of document.querySelectorAll("maya-chart"))
        for (const m of c.shadowRoot!.querySelectorAll("[data-maya=mark]")) {
          marks++;
          const cs = getComputedStyle(m);
          if (cs.stroke === "none" || cs.strokeWidth === "0px") none.push(`${c.id}:${m.tagName}`);
        }
      return { marks, none: [...new Set(none)] };
    });
    expect(r.marks).toBeGreaterThan(0);
    expect(r.none).toEqual([]);
  });

  test(`RTL: ${path} y-axis labels sit left of the plot`, async ({ page }) => {
    await open(page, path);
    await page.evaluate(() => (document.documentElement.dir = "rtl"));
    await page.waitForTimeout(100);
    const bad = await page.evaluate(() => {
      const out: string[] = [];
      let seen = 0;
      for (const c of document.querySelectorAll("maya-chart")) {
        const svg = c.shadowRoot!.querySelector<SVGSVGElement>("svg[data-plot]");
        if (!svg) continue;
        const b = svg.getBoundingClientRect();
        const vb = svg.viewBox.baseVal;
        const k = b.width / (vb.width || b.width);
        const [px, , pw] = svg.getAttribute("data-plot")!.split(" ").map(Number) as number[];
        const plotLeft = b.left + px! * k;
        for (const t of svg.querySelectorAll("[data-maya=axis-y] text")) {
          // The y2 axis (bar + y2) sits right of the plot by design.
          if (Number(t.getAttribute("x")) > px! + pw!) continue;
          seen++;
          const r = t.getBoundingClientRect();
          if (r.right > plotLeft + 1)
            out.push(`${c.id}: "${t.textContent}" right ${r.right} > ${plotLeft}`);
        }
      }
      return seen ? out : ["no y-axis labels found"];
    });
    expect(bad).toEqual([]);
  });
}

test("reduced motion: no animations after update", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, "index.html");
  await page.click("#update");
  await page.waitForTimeout(150);
  const n = await page
    .locator("#live [data-maya=mark]")
    .evaluateAll((els) => els.reduce((s, e) => s + e.getAnimations().length, 0));
  expect(n).toBe(0);
});

test("keyboard: Tab reaches the chart, ArrowRight activates and announces", async ({ page }) => {
  await open(page, "index.html");
  await page.locator("#simple").scrollIntoViewIfNeeded();
  const key = "Tab";
  // Tab from the control just before the chart until the svg is focused (bounded).
  await page.locator("#theme").focus();
  let focused = false;
  for (let i = 0; i < 30 && !focused; i++) {
    await page.keyboard.press(key);
    focused = await page.evaluate(
      () => document.activeElement?.shadowRoot?.activeElement?.tagName.toLowerCase() === "svg",
    );
  }
  expect(focused).toBe(true);
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  await page.keyboard.press("ArrowRight");
  const host = page.locator("maya-chart").first();
  await expect(host.locator("[data-maya=mark][data-active]")).toHaveCount(1);
  await expect(host.locator("[data-maya=live]")).not.toBeEmpty({ timeout: 400 });
});

// compare.html has no charts: one page-level axe run per scheme.
for (const scheme of ["light", "dark"] as const) {
  test(`axe WCAG 2.x AA: compare.html ${scheme}`, async ({ page }) => {
    test.skip(!existsSync("site/compare.html"), "no compare page");
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("compare.html");
    await expect(page.locator("table").first()).toBeVisible();
    const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(r.violations.map((v) => `${v.id} (${v.impact})`)).toEqual([]);
  });
}
