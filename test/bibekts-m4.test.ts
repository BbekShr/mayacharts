import { describe, expect, it } from "vitest";
import { render, renderParts } from "../src/index.ts";
import "../src/radial.ts";
import "../src/geo.ts";
import "../src/hierarchy.ts";
import "../src/flow.ts";
import { moves, shape, strips } from "../src/core/shape.ts";
import {
  drillDepth,
  MayaSpecError,
  resolve,
  validateOptions,
  validateSpec,
} from "../src/core/validate.ts";
import type { ChartSpec, View } from "../src/core/types.ts";

// M4 contracts: #81 drill on more types, #84 table, #79 list. Drawing is the marks' (pending);
// these pin what core resolves, shapes, validates and assembles.

const err = (spec: object, view?: View) => {
  try {
    renderParts(spec as ChartSpec, view && { view });
  } catch (e) {
    return e as MayaSpecError;
  }
  throw new Error("expected an error");
};
const parts = (spec: object, view?: View) => renderParts(spec as ChartSpec, view && { view });

const shop = [
  { region: "West", family: "Outerwear", itemType: "Jackets", product: "Parka", sales: 14 },
  { region: "West", family: "Outerwear", itemType: "Vests", product: "Shell", sales: 9 },
  { region: "East", family: "Bottoms", itemType: "Jeans", product: "Chino", sales: 11 },
  { region: "East", family: "Outerwear", itemType: "Jackets", product: "Cargo", sales: 6 },
];

