import { test, expect, type Page, type Locator } from "@playwright/test";

const data = [
  { r: "West", s: "CA", c: "LA", v: 5 },
  { r: "West", s: "OR", c: "PDX", v: 3 },
  { r: "East", s: "NY", c: "NYC", v: 4 },
  { r: "East", s: "MA", c: "BOS", v: 2 },
];
const SPECS: Record<string, object> = {
  treemap: { type: "treemap", path: ["r", "s"], y: "v" },
  nested: { type: "treemap", path: ["r", "s", "c"], y: "v", depth: 2 },
  heatmap: { type: "heatmap", path: ["r", "s"], x: "c", y: "v" },
  table: { type: "table", path: ["r", "s"], y: "v" },
  marimekko: { type: "marimekko", path: ["r", "s"], series: "c", y: "v" },
  chord: { type: "chord", path: ["r", "s"], y: "v" },
  sankey: { type: "sankey", path: ["r", "s", "c"], y: "v" },
};

/** Gallery for the bundle, then one chart of our own so the data and options are ours. */
async function make(page: Page, name: string, extra: object = {}): Promise<Locator> {
  await page.goto("gallery.html");
  await page.evaluate(
    ([spec, rows]) => {
      document.body.replaceChildren();
      const el = document.createElement("maya-chart") as any;
      el.id = "t";
      el.style.cssText = "display:block;width:640px;height:360px";
      el.spec = { ...(spec as object), drill: true, data: rows };
      document.body.append(el);
      const log: any[] = ((window as any).__ev = []);
      for (const type of ["maya-view", "maya-select", "maya-drill-leaf"])
        el.addEventListener(type, (e: any) =>
          log.push({ type, detail: JSON.parse(JSON.stringify(e.detail)) }),
        );
    },
    [{ ...SPECS[name], ...extra }, data] as const,
  );
  const loc = page.locator("#t");
  await expect(loc.locator("[data-maya=mark]").first()).toBeAttached();
  await page.evaluate(() => (document.getElementById("t") as any).settled);
  return loc;
}

const prop = (page: Page, p: string) =>
  page.evaluate((k) => JSON.parse(JSON.stringify((document.getElementById("t") as any)[k])), p);
const log = (page: Page, type: string) =>
  page.evaluate((t) => (window as any).__ev.filter((e: any) => e.type === t), type);
const settled = (page: Page) => page.evaluate(() => (document.getElementById("t") as any).settled);

/** Centre of a box; an arc (chord group) is hit at the middle of its path, where it has ink. */
async function at(loc: Locator) {
  const arc = await loc.evaluate((e: any) => {
    if (e.localName !== "path" || !e.getPointAtLength) return null;
    const p = e.getPointAtLength(e.getTotalLength() / 4),
      m = e.getScreenCTM(),
      q = new DOMPoint(p.x, p.y).matrixTransform(m);
    return { x: q.x, y: q.y };
  });
  if (arc) return arc;
  const b = (await loc.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
async function click(page: Page, loc: Locator, clickCount = 1) {
  const { x, y } = await at(loc);
  await page.mouse.move(x, y);
  await page.mouse.click(x, y, { clickCount });
}
const mark = (root: Locator, key: string) => root.locator(`[data-maya=mark][data-key="${key}"]`);

test.describe("drill and select together", () => {
  test("click selects, double-click drills; on a leaf the pair leaves the selection as it was", async ({
    page,
  }) => {
    const t = await make(page, "treemap", { select: "multi" });
    await click(page, mark(t, "h~East"));
    await expect.poll(() => prop(page, "selected")).toEqual([{ name: "East" }]);
    await settled(page);
    expect((await prop(page, "view")).drill ?? []).toEqual([]);
    await click(page, mark(t, "h~West"), 2);
    await expect.poll(async () => (await prop(page, "view")).drill).toEqual(["West"]);
    // At the leaf level the drill gesture only reports; the first click's toggle is undone.
    await page.evaluate(() => {
      const el = document.getElementById("t") as any;
      el.selected = [{ name: "OR" }];
    });
    await settled(page);
    await click(page, mark(t, "h~West~CA"), 2);
    await expect.poll(() => log(page, "maya-drill-leaf")).toHaveLength(1);
    expect(await prop(page, "selected")).toEqual([{ name: "OR" }]);
  });

  test("Enter selects, Shift+Enter drills", async ({ page }) => {
    const t = await make(page, "treemap", { select: true });
    await t.locator(".maya-svg").focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await prop(page, "selected")).length).toBe(1);
    expect((await prop(page, "view")).drill ?? []).toEqual([]);
    await page.keyboard.press("Shift+Enter");
    await expect.poll(async () => (await prop(page, "view")).drill?.length).toBe(1);
  });

  test("a pinned tooltip offers Drill into", async ({ page }) => {
    const t = await make(page, "treemap", { select: true });
    await t.locator(".maya-svg").focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Space");
    const b = t.locator(".maya-tip button[data-drill]");
    await expect(b).toContainText("Drill into");
    await b.click();
    await expect.poll(async () => (await prop(page, "view")).drill?.length).toBe(1);
  });

  test("maya-drill-leaf fires at the deepest level only", async ({ page }) => {
    const t = await make(page, "treemap");
    await click(page, mark(t, "h~West"));
    await expect.poll(async () => (await prop(page, "view")).drill).toEqual(["West"]);
    expect(await log(page, "maya-drill-leaf")).toEqual([]);
    await settled(page);
    await click(page, mark(t, "h~West~CA"));
    await expect
      .poll(() => log(page, "maya-drill-leaf"))
      .toEqual([{ type: "maya-drill-leaf", detail: { path: ["West", "CA"] } }]);
    expect((await prop(page, "view")).drill).toEqual(["West"]);
  });
});

test.describe("drill on more types", () => {
  const keys: Record<string, string> = {
    heatmap: "West~LA",
    table: "v~West",
    marimekko: "LA~West",
    chord: "n~0~West",
    sankey: "n~0~West",
  };
  for (const [name, key] of Object.entries(keys))
    test(`${name}: click drills, the crumb pops, view and maya-view agree`, async ({ page }) => {
      const t = await make(page, name);
      await settled(page);
      await click(page, mark(t, key));
      await expect.poll(async () => (await prop(page, "view")).drill).toEqual(["West"]);
      expect((await log(page, "maya-view")).at(-1).detail.drill).toEqual(["West"]);
      const cur = t.locator(".maya-crumbs [aria-current]");
      await expect(cur).toHaveText("West");
      expect(await cur.evaluate((e) => e.localName)).toBe("span"); // current is not a control
      await settled(page);
      await t.locator(".maya-crumbs button[data-depth='0']").click();
      await expect.poll(async () => (await prop(page, "view")).drill ?? []).toEqual([]);
    });

  test("depth-2 treemap: a child under the pointer drills into its parent", async ({ page }) => {
    const t = await make(page, "nested");
    await settled(page);
    await click(page, mark(t, "h~West~CA"));
    await expect.poll(async () => (await prop(page, "view")).drill).toEqual(["West"]);
    await settled(page);
    // Deeper: a child drills into its parent only, never straight to the leaf.
    await click(page, mark(t, "h~West~CA~LA"));
    await expect.poll(async () => (await prop(page, "view")).drill).toEqual(["West", "CA"]);
  });
});
