import { describe, expect, it, vi } from "vitest";
import { renderParts, renderShell } from "../src/index.ts";
import { scatter } from "../src/core/marks/scatter.ts";
import { drillDepth, MayaSpecError, resolve, validateOptions } from "../src/core/validate.ts";
import type { ChartSpec, MarkCtx, RenderOptions, View } from "../src/core/types.ts";

// M5 contracts: #85 facet, #80 frame controls, trail and other, #78 params. Drawing of trails and
// line/area was ghosts is the marks' (pending); these pin what core resolves, lays out and emits.

const err = (spec: object, opts?: RenderOptions) => {
  try {
    renderParts(spec as ChartSpec, opts);
  } catch (e) {
    return e as MayaSpecError;
  }
  throw new Error("expected an error");
};
const parts = (spec: object, view?: View, size?: { width: number; height: number }) =>
  renderParts(spec as ChartSpec, { ...size, ...(view && { view }) });

const stores = ["NV", "IA", "GA", "TX"].flatMap((store, i) =>
  ["2025-01-01", "2025-04-01", "2025-07-01"].map((quarter, j) => ({
    store,
    quarter,
    sales: (4 - i) * 10 + j * (i + 1),
    lastYear: (4 - i) * 9,
  })),
);
// GA has no Q3 row: its panel still has three categories.
const wall = {
  type: "area",
  x: "quarter",
  y: "sales",
  facet: "store",
  data: stores.filter((r) => !(r.store === "GA" && r.quarter === "2025-07-01")),
};
const panels = (svg: string) => svg.split('data-maya="panel"').slice(1);

