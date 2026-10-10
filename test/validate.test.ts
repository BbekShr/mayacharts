import { beforeAll, describe, expect, it } from "vitest";
import { render } from "../src/index.ts";
import { register } from "../src/core/registry.ts";
import {
  fail,
  MayaSpecError,
  resolve,
  validateOptions,
  validateSpec,
} from "../src/core/validate.ts";
import type { ChartSpec } from "../src/core/types.ts";

const base = {
  type: "bar",
  data: [
    { month: "Jan", revenue: 10, region: "N", units: 1 },
    { month: "Feb", revenue: 20, region: "S", units: 2 },
  ],
  x: "month",
  y: "revenue",
};
const tree = {
  type: "treemap",
  data: [
    { region: "N", state: "NY", sales: 3 },
    { region: "S", state: "TX", sales: 4 },
  ],
  path: ["region", "state"],
  y: "sales",
};

const err = (spec: unknown, opts?: boolean): MayaSpecError => {
  try {
    if (opts) validateOptions(spec);
    else validateSpec(spec);
  } catch (e) {
    if (e instanceof MayaSpecError) return e;
    throw e;
  }
  throw new Error("expected MayaSpecError");
};
const code = (spec: unknown, opts?: boolean) => {
  const e = err(spec, opts);
  return [e.code, e.path];
};
const ok = (spec: unknown) => expect(() => validateSpec(spec)).not.toThrow();

// Runs first: the registry is per-file global, so load hierarchy only after this.
it("unloaded module type, then loaded", async () => {
  expect(err(tree).message).toMatchInlineSnapshot(`
    "mayacharts: spec.type = "treemap" needs the "hierarchy" module, which is not loaded.
      Add: import "mayacharts/hierarchy"
      -> https://bbekshr.github.io/mayacharts/errors.html#unknown-type"
  `);
  expect(err({ ...tree, type: "treemp" }).message).toContain('Did you mean "treemap"?');
  await import("../src/hierarchy.ts");
  ok(tree);
  expect(err({ ...base, type: "nope" }).message).toContain("treemap, sunburst");
});