describe("#81 drill on more types", () => {
  it("radial, waffle and waterfall take x from path; drilled levels filter rows", () => {
    for (const type of ["radial", "waffle", "waterfall"]) {
      const spec = { type, path: ["family", "itemType"], y: "sales", drill: true, data: shop };
      validateSpec(spec);
      expect(resolve(spec as ChartSpec).x).toBe("family");
      const s = resolve(spec as ChartSpec, { drill: ["Outerwear"] });
      expect([s.x, s.data.length >= 3, s.drillOn]).toEqual(["itemType", true, null]);
      expect(parts(spec).svg).toContain("data-drill");
      expect(() => parts(spec, { drill: ["Outerwear"] })).not.toThrow();
    }
  });

  it("waffle takes tint; its slots follow the path values", () => {
    const spec = {
      type: "waffle",
      path: ["family", "itemType"],
      y: "sales",
      drill: true,
      tint: true,
      data: shop,
    } as ChartSpec;
    expect([...resolve(spec).slots.keys()]).toEqual([
      "Outerwear",
      "Bottoms",
      "Jackets",
      "Vests",
      "Jeans",
    ]);
    expect(resolve(spec, { drill: ["Bottoms"] }).hue).toBe(1);
  });

  it("chord with three levels drills the target and keeps the sources", () => {
    const spec = {
      type: "chord",
      path: ["region", "family", "itemType"],
      y: "sales",
      drill: true,
      data: shop,
    } as ChartSpec;
    expect(drillDepth(spec)).toBe(1);
    expect(resolve(spec).path).toEqual(["region", "family"]);
    const s = resolve(spec, { drill: ["Outerwear", "x"] });
    expect([s.path, s.drilled, s.data.length, s.drillOn]).toEqual([
      ["region", "itemType"],
      ["Outerwear"],
      3,
      null,
    ]);
    expect(parts(spec).svg).toContain("data-drill");
    expect(parts(spec, { drill: ["Outerwear"] }).svg).not.toContain("data-drill");
    expect(err({ ...spec, path: ["region"] }).code).toBe("invalid-option");
  });

  it("marimekko without series takes it from the next path level", () => {
    const spec = {
      type: "marimekko",
      path: ["region", "family", "itemType"],
      y: "sales",
      drill: true,
      data: shop,
    } as ChartSpec;
    validateSpec(spec);
    expect(drillDepth(spec)).toBe(1);
    expect([resolve(spec).x, resolve(spec).series]).toEqual(["region", "family"]);
    const s = resolve(spec, { drill: ["West", "Outerwear"] });
    expect([s.x, s.series, s.drilled]).toEqual(["family", "itemType", ["West"]]);
    expect(() => parts(spec, { drill: ["West"] })).not.toThrow();
    expect(err({ ...spec, path: ["region"] }).code).toBe("missing-field");
  });

  it("seriesPath drills the series; one or the other with path", () => {
    const q = shop.map((r, i) => ({ ...r, q: `2025-0${(i % 2) * 3 + 1}-01` }));
    const spec = {
      type: "area",
      x: "q",
      y: "sales",
      seriesPath: ["family", "itemType"],
      stack: true,
      drill: true,
      data: q,
    } as ChartSpec;
    expect(resolve(spec).series).toBe("family");
    expect(parts(spec).svg).toContain('data-drill="series"');
    const s = resolve(spec, { drill: ["Outerwear"] });
    expect([s.series, s.data.length, s.drillOn]).toEqual(["itemType", 3, null]);
    expect(parts(spec, { drill: ["Outerwear"] }).crumbs).toContain("Outerwear");
    expect(err({ ...spec, series: "region" }).path).toBe("seriesPath");
    expect(err({ ...spec, seriesPath: undefined }).path).toBe("drill");
  });

  it("hexmap with path draws a drilled state as horizontal bars, largest first", () => {
    const spec = {
      type: "hexmap",
      path: ["state", "store"],
      y: "sales",
      drill: true,
      data: [
        { state: "Nevada", store: "Nevada (89052)", sales: 59 },
        { state: "Nevada", store: "Nevada (89145)", sales: 70 },
        { state: "Iowa", store: "Iowa (50266)", sales: 24 },
      ],
    } as ChartSpec;
    expect(parts(spec).svg).toContain("data-drill");
    const s = resolve(spec, { drill: ["Nevada"] });
    expect([s.type, s.horizontal, s.sort, s.x]).toEqual(["bar", true, "desc", "store"]);
    const svg = parts(spec, { drill: ["Nevada"] }).svg;
    expect(svg).toContain('data-dir="h"');
    expect(svg.indexOf("89145")).toBeLessThan(svg.indexOf("89052"));
  });

  it("waterfall start opens at its own y and a drilled step is rebased between subtotals", () => {
    const data = [
      { region: "East", state: "NY", change: -3 },
      { region: "2025 YTD", state: null, change: 100 },
      { region: "West", state: "CA", change: 10 },
      { region: "West", state: "OR", change: 5 },
      { region: "2026 YTD", state: null, change: null },
    ];
    const spec = {
      type: "waterfall",
      path: ["region", "state"],
      y: "change",
      drill: true,
      start: "2025 YTD",
      totals: ["2026 YTD"],
      data,
    } as ChartSpec;
    const root = resolve(spec);
    expect(root.data[0]!.region).toBe("2025 YTD");
    expect(root.totals).toEqual(["2025 YTD", "2026 YTD"]);
    expect(shape(root).cells.map((c) => [c.y0, c.y1])).toEqual([
      [0, 100],
      [100, 97],
      [97, 112],
      [0, 112],
    ]);
    const w = resolve(spec, { drill: ["West"] });
    expect(w.data.map((r) => [r.state, r.change])).toEqual([
      ["Before West", 97],
      ["CA", 10],
      ["OR", 5],
      ["After West", null],
    ]);
    expect(w.totals).toContain("After West");
    expect(shape(w).cells.at(-1)!.y1).toBe(112);
    expect(resolve(spec, { drill: ["East"] }).data[0]!.change).toBe(100);
    expect(() => parts(spec, { drill: ["West"] })).not.toThrow();
    expect(err({ ...spec, start: "2024 YTD" }).path).toBe("start");
  });

  it("heatmap xPath drills columns on their own, with Total margins", () => {
    const spec = {
      type: "heatmap",
      path: ["region", "itemType"],
      xPath: ["family", "product"],
      y: "sales",
      drill: true,
      totals: true,
      data: shop,
    } as ChartSpec;
    const s = resolve(spec);
    expect([s.x, s.series, s.xPath, s.margins]).toEqual([
      "family",
      "region",
      ["family", "product"],
      true,
    ]);
    const m = shape(s).margins!;
    expect(shape(s).categories).toEqual(["Outerwear", "Bottoms"]);
    expect([m.x, m.series, m.all]).toEqual([[29, 11], [23, 17], 40]);
    expect(shape(s, { hidden: ["East"] }).margins!.x).toEqual([23, null]);
    const d = resolve(spec, { xDrill: ["Outerwear"] });
    expect([d.x, d.xDrilled, d.data.length]).toEqual(["product", ["Outerwear"], 3]);
    expect(parts(spec).svg).toContain("data-xdrill");
    const p = parts(spec, { xDrill: ["Outerwear"] });
    expect(p.crumbs).toContain('data-axis="x"');
    expect(p.svg).not.toContain("data-xdrill");
    expect(err({ ...spec, totals: ["x"] }).path).toBe("totals");
    expect(err({ type: "bar", x: "region", y: "sales", totals: true, data: shop }).path).toBe(
      "totals",
    );
  });

  it("table expand: a sub-chart over the open row's rows", () => {
    const rows = shop.map((r, i) => ({ ...r, month: `M${i % 2}`, ly: 5 }));
    const spec = {
      type: "table",
      x: "region",
      y: ["sales"],
      expand: { type: "bar", x: "month", y: "sales", was: "ly" },
      data: rows,
    };
    expect(parts(spec, { expanded: "West" }).svg).toContain("data-expand");
    expect(resolve(spec as ChartSpec, { expanded: "West" }).expanded).toEqual(["West"]);
    expect(err({ ...spec, expand: { type: "bar", x: "nope", y: "sales" } }).path).toBe("expand.x");
    expect(err({ ...spec, expand: { type: "bar", y: "sales", data: [] } }).path).toBe(
      "expand.data",
    );
    expect(err({ ...spec, expand: { type: "bar", y: "sales", drill: true } }).path).toBe(
      "expand.drill",
    );
    expect(err({ ...spec, expand: "all" }).path).toBe("expand");
  });

  it("line drillTo: a series opens its sub-chart, was previous reads the series before it", () => {
    const data = ["2024", "2025"].flatMap((year, j) =>
      ["Jan", "Feb"].map((m, i) => ({
        year,
        m,
        cum: (i + 1) * 10 * (j + 1),
        monthly: 10 * (j + 1) + i,
      })),
    );
    const spec = {
      type: "line",
      x: "m",
      y: "cum",
      series: "year",
      drillTo: { type: "bar", y: "monthly", was: "previous" },
      data,
    } as ChartSpec;
    validateSpec(spec);
    expect(parts(spec).svg).toContain('data-drill="series"');
    const p = parts(spec, { drill: ["2025"] });
    expect(p.svg).toContain("data-past");
    expect(p.legend).toContain("2024");
    expect(p.crumbs).toContain('aria-current="page">2025<');
    expect(parts(spec, { drill: ["2024"] }).svg).not.toContain("data-past");
    expect(err({ ...spec, series: undefined }).path).toBe("drillTo");
    expect(err({ ...spec, drillTo: { type: "scatter", y: "monthly", was: "previous" } }).path).toBe(
      "drillTo.was",
    );
  });
});

