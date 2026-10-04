import { describe, expect, it } from "vitest";
import { MayaSpecError, validateOptions, validateSpec } from "../src/core/validate.ts";

const base = {
  type: "bar",
  data: [
    { month: "Jan", revenue: 10, region: "N" },
    { month: "Feb", revenue: 20, region: "S" },
  ],
  x: "month",
  y: "revenue",
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

describe("validateSpec errors", () => {
  it("spec-not-object", () => {
    const e = err([]);
    expect([e.code, e.path]).toEqual(["spec-not-object", "spec"]);
    expect(e.message).toMatchInlineSnapshot(`
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
  });
  it("unknown-type", () => {
    const e = err({ ...base, type: "lin" });
    expect([e.code, e.path]).toEqual(["unknown-type", "type"]);
    expect(e.message).toMatchInlineSnapshot(`
      "mayacharts: spec.type = "lin" is not a chart type.
        Valid types: bar, line, area.
        Did you mean "line"?
        -> https://bbekshr.github.io/mayacharts/errors.html#unknown-type"
    `);
  });
  it("data-not-array", () => {
    const e = err({ ...base, data: "nope" });
    expect([e.code, e.path]).toEqual(["data-not-array", "data"]);
    expect(e.message).toMatchInlineSnapshot(`
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
        Fields found: month, revenue, region.
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
  });
  it("non-numeric-y without hint", () => {
    const e = err({ ...base, data: [{ month: "Mar", revenue: "abc" }] });
    expect(e.code).toBe("non-numeric-y");
    expect(e.message).toMatchInlineSnapshot(`
      "mayacharts: spec.data[0].revenue is "abc" (a string), but spec.y requires numbers.
        Use null for a gap in the data.
        -> https://bbekshr.github.io/mayacharts/errors.html#non-numeric-y"
    `);
  });
  it("unknown-option", () => {
    const e = err({ ...base, stacked: true });
    expect([e.code, e.path]).toEqual(["unknown-option", "stacked"]);
    expect(e.message).toMatchInlineSnapshot(`
      "mayacharts: spec.stacked is not a known option.
        Did you mean "stack"?
        Known options: x, y, series, title, description, xLabel, yLabel, locale, currency, stack, legend, tooltip, grid, xAxis, yAxis, table, animate, type, data, yFormat, yDomain, colors, theme.
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
    const e = err({ ...base, yDomain: [5, 5] });
    expect([e.code, e.path]).toEqual(["invalid-domain", "yDomain"]);
    expect(e.message).toMatchInlineSnapshot(`
      "mayacharts: spec.yDomain = [5,5] is not a valid domain.
        Expected [min, max] with finite numbers and min < max, e.g. [0, 100].
        -> https://bbekshr.github.io/mayacharts/errors.html#invalid-domain"
    `);
  });
  it("invalid-format", () => {
    const e = err({ ...base, yFormat: "percnt" });
    expect([e.code, e.path]).toEqual(["invalid-format", "yFormat"]);
    expect(e.message).toMatchInlineSnapshot(`
      "mayacharts: spec.yFormat = "percnt" is not a number format.
        Valid formats: auto, compact, percent, currency.
        Did you mean "percent"?
        -> https://bbekshr.github.io/mayacharts/errors.html#invalid-format"
    `);
  });
  it("invalid-theme", () => {
    const e = err({ ...base, theme: { acent: "red" } });
    expect([e.code, e.path]).toEqual(["invalid-theme", "theme.acent"]);
    expect(e.message).toMatchInlineSnapshot(`
      "mayacharts: spec.theme.acent is not a theme token.
        Valid tokens: font, fontSize, fg, fgMuted, grid, bg, accent, radius, tooltipBg, tooltipFg, focus.
        Did you mean "accent"?
        -> https://bbekshr.github.io/mayacharts/errors.html#invalid-theme"
    `);
  });
  it("unsafe-css-value in theme", () => {
    const e = err({ ...base, theme: { accent: "red; } body { x: y" } });
    expect([e.code, e.path]).toEqual(["unsafe-css-value", "theme.accent"]);
    expect(e.message).toMatchInlineSnapshot(`
      "mayacharts: spec.theme.accent = "red; } body { x: y" is not a safe CSS value.
        Colors and theme values must be plain CSS values (no ; { } < > \\ url() or expression()).
        -> https://bbekshr.github.io/mayacharts/errors.html#unsafe-css-value"
    `);
  });
  it("unsafe-css-value in colors", () => {
    const e = err({ ...base, colors: ["#fff", "URL(http://x)"] });
    expect([e.code, e.path]).toEqual(["unsafe-css-value", "colors[1]"]);
    expect(e.message).toMatchInlineSnapshot(`
      "mayacharts: spec.colors[1] = "URL(http://x)" is not a safe CSS value.
        Colors and theme values must be plain CSS values (no ; { } < > \\ url() or expression()).
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
  it("invalid-option for hidden, unknown-option for options", () => {
    expect(err({ hidden: [1] }, true).code).toBe("invalid-option");
    expect(err({ widht: 1 }, true).code).toBe("unknown-option");
    expect(err(5, true).code).toBe("invalid-option");
  });
});

describe("validateSpec passes", () => {
  it("full valid spec", () => {
    expect(() =>
      validateSpec({
        ...base,
        series: "region",
        stack: true,
        title: "t",
        description: "d",
        legend: true,
        tooltip: true,
        grid: true,
        xAxis: true,
        yAxis: true,
        xLabel: "x",
        yLabel: "y",
        yFormat: "currency",
        locale: "en-US",
        currency: "USD",
        yDomain: [0, 100],
        table: true,
        animate: false,
        colors: ["#fff", "rgb(1,2,3)"],
        theme: { accent: "#123456", font: "system-ui, sans-serif" },
      }),
    ).not.toThrow();
    expect(() => validateOptions(undefined)).not.toThrow();
    expect(() => validateOptions({ width: 100, height: 50, hidden: ["a"] })).not.toThrow();
  });
  it("null/undefined y values", () => {
    expect(() =>
      validateSpec({
        ...base,
        data: [
          { month: "a", revenue: null },
          { month: "b", revenue: undefined },
          { month: "c", revenue: 1 },
        ],
      }),
    ).not.toThrow();
  });
  it("empty data", () => {
    expect(() => validateSpec({ ...base, data: [] })).not.toThrow();
  });
});

describe("did you mean", () => {
  it("stacked -> stack", () => {
    expect(err({ ...base, stacked: true }).message).toContain('Did you mean "stack"?');
  });
  it("revenu -> revenue", () => {
    expect(err({ ...base, y: "revenu" }).message).toContain('Did you mean "revenue"?');
  });
  it("colour/colours -> colors", () => {
    expect(err({ ...base, colour: [] }).message).toContain('Did you mean "colors"?');
    expect(err({ ...base, colours: [] }).message).toContain('Did you mean "colors"?');
  });
});