describe("one snapshot per error code", () => {
  it("spec-not-object", () => {
    expect(err([]).message).toMatchInlineSnapshot(`
      "mayacharts: spec must be a plain object, received array.
        Received: []
        -> https://bbekshr.github.io/mayacharts/errors.html#spec-not-object"
    `);
  });
  it("missing-field", () => {
    const e = err({ type: "bar", data: [], x: "a" });
    expect([e.code, e.path]).toEqual(["missing-field", "y"]);
    expect(e.message).toMatchInlineSnapshot(`
      "mayacharts: spec.y is required but missing.
        Required fields: type, data, x, y.
        Example: { type: "bar", data: [{ month: "Jan", revenue: 10 }], x: "month", y: "revenue" }
        -> https://bbekshr.github.io/mayacharts/errors.html#missing-field"
    `);
    expect(err({ type: "treemap", data: [], y: "a" }).message).toMatchInlineSnapshot(`
      "mayacharts: spec.path is required but missing.
        Required fields: type, data, path, y.
        Example: { type: "treemap", data: [{ region: "N", state: "NY", sales: 10 }], path: ["region", "state"], y: "sales" }
        -> https://bbekshr.github.io/mayacharts/errors.html#missing-field"
    `);
  });
  it("unknown-type", () => {
    const e = err({ ...base, type: "lin" });
    expect([e.code, e.path]).toEqual(["unknown-type", "type"]);
    expect(e.message).toMatchInlineSnapshot(`
      "mayacharts: spec.type = "lin" is not a chart type.
        Valid types: bar, line, area, scatter, heatmap, waterfall, kpi, dumbbell, ridgeline, beeswarm, parallel, table, treemap, sunburst, marimekko, waffle.
        Did you mean "line"?
        -> https://bbekshr.github.io/mayacharts/errors.html#unknown-type"
    `);
  });
  it("data-not-array", () => {
    expect(err({ ...base, data: "nope" }).message).toMatchInlineSnapshot(`
      "mayacharts: spec.data must be an array of rows, received string.
        -> https://bbekshr.github.io/mayacharts/errors.html#data-not-array"
    `);
  });
  it("row-not-object", () => {
    const e = err({ ...base, data: [{ month: "a", revenue: 1 }, 5] });
    expect([e.code, e.path]).toEqual(["row-not-object", "data[1]"]);
    expect(e.message).toMatchInlineSnapshot(`
      "mayacharts: spec.data[1] must be an object, received number.
        Received: 5
        -> https://bbekshr.github.io/mayacharts/errors.html#row-not-object"
    `);
  });
  it("unknown-field", () => {
    const e = err({ ...base, y: "revenu" });
    expect([e.code, e.path]).toEqual(["unknown-field", "y"]);
    expect(e.message).toMatchInlineSnapshot(`
      "mayacharts: spec.y = "revenu" is not a field in spec.data.
        Fields found: month, revenue, region, units.
        Did you mean "revenue"?
        spec.y names the field used for the plotted numbers.
        -> https://bbekshr.github.io/mayacharts/errors.html#unknown-field"
    `);
  });
  it("non-numeric-y with coercion hint", () => {
    const e = err({ ...base, data: [...base.data, { month: "Mar", revenue: "12" }] });
    expect([e.code, e.path]).toEqual(["non-numeric-y", "data[2].revenue"]);
    expect(e.message).toMatchInlineSnapshot(`
      "mayacharts: spec.data[2].revenue is "12" (a string), but spec.y requires numbers.
        Convert first: data.map(r => ({ ...r, revenue: Number(r.revenue) }))
        -> https://bbekshr.github.io/mayacharts/errors.html#non-numeric-y"
    `);
    expect(err({ ...base, data: [{ month: "Mar", revenue: "abc" }] }).message).toContain(
      "Use null for a gap in the data.",
    );
  });
  it("non-numeric-field", () => {
    const e = err({ ...base, type: "scatter", x: "units", size: "region" });
    expect([e.code, e.path]).toEqual(["non-numeric-field", "data[0].region"]);
    expect(e.message).toMatchInlineSnapshot(`
      "mayacharts: spec.data[0].region is "N" (a string), but spec.size requires numbers.
        Use null for a gap in the data.
        -> https://bbekshr.github.io/mayacharts/errors.html#non-numeric-field"
    `);
  });
  it("non-positive-value", () => {
    const e = err({ ...tree, data: [...tree.data, { region: "W", state: "CA", sales: -1 }] });
    expect([e.code, e.path]).toEqual(["non-positive-value", "data[2].sales"]);
    expect(e.message).toMatchInlineSnapshot(`
      "mayacharts: spec.data[2].sales is -1, but treemap sizes must be positive.
        Filter first: data.filter(r => r.sales > 0), or chart the signed values with "bar".
        -> https://bbekshr.github.io/mayacharts/errors.html#non-positive-value"
    `);
  });
  it("unknown-option", () => {
    const e = err({ ...base, stacked: true });
    expect([e.code, e.path]).toEqual(["unknown-option", "stacked"]);
    expect(e.message).toMatchInlineSnapshot(`
      "mayacharts: spec.stacked is not a known option.
        Did you mean "stack"?
        Known options: type, data, y, path, totals, aggregate, sort, limit, format, titles, text, yDomain, xDomain, rules, select, xType, stack, forms, colors, colorBy, theme, $schema, x, y2, was, series, size, name, title, description, locale, currency, frame, horizontal, labels, legend, endLabels, tooltip, drill, drillOut, zoom, grid, xAxis, yAxis, table, animate.
        -> https://bbekshr.github.io/mayacharts/errors.html#unknown-option"
    `);
  });
  it("invalid-option", () => {
    const e = err({ ...base, grid: "yes" });
    expect([e.code, e.path]).toEqual(["invalid-option", "grid"]);
    expect(e.message).toMatchInlineSnapshot(`
      "mayacharts: spec.grid must be a boolean, received "yes".
        -> https://bbekshr.github.io/mayacharts/errors.html#invalid-option"
    `);
  });
  it("option-unsupported", () => {
    const e = err({ ...base, zoom: true });
    expect([e.code, e.path]).toEqual(["option-unsupported", "zoom"]);
    expect(e.message).toMatchInlineSnapshot(`
      "mayacharts: spec.zoom is not supported with spec.type = "bar".
        spec.zoom works with: line, area, scatter.
        -> https://bbekshr.github.io/mayacharts/errors.html#option-unsupported"
    `);
  });
  it("stack-unsupported", () => {
    const e = err({ ...base, type: "line", stack: true });
    expect([e.code, e.path]).toEqual(["stack-unsupported", "stack"]);
    expect(e.message).toMatchInlineSnapshot(`
      "mayacharts: spec.stack is not supported with spec.type = "line".
        Use type "area" (or "bar") to stack series.
        -> https://bbekshr.github.io/mayacharts/errors.html#stack-unsupported"
    `);
  });
  it("invalid-domain", () => {
    expect(code({ ...base, yDomain: [5, 5] })).toEqual(["invalid-domain", "yDomain"]);
    expect(err({ ...base, type: "scatter", x: "units", xDomain: [1] }).message)
      .toMatchInlineSnapshot(`
        "mayacharts: spec.xDomain = [1] is not a valid domain.
          Expected [min, max] with finite numbers and min < max, e.g. [0, 100].
          -> https://bbekshr.github.io/mayacharts/errors.html#invalid-domain"
      `);
  });
  it("invalid-format", () => {
    const e = err({ ...base, format: "percnt" });
    expect([e.code, e.path]).toEqual(["invalid-format", "format"]);
    expect(e.message).toMatchInlineSnapshot(`
      "mayacharts: spec.format = "percnt" is not a format preset.
        Presets: auto, integer, decimal, compact, percent, currency, date, month, year, time, datetime. Or per field: { <field>: preset or Intl options }.
        Did you mean "percent"?
        -> https://bbekshr.github.io/mayacharts/errors.html#invalid-format"
    `);
  });
  it("invalid-theme", () => {
    const e = err({ ...base, theme: { acent: "red" } });
    expect([e.code, e.path]).toEqual(["invalid-theme", "theme.acent"]);
    expect(e.message).toMatchInlineSnapshot(`
      "mayacharts: spec.theme.acent is not a theme token.
        Valid tokens: font, fontSize, fg, fgMuted, grid, bg, accent, radius, tooltipBg, tooltipFg, focus, good, bad, line, gridDash, series1, series2, series3, series4, series5, series6, series7, series8.
        Did you mean "accent"?
        -> https://bbekshr.github.io/mayacharts/errors.html#invalid-theme"
    `);
  });
  it("unsafe-css-value", () => {
    const e = err({ ...base, theme: { accent: "red; } body { x: y" } });
    expect([e.code, e.path]).toEqual(["unsafe-css-value", "theme.accent"]);
    expect(e.message).toMatchInlineSnapshot(`
      "mayacharts: spec.theme.accent = "red; } body { x: y" is not a safe CSS value.
        Allowed: colours, lengths, numbers and rgb() rgba() hsl() hsla() oklch() oklab() lab() lch() color() color-mix() light-dark() var() calc(); fonts are family names.
        Not allowed: url(), image-set(), other functions, ; { } < > \\ and (outside fonts) quotes.
        -> https://bbekshr.github.io/mayacharts/errors.html#unsafe-css-value"
    `);
  });
  it("invalid-size", () => {
    const e = err({ width: 0 }, true);
    expect([e.code, e.path]).toEqual(["invalid-size", "options.width"]);
    expect(e.message).toMatchInlineSnapshot(`
      "mayacharts: options.width = 0 is not a valid size.
        Size must be a finite number greater than 0.
        -> https://bbekshr.github.io/mayacharts/errors.html#invalid-size"
    `);
  });
  it("unknown-state (via a module's Mark.check)", () => {
    register("testmap", {
      noun: "Test",
      check: (s, f) => {
        if (s.data.some((r) => r["state"] === "XX"))
          f("unknown-state", "data[0].state", 'spec.data[0].state = "XX" is not a US state.');
      },
      draw: () => ({ marks: "", hits: "" }),
    });
    const e = err({ type: "testmap", data: [{ state: "XX", v: 1 }], x: "state", y: "v" });
    expect([e.code, e.path]).toEqual(["unknown-state", "data[0].state"]);
    expect(e.message).toMatchInlineSnapshot(`
      "mayacharts: spec.data[0].state = "XX" is not a US state.
        -> https://bbekshr.github.io/mayacharts/errors.html#unknown-state"
    `);
  });
  it("too-many-marks (message format; thrown by render)", () => {
    let e: unknown;
    try {
      fail(
        "too-many-marks",
        "data",
        "spec.data would draw 11000 marks; the limit is 10000.",
        "Use limit or aggregate.",
      );
    } catch (x) {
      e = x;
    }
    expect((e as MayaSpecError).code).toBe("too-many-marks");
    expect((e as MayaSpecError).message).toMatchInlineSnapshot(`
      "mayacharts: spec.data would draw 11000 marks; the limit is 10000.
        Use limit or aggregate.
        -> https://bbekshr.github.io/mayacharts/errors.html#too-many-marks"
    `);
  });
});