describe("#85 facet", () => {
  it("one nested panel per value, titled with its total, keys unique per panel", () => {
    const p = parts(wall);
    const ps = panels(p.svg);
    expect(ps).toHaveLength(4);
    expect(p.svg).toContain('data-facet="NV"');
    expect(p.svg).toContain('role="figure"');
    // 40 + 41 + 42 = 123
    expect(p.svg).toMatch(/<text data-facet="NV"[^>]*>NV, 123</);
    const keys = [...p.svg.matchAll(/data-key="([^"]+)"/g)].map((m) => m[1]!);
    expect(keys.some((k) => k.startsWith("NV~"))).toBe(true);
    const marks = [...p.svg.matchAll(/data-maya="mark"[^>]*data-key="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(marks).size).toBe(marks.length);
    // Every panel has the same three categories (GA's missing quarter is padded).
    for (const s of ps) expect(s).toMatch(/data-n="3"|data-t/);
    expect(p.svg).toContain("One panel per store, 4 panels");
    expect(p.legend).toBe("");
  });

  it("data-c lines up across panels for the same x", () => {
    const p = parts({ ...wall, type: "bar" });
    const at = (s: string) =>
      [...s.matchAll(/data-maya="mark"[^>]*?data-c="(\d+)"[^>]*?data-x="([^"]+)"/g)].map(
        (m) => `${m[1]}:${m[2]}`,
      );
    const [a, , c] = panels(p.svg);
    expect(at(c!).every((e) => at(a!).includes(e))).toBe(true);
  });

  it("sort orders panels by total, limit keeps the top n, categories stay in time order", () => {
    const asc = parts({ ...wall, sort: "asc", limit: 3 }).svg;
    const order = [...asc.matchAll(/<text data-facet="(\w+)"/g)].map((m) => m[1]);
    expect(order).toEqual(["GA", "IA", "NV"]);
    expect(asc).toContain("data-t");
  });

  it("shared scale gives every panel the same value domain; own fits each", () => {
    const yd = (svg: string) =>
      panels(svg).map(
        (s) => [...s.matchAll(/data-maya="axis-y">(.*?)<\/g>/g)].map((m) => m[1]).join("") || s,
      );
    const big = { width: 900, height: 600 };
    const shared = yd(parts(wall, undefined, big).svg);
    expect(new Set(shared).size).toBe(1);
    const own = yd(parts({ ...wall, facetScale: "own" }, undefined, big).svg);
    expect(new Set(own).size).toBeGreaterThan(1);
  });

  it("facetScale array adds the control; view.facetScale switches it", () => {
    const spec = { ...wall, facetScale: ["shared", "own"] };
    expect(parts(spec).controls).toContain('data-maya="facetScale"');
    expect(resolve(spec as ChartSpec).facet!.scale).toBe("shared");
    expect(resolve(spec as ChartSpec, { facetScale: "own" }).facet!.scale).toBe("own");
    expect(
      resolve({ ...wall, facetScale: "own" } as ChartSpec, { facetScale: "shared" }).facet!.scale,
    ).toBe("own");
  });

  it("small panels are sparklines; past the tile height the grid scrolls", () => {
    const many = {
      ...wall,
      data: Array.from({ length: 30 }, (_, i) => ({ store: `S${i}`, quarter: "Q1", sales: i + 1 })),
    };
    const p = parts(many, undefined, { width: 640, height: 320 });
    expect(panels(p.svg)).toHaveLength(30);
    expect(p.svg).toContain("data-scroll");
    expect(panels(p.svg)[0]).not.toContain('data-maya="axis-y"><text');
    const big = parts({ ...wall, type: "line" }, undefined, { width: 1000, height: 700 });
    expect(panels(big.svg)[0]).toContain('data-maya="axis-y"><text');
  });

  it("drill opens one panel full size with its axes and crumbs", () => {
    const spec = { ...wall, drill: true, was: "lastYear" };
    expect(drillDepth(spec as ChartSpec)).toBe(1);
    const root = parts(spec);
    expect(root.svg).toContain('data-drill="facet"');
    const p = parts(spec, { drill: ["IA"] });
    expect(p.svg).not.toContain('data-maya="panel"');
    expect(p.title).toContain("IA, ");
    expect(p.crumbs).toContain('aria-current="page">IA<');
    expect(p.legend).toContain("data-past");
  });

  it("validates", () => {
    expect(err({ ...wall, type: "scatter" }).code).toBe("option-unsupported");
    expect(err({ ...wall, facet: "nope" }).code).toBe("unknown-field");
    expect(err({ ...wall, facet: "quarter" }).path).toBe("facet");
    expect(err({ ...wall, frame: "store", facet: "quarter" }).path).toBe("frame");
    expect(err({ ...wall, zoom: true }).path).toBe("zoom");
    expect(err({ ...wall, facet: undefined, facetScale: "own" }).path).toBe("facetScale");
    expect(err({ ...wall, facetScale: ["own"] }).path).toBe("facetScale");
    expect(err(wall, { view: { facetScale: "x" as "own" } }).path).toBe("options.view.facetScale");
  });

  it("renderShell keeps the facet field", () => {
    expect(renderShell(wall as ChartSpec)).toContain('"store":"NV"');
  });
});

const race = [1, 2, 3].flatMap((q) =>
  ["A", "B", "C", "D"].map((item, i) => ({ q: `Q${q}`, item, sales: (i + 1) * q, units: q + i })),
);

describe("#80 frame controls, trail, other", () => {
  const bar = { type: "bar", x: "item", y: "sales", frame: "q", data: race };
  it("play by default; slider, both, tabs and select emit their controls", () => {
    expect(parts(bar).controls).toContain('data-maya="play"');
    const sl = parts({ ...bar, frameControl: "slider" }, { frame: 1 }).controls;
    expect(sl).toMatch(
      /<input type="range" class="maya-frame" data-maya="frame" min="0" max="2" step="1" value="1"/,
    );
    expect(sl).toContain('aria-valuetext="Q2"');
    expect(sl).not.toContain("maya-play");
    const both = parts({ ...bar, frameControl: "both" }).controls;
    expect(both).toContain("maya-play");
    expect(both).toContain('type="range"');
    const tabs = parts({ ...bar, frameControl: "tabs" }).controls;
    expect(tabs).toContain('role="radiogroup" data-maya="frame"');
    expect(tabs).toContain('aria-checked="true" data-i="2"');
    const narrow = renderParts({ ...bar, frameControl: "tabs" } as ChartSpec, { width: 280 });
    expect(narrow.controls).toContain("<select");
    const sel = parts({ ...bar, frameControl: "select" }, { frame: 0 }).controls;
    expect(sel).toContain('<option value="0" selected="">Q1</option>');
  });

  it("frameControl, frameSpeed and trail need frame; trail needs scatter and name", () => {
    expect(err({ ...bar, frame: undefined, frameControl: "slider" }).path).toBe("frameControl");
    expect(err({ ...bar, frameSpeed: 50 }).path).toBe("frameSpeed");
    expect(err({ ...bar, trail: 2 }).path).toBe("trail");
    expect(
      err({ type: "scatter", x: "units", y: "sales", frame: "q", trail: 2, data: race }).path,
    ).toBe("trail");
    expect(() => parts({ ...bar, frameSpeed: 600 })).not.toThrow();
  });

  it("trail: core hands the mark the previous n positions, a selected name its whole path", () => {
    const spy = vi.spyOn(scatter, "draw");
    const spec = {
      type: "scatter",
      x: "units",
      y: "sales",
      name: "item",
      frame: "q",
      trail: 1,
      data: race,
    };
    renderParts(spec as ChartSpec, { view: { frame: 2 } });
    let ctx = spy.mock.calls.at(-1)![0] as MarkCtx;
    expect(ctx.trails.get("A")).toEqual([{ x: 2, y: 2, frame: 1 }]);
    renderParts(spec as ChartSpec, { view: { frame: 0 }, selected: [{ name: "B" }] });
    ctx = spy.mock.calls.at(-1)![0] as MarkCtx;
    expect(ctx.trails.get("B")!.map((p) => p.frame)).toEqual([1, 2]);
    expect(ctx.trails.has("A")).toBe(false);
    renderParts(spec as ChartSpec, { width: 280, view: { frame: 2 } });
    ctx = spy.mock.calls.at(-1)![0] as MarkCtx;
    expect(ctx.trails.size).toBe(0);
    spy.mockRestore();
    expect(resolve(spec as ChartSpec).paths!.get("D")).toHaveLength(3);
  });

  it("other: false keeps each frame's top n without an Other bar", () => {
    const top = parts({ ...bar, limit: 2, other: false });
    expect(top.svg).not.toContain("data-other");
    expect(parts({ ...bar, limit: 2 }).svg).toContain("data-other");
    expect(err({ ...bar, other: false }).path).toBe("other");
  });
});

const plan = {
  type: "bar",
  x: "Month",
  y: "Sales",
  series: "Kind",
  stack: true,
  params: [
    { id: "price", label: "Price per unit", min: -20, max: 20, step: 1, value: 0, suffix: "%" },
    { id: "units", label: "Units sold", min: -20, max: 20, step: 1, value: 0, suffix: "%" },
  ],
  scale: { where: { Kind: "Projected" }, by: ["price", "units"], mode: "percent" },
  title: "Year-end {total}, {total.base} before the change",
  data: [
    { Month: "Jul", Kind: "Actual", Sales: 10 },
    { Month: "Oct", Kind: "Projected", Sales: 20 },
    { Month: "Nov", Kind: "Projected", Sales: 10 },
  ],
};

describe("#78 params", () => {
  it("scale multiplies matching rows by (1 + p/100) per param; total.base is the total without it", () => {
    expect(parts(plan).title).toContain("Year-end 40, 40 before the change");
    const p = parts(plan, { params: { price: 10, units: 10 } });
    // 10 + 30 * 1.21 = 46.3
    expect(p.title).toContain("Year-end 46.3, 40 before the change");
    expect(p.svg).toMatch(/data-y="24\.(2|19)/);
    // clamped to max
    expect(parts(plan, { params: { price: 500 } }).title).toContain("Year-end 46,");
  });

  it("controls: a range input per param and Reset; a popover under 300 px", () => {
    const c = parts(plan, { params: { price: 5 } }).controls;
    expect(c).toContain(
      '<div class="maya-params" data-maya="params" role="group" aria-label="Adjust">',
    );
    expect(c).toContain(
      '<input type="range" data-maya="param" data-id="price" min="-20" max="20" step="1" value="5" aria-label="Price per unit" aria-valuetext="5%"/>',
    );
    expect(c).toContain('data-maya="params-reset"');
    const small = renderParts(plan as ChartSpec, { width: 260 }).controls;
    expect(small).toContain('popovertarget="maya-params"');
    expect(small).toContain('id="maya-params" popover="auto"');
  });

  const risk = {
    type: "bar",
    horizontal: true,
    x: "Store",
    y: "Change",
    params: [
      {
        id: "thr",
        label: "Flag below",
        min: -0.06,
        max: 0.02,
        step: 0.005,
        value: -0.05,
        format: "percent",
      },
    ],
    colorBy: { target: { param: "thr" } },
    rules: [{ y: { param: "thr" }, label: "Flag below" }],
    title: "{count.below} stores below, {count.above} above",
    data: [
      { Store: "A", Change: -0.055 },
      { Store: "B", Change: -0.02 },
      { Store: "C", Change: 0.01 },
    ],
  };

  it("{ param } stands in for colorBy target and rules; count tokens follow it", () => {
    expect(parts(risk).title).toContain("1 stores below, 2 above");
    const p = parts(risk, { params: { thr: 0 } });
    expect(p.title).toContain("2 stores below, 1 above");
    expect(p.svg).toContain('data-tone="bad"');
    expect(resolve(risk as unknown as ChartSpec, { params: { thr: 0 } }).rules[0]!.y).toBe(0);
    expect(p.controls).toContain('aria-valuetext="0%"');
  });

  it("validates params, refs, scale and view.params", () => {
    expect(err({ ...risk, rules: [{ y: { param: "nope" } }] }).path).toBe("rules[0].y");
    expect(err({ ...risk, colorBy: { target: { param: "x" } } }).path).toBe("colorBy.target");
    expect(err({ ...risk, params: undefined }).path).toBe("colorBy.target");
    expect(err({ ...plan, scale: { by: ["nope"] } }).path).toBe("scale.by[0]");
    expect(err({ ...plan, scale: { by: ["price"], where: { Nope: 1 } } }).path).toBe(
      "scale.where.Nope",
    );
    expect(err({ ...plan, params: undefined }).path).toBe("scale");
    expect(err({ ...plan, scale: "log" }).message).toContain("yScale");
    expect(err({ ...plan, params: [{ ...plan.params[0], value: 30 }] }).path).toBe("params");
    expect(err({ ...plan, params: [plan.params[0], plan.params[0]] }).path).toBe("params");
    expect(err({ ...plan, params: [{ ...plan.params[0], format: "nope" }] }).path).toBe(
      "params[0].format",
    );
    expect(() => validateOptions({ view: { params: { price: 3 } } })).not.toThrow();
    expect(err(plan, { view: { params: { price: "3" as unknown as number } } }).path).toBe(
      "options.view.params",
    );
  });
});

describe("was on line and area", () => {
  it("validates, widens the axis and keys the legend", () => {
    const p = parts({
      type: "line",
      x: "quarter",
      y: "sales",
      was: "lastYear",
      data: stores.slice(0, 3),
    });
    expect(p.legend).toContain("data-past");
  });
});