describe("#84 table", () => {
  const base = { type: "table", x: "product", y: ["sales"], data: shop };
  const spec = {
    ...base,
    columns: ["itemType"],
    page: 2,
    filter: true,
    bars: { sales: "diverging" },
    cells: { Form: { type: "strip", field: "sales", by: "region", last: 1, tone: "sign" } },
  } as ChartSpec;
  it("page, scroll, filter, columns, bars and cells validate and resolve", () => {
    validateSpec(spec);
    const s = resolve(spec, { page: 1, filter: "JACK" });
    expect([s.shown, s.scroll, s.filter, s.columns, s.data.length]).toEqual([
      4,
      true,
      "JACK",
      ["itemType"],
      2,
    ]);
    expect(s.bars.get("sales")).toBe("diverging");
    expect(resolve({ ...spec, bars: undefined } as unknown as ChartSpec).bars.get("sales")).toBe(
      "bar",
    );
    expect(resolve({ ...base, scroll: true } as ChartSpec).shown).toBe(1000);
    const st = strips(resolve(spec)).get("Form")!;
    expect(st.labels).toEqual(["East"]);
    expect(st.values.get("Chino")).toEqual([11]);
    expect(st.values.get("Parka")).toBeUndefined();
    const p = parts(spec, { filter: 'a"<' });
    expect(p.controls).toContain('data-maya="filter"');
    expect(p.controls).toContain('value="a&quot;&lt;"');
    expect(p.svg).toContain("data-scroll");
  });
  it("refuses what it cannot draw", () => {
    expect(err({ ...spec, bars: { units: "bar" } }).path).toBe("bars.units");
    expect(err({ ...spec, bars: true }).path).toBe("bars");
    expect(
      err({ ...spec, cells: { F: { type: "spark", field: "sales", by: "region" } } }).path,
    ).toBe("cells");
    expect(
      err({ ...spec, cells: { F: { type: "strip", field: "region", by: "region" } } }).code,
    ).toBe("non-numeric-field");
    expect(err({ ...spec, columns: ["nope"] }).path).toBe("columns[0]");
    expect(err({ type: "bar", x: "product", y: "sales", page: 2, data: shop }).path).toBe("page");
  });
  it("view fields are checked", () => {
    expect(() =>
      validateOptions({ view: { xDrill: ["a"], expanded: "", page: 0, filter: "x" } }),
    ).not.toThrow();
    for (const view of [
      { xDrill: "a" },
      { expanded: 1 },
      { page: -1 },
      { filter: "x".repeat(201) },
    ])
      expect(() => validateOptions({ view }), JSON.stringify(view)).toThrow(MayaSpecError);
  });
});