describe("HINTS before did-you-mean", () => {
  it.each([
    ["label", "titles"],
    ["xLabel", "titles"],
    ["yLabel", "titles"],
    ["yFormat", 'format: "compact"'],
    ["dataKey", 'y: "<field>"'],
    ["indexAxis", "horizontal: true"],
    ["orientation", "horizontal: true"],
    ["width", "render(spec, { width, height })"],
    ["height", "render(spec, { width, height })"],
    ["color", "colorBy"],
    ["groupBy", "series"],
    ["formatter", "Functions are not supported"],
  ])("%s", (k, hint) => {
    const e = err({ ...base, [k]: 1 });
    expect([e.code, e.path]).toEqual(["unknown-option", k]);
    expect(e.message).toContain(hint);
    expect(e.message).not.toContain("Did you mean");
  });
  it("size: number and select: false", () => {
    expect(err({ ...base, type: "scatter", x: "units", size: 10 }).message).toContain(
      "spec.size names a field for bubble area",
    );
    expect(err({ ...base, select: false }).message).toContain('Use select: true or "multi"');
  });
  it("did you mean still works", () => {
    expect(err({ ...base, stacked: true }).message).toContain('Did you mean "stack"?');
    expect(err({ ...base, colour: [] }).message).toContain('Did you mean "colors"?');
    expect(err({ ...base, colours: [] }).message).toContain('Did you mean "colors"?');
    expect(err({ ...base, y: "revenu" }).message).toContain('Did you mean "revenue"?');
  });
});

