import { test, expect, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { SPECS } from "./specs.ts";

const G = "dist/maya.global.js";
test.skip(!existsSync(G), "dist/maya.global.js missing: run `npm run build` first");

const mount = (page: Page, specs: Record<string, object>) =>
  page.evaluate(async (all) => {
    const out: Record<string, { marks: number; err: number }> = {};
    for (const [type, spec] of Object.entries(all)) {
      const el = document.createElement("maya-chart") as HTMLElement & { spec: unknown };
      el.style.cssText = "display:block;width:640px;height:320px";
      el.id = type;
      document.body.append(el);
      el.spec = spec;
      const s = el.shadowRoot!;
      const count = () => ({
        marks: s.querySelectorAll("[data-maya=mark]").length,
        err: s.querySelectorAll(".maya-err").length,
      });
      for (let i = 0; i < 100 && !count().marks && !count().err; i++)
        await new Promise((r) => setTimeout(r, 20));
      out[type] = count();
    }
    return out;
  }, specs);

test("A. script tag: all 10 types render, maya.render + version", async ({ page }) => {
  await page.setContent("<!doctype html><body></body>");
  await page.addScriptTag({ path: G });
  const res = await mount(page, SPECS);
  for (const t of Object.keys(SPECS)) {
    expect(res[t]!.marks, t).toBeGreaterThan(0);
    expect(res[t]!.err, t).toBe(0);
  }
  const r = await page.evaluate(
    (s) => ({
      svg: (globalThis as any).maya.render(s) as string,
      v: typeof (globalThis as any).maya.version,
    }),
    SPECS.bar,
  );
  expect(r.svg.startsWith("<svg")).toBe(true);
  expect(r.v).toBe("string");
});

test("B. eval-permitting host: new Function(src)", async ({ page }) => {
  await page.setContent("<!doctype html><body></body>");
  await page.evaluate((src) => new Function(src)(), readFileSync(G, "utf8"));
  const three = { bar: SPECS.bar!, treemap: SPECS.treemap!, hexmap: SPECS.hexmap! };
  const res = await mount(page, three);
  for (const t of Object.keys(three)) {
    expect(res[t]!.marks, t).toBeGreaterThan(0);
    expect(res[t]!.err, t).toBe(0);
  }
  expect(await page.evaluate(() => typeof (globalThis as any).maya.version)).toBe("string");
});

test.describe("types", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "baselines are Chromium only");
  for (const type of ["treemap", "sunburst", "sankey", "hexmap", "waterfall", "heatmap"]) {
    test(`${type} light`, async ({ page }) => {
      await page.setViewportSize({ width: 700, height: 400 });
      await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
      await page.setContent("<!doctype html><body style='margin:0;background:#fff'></body>");
      await page.addScriptTag({ path: G });
      await mount(page, { [type]: SPECS[type]! });
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator(`#${type}`)).toHaveScreenshot(`${type}.png`);
    });
  }
});
