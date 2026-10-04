import { describe, expect, it } from "vitest";
import { render, renderParts } from "../src/index.ts";
import type { ChartSpec } from "../src/core/types.ts";

const regions = ["North", "South", "East", "West"];
const data = regions.flatMap((region, i) => [
  { region, grp: i % 2 ? "b" : "a", sales: 10 + i, units: 100 * (i + 1), margin: 5 - i },
  { region, grp: i % 2 ? "b" : "a", sales: 20, units: 50, margin: 1 },
]);
const spec: ChartSpec = { type: "parallel", x: "region", y: ["sales", "units", "margin"], data };
const tags = (s: string, re: string) =>
  [...s.matchAll(new RegExp(`<${re}[^>]*>`, "g"))].map((m) => m[0]);

describe("parallel", () => {
  it("one line per category, one point per measure, keyed", () => {
    const s = render(spec);
    const lines = tags(s, 'path data-maya="line"');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain('data-key="l~North"');
    expect(lines[0]).toContain('data-s="0"');
    const pts = tags(s, 'circle data-maya="mark"');
    expect(pts).toHaveLength(12);
    expect(pts[0]).toContain('data-key="North~sales"');
    expect(pts[0]).toContain('data-series="sales"');
    expect(pts[0]).toContain('data-x="North"');
    expect(pts[0]).toContain('data-y="30"'); // sum of 10 + 20
    expect(pts[0]).toContain('data-c="0"');
    expect(tags(s, 'path data-maya="hit"')).toHaveLength(4);
  });
  it("aggregate applies per measure", () => {
    const s = render({ ...spec, aggregate: "max" });
    expect(tags(s, 'circle data-maya="mark"')[0]).toContain('data-y="20"');
  });
  it("series picks the colour slot from the line's first row", () => {
    const s = render({ ...spec, series: "grp" });
    expect(tags(s, 'path data-maya="line"').map((t) => t.match(/data-s="(\d)"/)![1])).toEqual([
      "0",
      "1",
      "0",
      "1",
    ]);
    const h = renderParts(spec.series ? spec : { ...spec, series: "grp" }, {
      view: { hidden: ["b"] },
    }).svg;
    expect(tags(h, 'path data-maya="line"')).toHaveLength(2);
  });
  it("draws an axis title per measure and marks hold only keyed children", () => {
    const s = render({ ...spec, titles: { sales: "Sales ($)" } });
    expect(s).toContain(">Sales ($)<");
    expect(s).toContain(">units<");
    const g = s.match(/<g data-maya="marks">(.*?)<\/g>/s)![1]!;
    expect(g.match(/<\w+ /g)!.length).toBe(g.match(/data-key=/g)!.length);
  });
  it("nulls break the line, empty data and one row render", () => {
    const n = render({
      ...spec,
      data: [{ region: "A", sales: 1, units: null, margin: 3 }],
    });
    expect(tags(n, 'circle data-maya="mark"')).toHaveLength(2);
    expect(() => render({ ...spec, data: [] })).not.toThrow();
    expect(tags(render({ ...spec, data: data.slice(0, 1) }), 'path data-maya="line"')).toHaveLength(
      1,
    );
  });
  it("negative values and zero everywhere do not produce NaN", () => {
    const s = render({
      ...spec,
      data: [
        { region: "A", sales: -5, units: 0, margin: 0 },
        { region: "B", sales: 5, units: 0, margin: 0 },
      ],
    });
    expect(s).not.toMatch(/NaN|Infinity/);
  });
  it("escapes hostile categories and is deterministic", () => {
    const bad = { ...spec, data: [{ region: '<img onerror="x">', sales: 1, units: 2, margin: 3 }] };
    const s = render(bad);
    expect(s).not.toContain("<img");
    expect(render(bad)).toBe(s);
  });
  it("needs an array of at least 2 measures", () => {
    expect(() => render({ ...spec, y: "sales" })).toThrow();
  });
});