describe("#79 list", () => {
  const data = [
    { Move: "Lead with Jackets", Text: "Earns $86.81 a unit", Value: 86.81, Format: "currency" },
    { Move: "Lead with Jackets", Evidence: "Jackets", Value: 86.81, Format: "currency" },
    { Move: "Lead with Jackets", Evidence: "Vests", Value: 71.07, Format: "currency" },
    { Move: "Do not reallocate", Text: "14 of 15 types down", Value: 1.2, Format: "{value} pts" },
    { Move: "Protect the top three", Text: "48% of sales", Value: 0.48, Format: "percent" },
  ];
  const spec = {
    type: "list",
    x: "Move",
    y: "Value",
    path: ["Move", "Evidence"],
    body: "Text",
    rowFormat: "Format",
    bars: true,
    data,
  } as ChartSpec;
  it("groups rows into moves without summing the evidence", () => {
    validateSpec(spec);
    const s = resolve(spec);
    expect([s.evidence, s.body, s.rowFormat, s.bars.get("Value"), s.expanded]).toEqual([
      "Evidence",
      "Text",
      "Format",
      "bar",
      ["Lead with Jackets"],
    ]);
    expect(moves(s).map((m) => [m.x, m.value, m.format, m.evidence.length])).toEqual([
      ["Lead with Jackets", 86.81, "currency", 2],
      ["Do not reallocate", 1.2, "{value} pts", 0],
      ["Protect the top three", 0.48, "percent", 0],
    ]);
    expect(shape(s).cells.map((c) => c.value)).toEqual([86.81, 1.2, 0.48]);
    expect(resolve({ ...spec, expand: "all" }).expanded).toHaveLength(3);
    expect(resolve({ ...spec, expand: "none" }).expanded).toEqual([]);
    expect(resolve(spec, { expanded: "" }).expanded).toEqual([]);
    const p = parts(spec);
    expect(p.svg).toContain("$86.81");
    expect(p.svg).toContain("1.2 pts");
    expect(p.table).toContain("48%");
    const { path: _, ...flat } = spec;
    expect(() => render(flat as ChartSpec)).not.toThrow();
  });
  it("checks its own options", () => {
    expect(err({ ...spec, path: ["Move"] }).path).toBe("path");
    expect(err({ ...spec, x: "Text" }).path).toBe("x");
    expect(err({ ...spec, data: [...data, { ...data[0], Format: "money" }] }).code).toBe(
      "invalid-format",
    );
    expect(err({ ...spec, bars: { Value: "bar" } }).path).toBe("bars");
    expect(err({ ...spec, expand: { type: "bar" } }).path).toBe("expand");
    expect(err({ ...spec, body: "nope" }).path).toBe("body");
  });
});