describe("unknown-type hints", () => {
  it.each([
    ["column", 'Use type: "bar".'],
    ["barh", "horizontal: true"],
    ["bubble", 'type: "scatter" with size'],
    ["pie", "not supported"],
    ["donut", "not supported"],
    ["choropleth", "hexmap"],
    ["map", "hexmap"],
  ])("%s", (t, hint) => {
    const e = err({ ...base, type: t });
    expect(e.code).toBe("unknown-type");
    expect(e.message).toContain(hint);
  });
});

describe("option-unsupported: ONLY table and pairs", () => {
  it.each([
    [{ ...base, type: "line", horizontal: true }, "horizontal"],
    [{ ...base, size: "units" }, "size"],
    [{ ...base, totals: ["Jan"] }, "totals"],
    [{ ...base, type: "waterfall", series: "region" }, "series"],
    [{ ...base, type: "waterfall", sort: "asc" }, "sort"],
    [{ ...base, type: "waterfall", limit: 3 }, "limit"],
    [{ ...base, type: "heatmap", stack: true }, "stack"],
    [{ ...base, type: "heatmap", colorBy: "sign" }, "colorBy"],
    [{ ...base, xDomain: [0, 1] }, "xDomain"],
    [{ ...base, type: "heatmap", drill: true }, "drill"],
    [{ ...base, type: "bar", zoom: true }, "zoom"],
  ])("ONLY %#", (spec, path) => {
    expect(code(spec)).toEqual(["option-unsupported", path]);
  });
  it("pairs", () => {
    expect(code({ ...base, colorBy: "sign", series: "region" })).toEqual([
      "option-unsupported",
      "colorBy",
    ]);
    expect(code({ ...base, y: ["revenue", "units"], yDomain: [0, 1] })).toEqual([
      "option-unsupported",
      "yDomain",
    ]);
    const { x: _x, ...noX } = base;
    expect(code({ ...noX, path: ["region", "month"], drill: true, select: true })).toEqual([
      "option-unsupported",
      "select",
    ]);
    expect(code({ ...base, path: ["region", "month"] })).toEqual(["option-unsupported", "x"]);
    expect(code({ ...base, drill: true })).toEqual(["option-unsupported", "drill"]);
    expect(err({ ...base, drill: true }).message).toContain("needs spec.path");
  });
  it("false booleans are not 'set'", () => {
    ok({ ...base, type: "line", stack: false, horizontal: false });
  });
});

