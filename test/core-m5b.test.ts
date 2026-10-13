import { describe, expect, it } from "vitest";
import { renderParts } from "../src/core/render.ts";
import "../src/hierarchy.ts";
import { addThemes } from "../src/core/registry.ts";
import { MayaSpecError } from "../src/core/validate.ts";
import type { ChartSpec } from "../src/core/types.ts";

const P = (s: object, view?: object) =>
  renderParts(s as ChartSpec, { width: 520, height: 320, ...(view && { view }) } as never);

describe("M5 core leftovers", () => {
  it("a drilled marimekko has no slot legend; the root keeps it", () => {
    const data = ["E", "W"].flatMap((region) =>
      ["Tops", "Shoes"].flatMap((family) =>
        ["a", "b"].map((item, i) => ({ region, family, item, sales: 10 + i })),
      ),
    );
    const spec = {
      type: "marimekko",
      path: ["region", "family", "item"],
      y: "sales",
      drill: true,
      data,
    };
    expect(P(spec).legend).toContain("maya-legend");
    expect(P(spec, { drill: ["W"] }).legend).toBe("");
  });
  it("heatmap column headers that drill further end in a chevron; the last level does not", () => {
    const data = ["N", "S"].flatMap((region) =>
      ["a", "b"].flatMap((family) =>
        ["x", "y"].flatMap((product) =>
          ["t1", "t2"].map((itemType, k) => ({ region, family, product, itemType, v: 1 + k })),
        ),
      ),
    );
    const spec = {
      type: "heatmap",
      path: ["region", "itemType"],
      xPath: ["family", "product"],
      y: "v",
      drill: true,
      data,
    };
    expect(P(spec).svg).toMatch(/data-maya="axis-x".*a ›/);
    const leaf = P(spec, { xDrill: ["a"] }).svg;
    expect(leaf.match(/data-maya="axis-x".*?<\/g>/)![0]).not.toContain("›");
  });
  it("the kpi back face does not build Other", () => {
    const months = Array.from({ length: 6 }, (_, i) => ({ month: `m${i}`, sales: 10 + i }));
    const spec = {
      type: "kpi",
      x: "month",
      y: "sales",
      data: months,
      back: { type: "bar", x: "month", y: "sales", horizontal: true, sort: "desc", limit: 3 },
    };
    expect(P(spec, { face: "back" }).svg).not.toContain("Other");
  });
  it("rowsOf is a text key", async () => {
    const { TEXT } = await import("../src/core/strings.ts");
    expect(TEXT.rowsOf).toBe("{0} of {1}");
  });

  it("drillTo was previous with no shared x drops was instead of failing", () => {
    const data = [
      { m: "Jan", y: "2024", v: 1 },
      { m: "Feb", y: "2024", v: 2 },
      { m: "Mar", y: "2025", v: 3 },
    ];
    const spec = {
      type: "line",
      x: "m",
      y: "v",
      series: "y",
      drillTo: { type: "bar", x: "m", y: "v", was: "previous" },
      data,
    };
    const svg = P(spec, { drill: ["2025"] }).svg;
    expect(svg).toContain("<svg");
    expect(svg).not.toContain("data-past");
  });
  it("a registry theme is checked again when read", () => {
    addThemes({ evil: { accent: "red; background:url(javascript:alert(1))" } as never });
    const spec = { type: "bar", x: "c", y: "v", theme: "evil", data: [{ c: "a", v: 1 }] };
    expect(() => P(spec)).toThrow(MayaSpecError);
  });
  it("back takes the options a sub-chart cannot use, like expand and drillTo", () => {
    const spec = {
      type: "kpi",
      x: "c",
      y: "v",
      back: { type: "bar", x: "c", y: "v", drill: true },
      data: [{ c: "a", v: 1 }],
    };
    expect(() => P(spec)).toThrow(/back\.drill/);
  });
  it("deeply nested or cyclic options throw MayaSpecError, not RangeError", () => {
    const deep = (key: string) => {
      const root: Record<string, unknown> = {};
      let o = root;
      for (let i = 0; i < 20000; i++) o = (o[key] = {}) as Record<string, unknown>;
      return root;
    };
    const base = { type: "kpi", x: "c", y: "v", data: [{ c: "a", v: 1 }] };
    for (const extra of [{ back: deep("back") }, { format: deep("a") }, { colors: deep("a") }])
      expect(() => P({ ...base, ...extra })).toThrow(MayaSpecError);
    const cyc: Record<string, unknown> = {};
    cyc.a = cyc;
    expect(() => P({ ...base, format: cyc })).toThrow(MayaSpecError);
  });
});
