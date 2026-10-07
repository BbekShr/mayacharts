import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";

const G = "dist/maya.global.js";

const state = (page: Page) =>
  page.evaluate(() => {
    const s = document.getElementById("chart")!.shadowRoot!;
    return {
      marks: s.querySelectorAll("[data-maya=mark]").length,
      err: s.querySelector(".maya-err")?.textContent ?? "",
    };
  });
const spec = (page: Page) =>
  page.evaluate(() => (window as unknown as { builderSpec: () => unknown }).builderSpec());
const pick = (page: Page, type: string) =>
  page.locator(`input[name=type][value=${type}]`).check({ force: true });
const types = (page: Page) =>
  page
    .locator("input[name=type]")
    .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
const drawn = async (page: Page) => {
  await expect.poll(async () => (await state(page)).marks).toBeGreaterThan(0);
  expect((await state(page)).err).toBe("");
};
// Sets the textarea like a paste does. Playwright's fill() types a 10,000-line string in about 20 s.
const put = (page: Page, text: string) =>
  page.locator("#paste").evaluate((a, v) => {
    (a as HTMLTextAreaElement).value = v;
    a.dispatchEvent(new Event("input", { bubbles: true }));
  }, text);
const myData = async (page: Page, text: string) => {
  await page.locator("input[name=source][value=mine]").check({ force: true });
  await put(page, text);
};

test.beforeEach(async ({ page }) => {
  await page.goto("builder.html");
  await drawn(page);
});