describe("y arrays", () => {
  it("valid", () => ok({ ...base, y: ["revenue", "units"] }));
  it("unknown y[i]", () => {
    expect(code({ ...base, y: ["revenue", "unit"] })).toEqual(["unknown-field", "y[1]"]);
  });
  it("non-numeric y[i]", () => {
    expect(
      code({ ...base, y: ["revenue", "units"], data: [{ month: "a", revenue: 1, units: "x" }] }),
    ).toEqual(["non-numeric-y", "data[0].units"]);
  });
  it("empty or non-string", () => {
    expect(code({ ...base, y: [] })).toEqual(["invalid-option", "y"]);
    expect(code({ ...base, y: [1] })).toEqual(["invalid-option", "y"]);
  });
});

describe("field existence", () => {
  it.each([
    [{ ...base, series: "regon" }, "series"],
    [{ ...base, type: "scatter", x: "units", name: "nm" }, "name"],
    [{ ...tree, path: ["region", "sate"] }, "path[1]"],
    [{ ...base, colorBy: "margin" }, "colorBy"],
    [{ ...base, format: { revnue: "compact" } }, "format.revnue"],
    [{ ...base, titles: { mnth: "Month" } }, "titles.mnth"],
  ])("%#", (spec, path) => {
    expect(code(spec)).toEqual(["unknown-field", path]);
  });
  it("colorBy sign vs a field named sign", () => {
    expect(
      code({ ...base, colorBy: "sign", data: [{ month: "a", revenue: 1, sign: "+" }] }),
    ).toEqual(["invalid-option", "colorBy"]);
  });
  it("totals are x values, not fields", () => ok({ ...base, type: "waterfall", totals: ["FY"] }));
});

describe("formats", () => {
  it("valid presets, Intl options, prefix/suffix", () => {
    ok({ ...base, format: "compact" });
    ok({
      ...base,
      locale: "de-DE",
      currency: "EUR",
      format: {
        revenue: { style: "currency", currency: "EUR", suffix: " net" },
        month: { month: "short", timeZone: "UTC" },
        units: "integer",
      },
    });
  });
  it("bad Intl options", () => {
    const e = err({ ...base, format: { revenue: { style: "percnt" } } });
    expect([e.code, e.path]).toEqual(["invalid-format", "format.revenue"]);
    expect(e.message).toContain("Intl.NumberFormat options");
    expect(code({ ...base, format: { month: { month: "tiny" } } })).toEqual([
      "invalid-format",
      "format.month",
    ]);
  });
  it("prefix must be a string", () => {
    expect(code({ ...base, format: { revenue: { prefix: 1 } } })).toEqual([
      "invalid-format",
      "format.revenue.prefix",
    ]);
  });
  it("unsupported locale and bad currency", () => {
    expect(code({ ...base, locale: "zz-ZZ" })).toEqual(["invalid-format", "locale"]);
    expect(code({ ...base, locale: "not a locale" })).toEqual(["invalid-format", "locale"]);
    expect(code({ ...base, currency: "US" })).toEqual(["invalid-format", "currency"]);
  });
});

