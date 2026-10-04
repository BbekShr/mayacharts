import { test, expect, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { renderShell, type ChartSpec } from "../src/index.ts";

const ELEMENT = "dist/element.js";
test.skip(({ browserName }) => browserName !== "chromium", "Trusted Types is Chromium-only");
test.skip(!existsSync(ELEMENT), "dist/element.js missing: run `npm run build` first");

const CSP =
  "default-src 'self'; script-src 'self' 'nonce-abc'; style-src 'self' 'nonce-abc'; require-trusted-types-for 'script'; trusted-types mayacharts";
const ORIGIN = "https://csp.test";

const spec: ChartSpec = {
  type: "bar",
  title: "Sales",
  x: "q",
  y: "v",
  series: "g",
  legend: true,
  data: ["Q1", "Q2", "Q3"].flatMap((q, i) => [
    { q, g: "A", v: 10 + i * 5 },
    { q, g: "B", v: 20 - i * 3 },
  ]),
};

const elementPage = `<!doctype html><meta charset=utf-8><body>
<style nonce=abc>maya-chart,#host{display:block;height:300px}</style>
<maya-chart id=c></maya-chart>
<script type=module src="/element.js"></script>
<script type=module nonce=abc>
  import "/element.js";
  document.getElementById("c").spec = ${JSON.stringify(spec)};
</script></body>`;

const shellPage = `<!doctype html><meta charset=utf-8><body>
<style nonce=abc>maya-chart,#host{display:block;height:300px}</style>
<div id=host>${renderShell(spec, { nonce: "abc" })}</div>
<script type=module src="/element.js"></script></body>`;

async function setup(page: Page, path: string): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as { __v: string[] }).__v = [];
    document.addEventListener("securitypolicyviolation", (e) =>
      (window as unknown as { __v: string[] }).__v.push(
        `${e.violatedDirective}: ${e.blockedURI} ${e.sample}`,
      ),
    );
  });
  await page.route(`${ORIGIN}/**`, (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === "/element.js")
      return route.fulfill({
        body: readFileSync(ELEMENT),
        contentType: "text/javascript",
        headers: { "Content-Security-Policy": CSP },
      });
    return route.fulfill({
      body: p === "/shell" ? shellPage : elementPage,
      contentType: "text/html",
      headers: { "Content-Security-Policy": CSP },
    });
  });
  await page.goto(`${ORIGIN}${path}`);
}

for (const [name, path] of [
  ["el.spec", "/el"],
  ["renderShell with nonce", "/shell"],
] as const) {
  test(`CSP + Trusted Types: ${name}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await setup(page, path);
    const marks = page.locator("maya-chart [data-maya=mark]");
    await expect.poll(() => marks.count()).toBeGreaterThan(0);
    // Let the entrance finish so the mark's box is final before hovering it.
    await page.waitForFunction(() =>
      [...document.querySelectorAll("maya-chart")].every(
        (h) => h.shadowRoot!.getAnimations().length === 0,
      ),
    );

    // Interact: hover a mark, toggle a legend entry, keyboard.
    const b = (await marks.nth(2).boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.move(b.x + b.width / 2 + 1, b.y + b.height / 2 + 1);
    await expect(page.locator("maya-chart .maya-tip")).toBeVisible();
    const btn = page.locator("maya-chart [data-maya=legend] button").first();
    await btn.click();
    await expect(btn).toHaveAttribute("aria-pressed", "false");
    await page.locator("maya-chart svg").focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(400);
    expect(await marks.count()).toBeGreaterThan(0);

    const styled = await page.evaluate(() =>
      [...document.querySelectorAll("maya-chart")].flatMap((h) =>
        [...h.shadowRoot!.querySelectorAll("[style]")].map(
          (e) =>
            `${e.tagName.toLowerCase()}.${e.getAttribute("class") ?? ""}[${e.getAttribute("data-maya") ?? ""}]`,
        ),
      ),
    );
    // CSSOM writes: tooltip probe and card, crosshair, hover band, bloom origin of the marks group.
    const allowed = /maya-probe|\[cross\]|maya-tip|\[band\]|\[marks\]/;
    expect(
      styled.filter((s) => !allowed.test(s)),
      "unexpected [style] elements",
    ).toEqual([]);

    const v = await page.evaluate(() => (window as unknown as { __v: string[] }).__v);
    expect(v).toEqual([]);
    expect(errors).toEqual([]);
  });
}