for (const scheme of ["light", "dark"] as const)
  test(`every chart type draws its sample (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const all = await types(page);
    expect(all.length).toBe(26);
    for (const t of all) {
      await pick(page, t);
      await expect.poll(async () => ((await spec(page)) as { type: string }).type).toBe(t);
      await drawn(page);
      await expect(page.locator("#chart-err")).toBeHidden();
    }
  });

test("pasted CSV maps to fields and draws; a broken mapping links its error", async ({ page }) => {
  await myData(page, "Region,Sales,Units\nNorth,120,4\nSouth,90,7\nWest,60,2\n");
  await expect(page.locator("#meter")).toHaveText(/3 rows, 3 columns/);
  await expect(page.locator("#f-x")).toHaveValue("Region");
  await expect(page.locator("#cols li")).toHaveCount(3);
  await drawn(page);
  expect(await spec(page)).toMatchObject({ type: "bar", x: "Region", y: "Sales" });
  expect((await spec(page)) as object).not.toHaveProperty("title"); // no sample title carried over

  // Unticking the only value leaves no y: the element's error links to its explanation.
  await page.getByRole("checkbox", { name: "Sales" }).uncheck();
  await expect(page.locator("#chart-err a")).toHaveAttribute("href", "./errors.html#missing-field");
  await expect(page.locator('.field.bad[data-key="y"]')).toHaveCount(1);
  await page.getByRole("checkbox", { name: "Units" }).check();
  await drawn(page);
  await expect(page.locator("#chart-err")).toBeHidden();
  await expect(page.locator(".field.bad")).toHaveCount(0);

  // Switching type keeps the pasted data and guesses fields for the new type.
  await pick(page, "line");
  await drawn(page);
  expect(await spec(page)).toMatchObject({ type: "line", x: "Region" });
});

test("options that cannot work are hidden, clashing ones disabled with the reason", async ({
  page,
}) => {
  await expect(page.locator('.field[data-key="drill"]')).toBeHidden(); // bar has no Levels here
  await pick(page, "treemap");
  await expect(page.locator("#o-drill")).toBeEnabled();
  await page.locator("#o-drill").check();
  await expect(page.locator("#o-select")).toBeDisabled();
  await expect(page.locator("#o-select-why")).toHaveText(
    '"Select" cannot be combined with "Drill".',
  );
  await page.locator("#o-drill").uncheck();
  await expect(page.locator("#o-select")).toBeEnabled();
  await expect(page.locator("#o-select-why")).toBeHidden();
  await pick(page, "bar"); // text categories cannot be a time axis
  await expect(page.locator('#o-xType option[value="time"]')).toBeDisabled();
  await pick(page, "line"); // ISO months can
  await expect(page.locator('#o-xType option[value="time"]')).toBeEnabled();
  await drawn(page);
});

test("a broken mapping explains itself over the preview and can be undone", async ({ page }) => {
  await pick(page, "dumbbell");
  await myData(page, "State,Sales\nCA,1\nTX,2\n");
  const problem = page.locator("#chart-err");
  await expect(problem.locator("strong")).toHaveText('"Split by" is required but missing.');
  await expect(problem).toContainText('Choose a column for "Split by" under Fields.');
  await expect(page.locator('.field.bad[data-key="series"]')).toHaveCount(1);
  await expect(page.locator("#code-warn")).toBeVisible();
  await problem.getByRole("button", { name: "Undo last change" }).click();
  await drawn(page);
  await expect(problem).toBeHidden();
  await expect(page.locator("#code-warn")).toBeHidden();
  await expect(page.locator("#paste-box")).toBeHidden(); // back on the sample it came from
});

test("Re-roll changes the sample numbers and redraws; it is not offered for pasted data", async ({
  page,
}) => {
  for (const t of ["bar", "treemap", "hexmap"]) {
    await pick(page, t);
    await drawn(page);
    const before = (await spec(page)) as { data: object[] };
    await page.getByRole("button", { name: "Re-roll data" }).click();
    const after = (await spec(page)) as { data: object[]; type: string };
    expect(after.type).toBe(t);
    expect(after.data).toHaveLength(before.data.length);
    expect(after.data).not.toEqual(before.data);
    await drawn(page);
  }
  await myData(page, "Region,Sales\nNorth,1\n");
  await expect(page.getByRole("button", { name: "Re-roll data" })).toBeHidden();
  await page.locator("input[name=source][value=sample]").check({ force: true });
  await expect(page.getByRole("button", { name: "Re-roll data" })).toBeVisible();
});

test("an i button by each control explains it; the controls themselves stay quiet", async ({
  page,
}) => {
  const tip = page.locator("#tip");
  await page.locator('.field[data-key="select"] label').hover();
  await page.waitForTimeout(300);
  await expect(tip).toBeHidden(); // hovering the control itself shows nothing

  const about = page.getByRole("button", { name: "About Select" });
  await about.hover();
  await expect(tip).toBeVisible();
  await expect(tip).toContainText("highlights it and fades the rest");
  // Pointing at the tooltip keeps it open, though clicks pass through it.
  const box = (await tip.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
  await page.waitForTimeout(400);
  await expect(tip).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tip).toBeHidden();

  await page.getByRole("button", { name: "About Legend" }).focus();
  await expect(tip).toContainText("colour key");
  await expect(page.locator("#o-legend")).toHaveAccessibleDescription(/colour key/);
  await page.locator("#o-legend").focus();
  await expect(tip).toBeHidden();

  await page.getByRole("button", { name: "About Value" }).click();
  await expect(tip).toContainText("The number to plot");

  await pick(page, "sankey");
  await expect(page.locator("#type-help")).toHaveText(
    "Flows between groups, with band widths sized by value.",
  );
});

test("each number field gets its own format", async ({ page }) => {
  await pick(page, "scatter");
  await page.locator("#fmt-Price").selectOption("currency");
  await expect
    .poll(async () => ((await spec(page)) as { format: unknown }).format)
    .toEqual({
      Price: "currency",
    });
  await drawn(page);
  await expect
    .poll(() => page.evaluate(() => document.getElementById("chart")!.shadowRoot!.textContent))
    .toContain("$50");
  await page.locator("#fmt-Units").selectOption("compact");
  expect(((await spec(page)) as { format: unknown }).format).toEqual({
    Price: "currency",
    Units: "compact",
  });
  await page.locator("#fmt-Price").selectOption("");
  expect(((await spec(page)) as { format: unknown }).format).toEqual({ Units: "compact" });
});

test("the category gets a format too: date styles for dates, words around text", async ({
  page,
}) => {
  const text = () => page.evaluate(() => document.getElementById("chart")!.shadowRoot!.textContent);
  await pick(page, "line");
  await expect(page.locator(".formats .field").first()).toContainText("Month");
  await page.locator("#fmt-Month").selectOption("year");
  await drawn(page);
  expect(((await spec(page)) as { format: unknown }).format).toEqual({
    Month: "year",
    Sales: "compact",
  });

  await pick(page, "bar");
  await page.locator("#fmt-Family").fill("Line: ");
  await page.locator("#fmt-Family").press("Tab");
  await expect(page.locator("#fmt-Family-after")).toBeFocused(); // typing never loses focus
  await expect.poll(text).toContain("Line: Outerwear");
  expect(((await spec(page)) as { format: unknown }).format).toEqual({
    Family: "Line: {value}",
    Sales: "compact",
  });
});

test("paste limits: over each limit nothing changes, at each limit it works", async ({ page }) => {
  await myData(page, "Region,Sales\nNorth,1\nSouth,2\n");
  await drawn(page);
  const before = JSON.stringify(await spec(page));
  const err = page.locator("#paste-err");
  const over = async (text: string, msg: RegExp) => {
    await put(page, text);
    await expect(err).toHaveText(msg);
    await expect(page.locator("#paste")).toHaveAttribute("aria-invalid", "true");
    expect(JSON.stringify(await spec(page))).toBe(before);
    await drawn(page);
  };
  await over("v\n" + "x".repeat(1_000_001), /takes up to 1,000 KB/);
  await over("v\n" + "1\n".repeat(10001), /10,001 rows/);
  const cols = (n: number) =>
    Array.from({ length: n }, (_, i) => `c${i}`).join(",") + "\n" + Array(n).fill(1).join(",");
  await over(cols(51), /51 columns/);

  await put(page, "v\n" + "1\n".repeat(10000));
  await expect(err).toBeHidden();
  await expect(page.locator("#meter")).toHaveText(/10,000 rows/);
  await put(page, cols(50));
  await expect(err).toBeHidden();
  await expect(page.locator("#meter")).toHaveText(/1 rows, 50 columns/);
});

test("code tabs follow the arrow keys and the JSON tab is the previewed spec", async ({ page }) => {
  await page.getByRole("tab", { name: "HTML" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "ThoughtSpot" })).toBeFocused();
  await expect(page.getByRole("tab", { name: "ThoughtSpot" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.keyboard.press("End");
  await expect(page.getByRole("tab", { name: "Node" })).toBeFocused();
  await page.getByRole("tab", { name: "JSON" }).click();
  const code = await page.locator("#panel code").textContent();
  expect(JSON.parse(code!)).toEqual(await spec(page));
});

test("the HTML snippet runs on its own page for every type", async ({ page, browser }) => {
  test.skip(!existsSync(G), "dist/maya.global.js missing: run `npm run build` first");
  const other = await browser.newPage();
  await other.route("https://cdn.jsdelivr.net/npm/mayacharts@*/dist/maya.global.js", (r) =>
    r.fulfill({ body: readFileSync(G, "utf8"), contentType: "text/javascript" }),
  );
  for (const t of await types(page)) {
    await pick(page, t);
    await expect.poll(async () => ((await spec(page)) as { type: string }).type).toBe(t);
    const html = await page.locator("#panel code").textContent();
    await other.setContent(`<!doctype html><body>${html}</body>`);
    await expect
      .poll(() =>
        other.evaluate(
          () =>
            document.getElementById("chart")?.shadowRoot?.querySelectorAll("[data-maya=mark]")
              .length ?? 0,
        ),
      )
      .toBeGreaterThan(0);
    expect(
      await other.evaluate(() =>
        document.getElementById("chart")!.shadowRoot!.querySelector(".maya-err"),
      ),
      t,
    ).toBeNull();
  }
  await other.close();
});

test("the ThoughtSpot files run against a stub viz for every type", async ({ page, browser }) => {
  test.skip(!existsSync(G), "dist/maya.global.js missing: run `npm run build` first");
  await page.getByRole("tab", { name: "ThoughtSpot" }).click();
  for (const t of await types(page)) {
    await pick(page, t);
    await expect.poll(async () => ((await spec(page)) as { type: string }).type).toBe(t);
    const [html, css, js] = await page.locator("#panel code").allTextContents();
    // Muze Studio hands the search as a DataModel: getData() is { schema, data: row arrays }.
    const { data } = (await spec(page)) as { data: Record<string, unknown>[] };
    const names = Object.keys(data[0]!);
    const search = {
      schema: names.map((name) => ({ name })),
      data: data.map((r) => names.map((n) => ({ v: r[n] }))),
    };
    const tile = await browser.newPage(); // a fresh page per tile, as ThoughtSpot runs them
    await tile.route("https://cdn.jsdelivr.net/npm/mayacharts@*/dist/maya.global.js", (r) =>
      r.fulfill({ body: readFileSync(G, "utf8"), contentType: "text/javascript" }),
    );
    await tile.setContent(`<!doctype html><style>${css}</style><body>${html}</body>`);
    await tile.evaluate((search) => {
      (window as any).completed = 0;
      (window as any).viz = {
        getDataFromSearchQuery: () => ({ getData: () => search }),
        events: { emitRenderCompletedEvent: () => (window as any).completed++ },
      };
    }, search);
    await tile.addScriptTag({ content: js! });
    await expect.poll(() => tile.evaluate(() => (window as any).completed), { message: t }).toBe(1);
    await expect
      .poll(
        () =>
          tile.evaluate(
            () =>
              document.getElementById("chart")!.shadowRoot!.querySelectorAll("[data-maya=mark]")
                .length,
          ),
        { message: t },
      )
      .toBeGreaterThan(0);
    expect(
      await tile.evaluate(
        () => !!document.getElementById("chart")!.shadowRoot!.querySelector(".maya-err"),
      ),
      t,
    ).toBe(false);
    await tile.close();
  }
});

test("Copy puts the file on the clipboard", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "clipboard permissions are a chromium feature");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy chart.html" }).click();
  await expect(page.locator("#live")).toHaveText("Copied chart.html");
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toBe(await page.locator("#panel code").textContent());
});

test("no horizontal scroll at 375 px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await myData(page, "Region,Sales\nNorth,1\n");
  await drawn(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});

for (const scheme of ["light", "dark"] as const)
  test(`axe WCAG 2.2 AA on the builder controls (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await myData(page, "Region,Sales\nNorth,1\n");
    await page.locator("input[name=source][value=sample]").check({ force: true });
    await pick(page, "treemap"); // path levels
    await drawn(page);
    const r = await new AxeBuilder({ page })
      .exclude("maya-chart") // charts are covered by a11y.spec.ts
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" | ")}`)).toEqual(
      [],
    );
  });

for (const saved of ["light", "dark"] as const)
  test(`a saved ${saved} theme is in place before first paint on every page`, async ({ page }) => {
    // Record the page's colour scheme the moment <body> is parsed, before module scripts run.
    await page.addInitScript((os) => {
      new MutationObserver((_, obs) => {
        if (!document.body) return;
        (window as any).firstScheme = getComputedStyle(document.documentElement).colorScheme;
        obs.disconnect();
      }).observe(document, { childList: true, subtree: true });
      void os;
    }, saved);
    await page.emulateMedia({ colorScheme: saved === "light" ? "dark" : "light" });
    await page.evaluate((m) => localStorage.setItem("maya-theme", m), saved);
    for (const path of ["index.html", "builder.html", "gallery.html", "compare.html"]) {
      await page.goto(path);
      expect(await page.evaluate(() => (window as any).firstScheme), path).toBe(saved);
    }
  });