describe("CSS allowlist", () => {
  it.each([
    'image-set("https://x" 1x)',
    "url(x)",
    "URL(http://x)",
    "expression(x)",
    "src(x)",
    "red; } body { x: y",
    "red</style>",
    "",
    "attr(x)",
  ])("rejects %s", (v) => {
    expect(code({ ...base, theme: { accent: v } })).toEqual(["unsafe-css-value", "theme.accent"]);
    expect(code({ ...base, colors: ["#fff", v] })[0]).toBe("unsafe-css-value");
  });
  it.each([
    "#123456",
    "oklch(.6 .17 255)",
    "rgb(1 2 3 / 50%)",
    "color-mix(in oklab, red 40%, blue)",
    "light-dark(#fff, #000)",
    "var(--brand)",
    "calc(2px + 1em)",
    "rebeccapurple",
  ])("accepts %s", (v) => ok({ ...base, theme: { accent: v }, colors: [v] }));
  it("font: families and identifiers only", () => {
    ok({ ...base, theme: { font: `"Inter", 'Segoe UI', system-ui, sans-serif` } });
    ok({ ...base, theme: { font: "Segoe UI, sans-serif" } });
    expect(code({ ...base, theme: { font: "url(x)" } })[0]).toBe("unsafe-css-value");
    expect(code({ ...base, theme: { font: '"a"; x' } })[0]).toBe("unsafe-css-value");
  });
  it("colors: max 8, object form", () => {
    expect(code({ ...base, colors: Array(9).fill("red") })).toEqual(["invalid-option", "colors"]);
    ok({ ...base, colors: { N: "red", S: "#00f" } });
    expect(code({ ...base, colors: { N: "url(x)" } })).toEqual(["unsafe-css-value", "colors.N"]);
    expect(code({ ...base, colors: [1] })).toEqual(["invalid-option", "colors"]);
  });
  it("new tokens", () => ok({ ...base, theme: { good: "green", bad: "red", series8: "#000" } }));
});

describe("prototype pollution", () => {
  const rows = JSON.parse('[{"__proto__": "a", "constructor": 1, "v": 2}]');
  it("fields named __proto__ / constructor work", () => {
    ok({ type: "bar", data: rows, x: "__proto__", y: "constructor" });
    expect(code({ type: "bar", data: [{ a: "x", v: 1 }], x: "constructor", y: "v" })).toEqual([
      "unknown-field",
      "x",
    ]);
  });
  it("hostile keys fail cleanly", () => {
    expect(code(JSON.parse('{"__proto__": 1}'))).toEqual(["unknown-option", "__proto__"]);
    expect(code({ ...base, type: "constructor" })).toEqual(["unknown-type", "type"]);
    expect(code({ ...base, type: "toString" })).toEqual(["unknown-type", "type"]);
    expect(code({ ...base, theme: JSON.parse('{"__proto__": "red"}') })).toEqual([
      "invalid-theme",
      "theme.__proto__",
    ]);
    expect(code({ ...base, text: { constructor: "x" } })).toEqual([
      "invalid-option",
      "text.constructor",
    ]);
    expect(code({ ...base, format: { toString: "auto" } })).toEqual([
      "unknown-field",
      "format.toString",
    ]);
    expect(code({ ...base, constructor: 1 })).toEqual(["unknown-option", "constructor"]);
  });
});

describe("other option values", () => {
  it.each([
    [{ ...base, aggregate: "avg" }, "aggregate"],
    [{ ...base, sort: "up" }, "sort"],
    [{ ...base, limit: 0 }, "limit"],
    [{ ...base, limit: 1.5 }, "limit"],
    [{ ...base, select: "single" }, "select"],
    [{ ...base, colorBy: { target: "x" } }, "colorBy"],
    [{ ...base, colorBy: { target: 1, extra: 2 } }, "colorBy"],
    [{ ...base, titles: { month: 1 } }, "titles"],
    [{ ...base, text: { noData: 1 } }, "text.noData"],
    [{ ...base, text: { nodata: "x" } }, "text.nodata"],
    [{ ...tree, path: [] }, "path"],
    [{ ...base, type: "waterfall", totals: "FY" }, "totals"],
  ])("%#", (spec, path) => {
    expect(code(spec)).toEqual(["invalid-option", path]);
  });
});

