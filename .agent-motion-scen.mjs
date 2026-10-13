const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
const stores = ["North", "South", "East", "West"];
const rows = (k = 1) =>
  stores.flatMap((s, i) =>
    months.map((m, j) => ({
      store: s,
      month: m,
      sales: Math.round((20 + i * 7 + j * 3 + ((i * j) % 5) * 4) * k * (1 + i)),
      year: 2024,
    })),
  );
const facetBar = (extra = {}) => ({
  type: "bar",
  x: "month",
  y: "sales",
  facet: "store",
  facetScale: ["shared", "own"],
  drill: true,
  data: rows(),
  ...extra,
});
const pspec = () => ({
  type: "bar",
  x: "month",
  y: "sales",
  data: rows()
    .filter((r) => r.store === "West")
    .map((r) => ({ ...r, Kind: r.month > "L" ? "Projected" : "Actual" })),
  params: [
    { id: "price", label: "Price", min: -20, max: 40, step: 1, value: 0, suffix: "%" },
    { id: "goal", label: "Goal", min: 100, max: 300, step: 5, value: 150 },
  ],
  scale: { by: ["price"] },
  rules: [{ y: { param: "goal" }, label: "Goal" }],
  colorBy: { target: { param: "goal" } },
});
const scrub = async (c, sel, from, to, ms = 600) =>
  c.page.evaluate(
    async ([sel, from, to, ms]) => {
      const i = el.shadowRoot.querySelector(sel);
      const log = [];
      const t0 = performance.now();
      await new Promise((done) => {
        const step = () => {
          const p = Math.min(1, (performance.now() - t0) / ms);
          i.value = String(Math.round(from + (to - from) * p));
          i.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
          const R = el.shadowRoot;
          const rule = [...R.querySelectorAll(".maya-svg line")].filter(
            (l) => !l.closest("[data-maya=grid]") && !l.closest("[data-maya=cross]"),
          );
          const vis = rule
            .map(
              (l) =>
                Math.round(+l.getAttribute("y1")) +
                "@" +
                (+getComputedStyle(l).opacity * +getComputedStyle(l.parentElement).opacity).toFixed(
                  2,
                ),
            )
            .join(",");
          const bars = [...R.querySelectorAll("[data-maya=marks] > rect[data-key]")].map(
            (b) =>
              Math.round(b.getBoundingClientRect().height) +
              "/" +
              Math.round(+b.getAttribute("height")),
          );
          log.push([Math.round(performance.now() - t0), i.value, rule.length, vis, bars.join(" ")]);
          p < 1 ? requestAnimationFrame(step) : done();
        };
        requestAnimationFrame(step);
      });
      return log;
    },
    [sel, from, to, ms],
  );