describe("validateOptions", () => {
  it("valid", () => {
    expect(() => validateOptions(undefined)).not.toThrow();
    expect(() =>
      validateOptions({
        width: 100,
        height: 50,
        view: { measure: 1, drill: ["N"], window: [0, 3], hidden: ["a"] },
        selected: [{ x: "Jan", series: "N" }, { name: 3 }],
        nonce: "r4nd0m+/=",
      }),
    ).not.toThrow();
  });
  it("invalid", () => {
    expect(code({ widht: 1 }, true)).toEqual(["unknown-option", "options.widht"]);
    expect(code({ hidden: ["a"] }, true)).toEqual(["unknown-option", "options.hidden"]);
    expect(code(5, true)).toEqual(["invalid-option", "options"]);
    expect(code({ view: { zoom: [0, 1] } }, true)).toEqual(["unknown-option", "options.view.zoom"]);
    expect(code({ view: { measure: -1 } }, true)).toEqual([
      "invalid-option",
      "options.view.measure",
    ]);
    expect(code({ view: { hidden: [1] } }, true)).toEqual([
      "invalid-option",
      "options.view.hidden",
    ]);
    expect(code({ view: { window: [0, 1, 2] } }, true)).toEqual([
      "invalid-option",
      "options.view.window",
    ]);
    expect(code({ selected: [{ key: 1 }] }, true)).toEqual(["invalid-option", "options.selected"]);
    expect(code({ nonce: '"><x' }, true)).toEqual(["invalid-option", "options.nonce"]);
  });
});

describe("validateSpec passes", () => {
  it("full valid spec", () => {
    ok({
      ...base,
      $schema: "https://unpkg.com/mayacharts/schema.json",
      series: "region",
      stack: true,
      title: "t",
      description: "d",
      legend: true,
      tooltip: true,
      grid: true,
      xAxis: true,
      yAxis: true,
      titles: { month: "Month", revenue: "Revenue ($)" },
      format: { revenue: "currency" },
      labels: true,
      text: { noData: "Keine Daten" },
      aggregate: "mean",
      sort: "desc",
      limit: 5,
      select: "multi",
      locale: "en-US",
      currency: "USD",
      yDomain: [0, 100],
      table: true,
      animate: false,
      colors: ["#fff", "rgb(1,2,3)"],
      theme: { accent: "#123456", font: "system-ui, sans-serif" },
    });
  });
  it("null/undefined y values, empty data", () => {
    ok({
      ...base,
      data: [
        { month: "a", revenue: null },
        { month: "b", revenue: undefined },
        { month: "c", revenue: 1 },
      ],
    });
    ok({ ...base, data: [] });
  });
  it("bar with path instead of x", () => {
    const { x: _x, ...noX } = base;
    ok({ ...noX, path: ["region", "month"], drill: true });
  });
});

describe("resolve", () => {
  const rows = [
    { region: "N", state: "NY", sales: 3, units: 1 },
    { region: "N", state: "NJ", sales: 2, units: 1 },
    { region: "S", state: "TX", sales: 4, units: 2 },
  ];
  it("measure picks the active y; bare format expands to every measure", () => {
    const s = resolve(
      { type: "bar", data: rows, x: "state", y: ["sales", "units"], format: "compact" },
      { measure: 1 },
    );
    expect([s.y, s.measures, s.measure]).toEqual(["units", ["sales", "units"], 1]);
    expect([...s.format]).toEqual([
      ["sales", "compact"],
      ["units", "compact"],
    ]);
  });
  it("drill filters rows and advances x (bar) or path (path types)", () => {
    const bar: ChartSpec = {
      type: "bar",
      data: rows,
      path: ["region", "state"],
      y: "sales",
      drill: true,
    };
    expect(resolve(bar).x).toBe("region");
    const d = resolve(bar, { drill: ["N"] });
    expect([d.x, d.path, d.drilled, d.data.length]).toEqual(["state", ["state"], ["N"], 2]);
    // Drill is clamped above the last level and ignored without spec.drill.
    expect(resolve(bar, { drill: ["N", "NY"] }).drilled).toEqual(["N"]);
    expect(resolve({ ...bar, drill: false }, { drill: ["N"] }).data).toHaveLength(3);
    const tm = resolve({ ...bar, type: "treemap", drill: true }, { drill: ["S"] });
    expect([tm.x, tm.path, tm.data.length]).toEqual(["", ["state"], 1]);
  });
  it("maps are Maps (no prototype lookups)", () => {
    const s = resolve({ type: "bar", data: rows, x: "state", y: "sales" });
    expect(s.titles.get("constructor")).toBeUndefined();
    expect(s.format.get("toString")).toBeUndefined();
  });
});

describe("0.9 contracts: weave, units, orbit, constellation, was", () => {
  beforeAll(async () => {
    for (const m of ["weave", "units", "orbit", "constellation"]) await import(`../src/${m}.ts`);
  });
  const rows = [
    { g: "A", s: "N", v: 1, w: 2, last: 1, id: "a" },
    { g: "B", s: "S", v: 3, w: -1, last: 2, id: "b" },
  ];
  const at = (type: string, more: object = {}) => ({ type, data: rows, x: "g", y: "v", ...more });

  it("too-few-measures", () => {
    const e = err(at("constellation"));
    expect([e.code, e.path]).toEqual(["too-few-measures", "y"]);
    expect(e.message).toMatchInlineSnapshot(`
      "mayacharts: spec.y on "constellation" needs an array of at least 2 measures.
        -> https://bbekshr.github.io/mayacharts/errors.html#too-few-measures"
    `);
    expect(code(at("constellation", { y: ["v"] }))).toEqual(["too-few-measures", "y"]);
    ok(at("constellation", { y: ["v", "w"], size: "w" }));
  });

  it("weave needs series; orbit takes y2 as growth without a legend", () => {
    expect(code(at("weave"))).toEqual(["missing-field", "series"]);
    ok(at("weave", { series: "s" }));
    ok(at("orbit", { y2: "w", limit: 1, sort: "desc" }));
    expect(resolve(at("orbit", { y2: "w" }) as ChartSpec).legend).toBe(false);
    expect(resolve({ ...base, y2: "units" } as ChartSpec).legend).toBe(true);
    expect(code(at("weave", { series: "s", y2: "w" }))).toEqual(["option-unsupported", "y2"]);
  });

  it("forms: units only, known and distinct", () => {
    ok(at("units", { name: "id", forms: ["swarm", "waffle"] }));
    expect(code(at("bar", { forms: ["bars"] }))).toEqual(["option-unsupported", "forms"]);
    expect(code(at("units", { forms: [] }))).toEqual(["invalid-option", "forms"]);
    expect(code(at("units", { forms: ["pie"] }))).toEqual(["invalid-option", "forms"]);
    expect(code(at("units", { forms: ["bars", "bars"] }))).toEqual(["invalid-option", "forms"]);
    const r = (forms?: string[], form?: number) =>
      resolve(at("units", forms ? { forms } : {}) as ChartSpec, form === undefined ? {} : { form });
    expect(r().forms).toEqual(["waffle", "bars", "swarm"]);
    expect(r(undefined, 9).form).toBe(2);
    expect(r(["swarm"], 1).form).toBe(0);
    expect(resolve(base as ChartSpec).forms).toEqual([]);
    expect(code({ form: -1 }, true)).toEqual(["unknown-option", "options.form"]);
    expect(code({ view: { form: 1.5 } }, true)).toEqual(["invalid-option", "options.view.form"]);
    expect(() => validateOptions({ view: { form: 2 } })).not.toThrow();
  });

  it("was: bar only, numeric, a real field, not with stack or a y array", () => {
    ok(at("bar", { was: "last" }));
    expect(code(at("line", { was: "last" }))).toEqual(["option-unsupported", "was"]);
    expect(code(at("bar", { was: "nope" }))).toEqual(["unknown-field", "was"]);
    expect(code(at("bar", { was: "id" }))).toEqual(["non-numeric-field", "data[0].id"]);
    expect(code(at("bar", { was: "last", series: "s", stack: true }))).toEqual([
      "option-unsupported",
      "was",
    ]);
    expect(code(at("bar", { was: "last", y: ["v", "w"] }))).toEqual(["option-unsupported", "was"]);
    expect(resolve(at("bar", { was: "last" }) as ChartSpec).was).toBe("last");
  });

  it("hints and aliases", () => {
    expect(err({ ...base, previous: "x" }).message).toContain('Use was: "<field>"');
    expect(err({ ...base, type: "bump" }).message).toContain('Use type: "weave"');
  });
});

describe("value magnitude ceiling", () => {
  it("rejects |y| above 1e300 with the numeric error and a scale hint", () => {
    const run = () => render({ type: "bar", x: "c", y: "v", data: [{ c: "a", v: 1.7e308 }] });
    expect(run).toThrow(/Scale the value first/);
    expect(() =>
      render({ type: "bar", x: "c", y: "v", data: [{ c: "a", v: 1e300 }] }),
    ).not.toThrow();
  });
});