export default {
  async params(c) {
    const { page } = c;
    await page.evaluate((s) => mk(s, 640, 360), pspec());
    await c.settle();
    await page.waitForTimeout(1300);
    const log = await scrub(c, "input[data-maya=param][data-id=price]", 0, 40, 700);
    await c.shot("price-mid");
    for (const l of log.filter((_, i) => i % 4 === 0))
      console.log(c.bn, "price", JSON.stringify(l));
    await page.waitForTimeout(1200);
    await c.shot("price-end");
    const log2 = await scrub(c, "input[data-maya=param][data-id=goal]", 150, 250, 700);
    await c.shot("goal-mid");
    for (const l of log2.filter((_, i) => i % 4 === 0))
      console.log(c.bn, "goal", JSON.stringify(l));
    await page.waitForTimeout(1200);
    await c.shot("goal-end");
  },
  async facetN(c) {
    const { page } = c;
    const d = rows();
    await page.evaluate((s) => mk(s, 640, 420), facetBar({ data: d }));
    await c.settle();
    await page.waitForTimeout(1300);
    const probe = () =>
      [...el.shadowRoot.querySelectorAll(".maya-svg > svg")].map((p) => [
        p.getAttribute("data-facet"),
        p.getAttribute("x"),
        p.getAttribute("y"),
        p.getAttribute("width"),
        Math.round(p.getBoundingClientRect().x),
        Math.round(p.getBoundingClientRect().y),
      ]);
    console.log(c.bn, "before", JSON.stringify(await page.evaluate(probe)));
    await c.frames(
      "remove",
      () =>
        page.evaluate(
          (s) => (el.spec = s),
          facetBar({ data: d.filter((r) => r.store !== "North") }),
        ),
      [0, 120, 270, 400],
      probe,
    );
  },
  async hover(c) {
    const { page } = c;
    for (const type of ["bar"]) {
      await page.evaluate((s) => mk(s, 900, 560), facetBar({ type }));
      await c.settle();
      await page.waitForTimeout(1200);
      const P = page.locator("maya-chart svg[data-maya=panel]");
      const p0 = await P.nth(0).boundingBox(),
        p3 = await P.nth(3).boundingBox();
      console.log(c.bn, type, "panel boxes", JSON.stringify([p0, p3]));
      const r0 = await page
        .locator("maya-chart svg[data-maya=panel] [data-maya=marks] > *")
        .nth(2)
        .boundingBox();
      if (type === "bar") await page.mouse.move(r0.x + r0.width / 2, r0.y + r0.height - 3);
      else await page.mouse.move(p0.x + p0.width * 0.45, p0.y + p0.height * 0.75);
      await page.waitForTimeout(400);
      await c.shot(type + "-hover-p0");
      const q = () =>
        page.evaluate(() => ({
          band: el.shadowRoot
            .querySelector("[data-maya=band]")
            ?.closest("svg[data-maya=panel]")
            ?.getAttribute("data-facet"),
          bandOn: el.shadowRoot.querySelector("[data-maya=band]")?.hasAttribute("data-on"),
          active: el.shadowRoot
            .querySelector("[data-active]")
            ?.closest("svg[data-maya=panel]")
            ?.getAttribute("data-facet"),
          crossOn: [...el.shadowRoot.querySelectorAll("[data-maya=cross][data-on]")].map((g) =>
            g.closest("svg[data-maya=panel]")?.getAttribute("data-facet"),
          ),
        }));
      console.log(c.bn, type, "p0", JSON.stringify(await q()));
      const r3 = await page
        .locator("maya-chart svg[data-maya=panel] [data-maya=marks] > *")
        .nth(20)
        .boundingBox();
      if (type === "bar")
        await page.mouse.move(r3.x + r3.width / 2, r3.y + r3.height - 3, { steps: 6 });
      else await page.mouse.move(p3.x + p3.width * 0.45, p3.y + p3.height * 0.75, { steps: 6 });
      await page.waitForTimeout(400);
      await c.shot(type + "-hover-p3");
      console.log(c.bn, type, "p3", JSON.stringify(await q()));
    }
  },
  async facet(c) {
    const { page } = c;
    await page.evaluate((s) => mk(s, 640, 420), facetBar());
    await page.waitForTimeout(80);
    await c.frames("intro", async () => {}, [0, 120, 270, 400]);
    await c.settle();
    // data update
    await c.frames(
      "update",
      () => page.evaluate((s) => (el.spec = s), { ...facetBar(), data: rows(1.6) }),
      [0, 120, 270, 400],
      () => boxes("svg[data-maya=panel] [data-maya=marks] > *").slice(0, 3),
    );
    await c.settle();
    // facetScale switch
    await c.frames(
      "own",
      async () => {
        await page.locator("maya-chart [data-maya=facetScale] [role=radio]").nth(1).click();
      },
      [0, 120, 270, 400],
    );
    await c.settle();
    // drill into a panel (click on the panel background)
    console.log(
      c.bn,
      "root drill attr",
      await page.evaluate(() =>
        el.shadowRoot.querySelector(".maya-svg").getAttribute("data-drill"),
      ),
    );
    const pn = page.locator("maya-chart svg[data-maya=panel] [data-maya=marks] > rect").nth(9);
    const bb = await pn.boundingBox();
    await c.frames(
      "drill",
      () => page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height - 4),
      [0, 120, 270, 400],
      () => ({
        panels: el.shadowRoot.querySelectorAll("svg[data-maya=panel]").length,
        marks: boxes(".maya-svg > [data-maya=marks] > *").slice(0, 3),
      }),
    );
    await c.settle();
    await c.frames(
      "esc",
      () => page.keyboard.press("Escape"),
      [0, 120, 270, 400],
      () => ({
        panels: el.shadowRoot.querySelectorAll("svg[data-maya=panel]").length,
        marks: boxes(".maya-svg > [data-maya=marks] > *").slice(0, 3),
      }),
    );
    await c.settle();
    // hover band across panels
    const p0 = await page.locator("maya-chart svg[data-maya=panel]").nth(0).boundingBox();
    const p3 = await page.locator("maya-chart svg[data-maya=panel]").nth(3).boundingBox();
    await page.mouse.move(p0.x + p0.width * 0.5, p0.y + p0.height * 0.6);
    await page.waitForTimeout(300);
    await c.shot("hover-p0");
    await page.mouse.move(p3.x + p3.width * 0.5, p3.y + p3.height * 0.6, { steps: 8 });
    await page.waitForTimeout(400);
    await c.shot("hover-p3");
    console.log(
      c.bn,
      "band parent facet:",
      await page.evaluate(() =>
        el.shadowRoot
          .querySelector("[data-maya=band]")
          ?.closest("svg[data-maya=panel]")
          ?.getAttribute("data-facet"),
      ),
      "active:",
      await page.evaluate(() =>
        el.shadowRoot
          .querySelector("[data-active]")
          ?.closest("svg[data-maya=panel]")
          ?.getAttribute("data-facet"),
      ),
    );
  },
};
export const extra = 1;
