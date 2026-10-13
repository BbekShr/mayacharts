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
  it("end labels are repelled, never dropped", () => {
    const flat = regions.flatMap((region) => [{ region, sales: 10, units: 10, margin: 3 }]);
    const s = render({ ...spec, data: flat });
    const ys = [
      ...s.matchAll(/<text x="[\d.]+" y="([\d.]+)" text-anchor="start" dominant-baseline/g),
    ].map((m) => +m[1]!);
    expect(ys).toHaveLength(4);
    ys.sort((a, b) => a - b).forEach(
      (y, i) => i && expect(y - ys[i - 1]!).toBeGreaterThanOrEqual(13),
    );
  });
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

describe("parallel end labels", () => {
  it("name a line at the last axis", () => {
    const svg = renderParts(spec).svg;
    const g = svg.slice(svg.indexOf('data-maya="labels"'));
    expect(g).toMatch(/text-anchor="start"[^>]*>(North|South|East|West)</);
  });
});

describe("parallel axes follow the data extent", () => {
  it("values 95..99 give ticks that do not start at 0", () => {
    const data = [95, 97, 99].map((v, i) => ({ region: "r" + i, sales: v, units: v, margin: v }));
    const s = render({ ...spec, data });
    const ticks = [...s.matchAll(/<text[^>]*text-anchor="end"[^>]*>([^<]*)</g)].map((m) => m[1]);
    expect(ticks.length).toBeGreaterThan(2);
    expect(ticks).not.toContain("0");
    expect(ticks).toContain("94");
  });
});

describe("parallel brush", () => {
  const b: ChartSpec = { ...spec, brush: true };
  const lineTags = (s: string) => tags(s, 'path data-maya="line"');
  it("lines outside every range get data-off, on the path and its dots", () => {
    // Sales are summed per region: 30, 31, 32, 33.
    const s = renderParts(b, { view: { brush: [["sales", 0, 100]] } }).svg;
    expect(s).not.toContain("data-off");
    const tight = renderParts(b, { view: { brush: [["sales", 30.5, 31.5]] } }).svg;
    expect(lineTags(tight).filter((t) => t.includes("data-off"))).toHaveLength(3);
    expect(
      tags(tight, 'circle data-maya="mark"').filter((t) => t.includes("data-off")).length,
    ).toBe(9);
  });
  it("ranges combine with AND and draw as data-range rects in the cross group", () => {
    const s = renderParts(b, {
      view: {
        brush: [
          ["sales", 29.5, 31.5],
          ["units", 0, 200],
        ],
      },
    });
    expect(lineTags(s.svg).filter((t) => t.includes("data-off"))).toHaveLength(3);
    const cross = s.svg.match(/<g data-maya="cross">(.*?)<\/g>/s)![1]!;
    expect(cross.match(/<rect data-range/g)).toHaveLength(2);
    expect(cross).toContain('data-field="sales"');
  });
  it("nothing is faded or drawn without a range, or without spec.brush", () => {
    expect(lineTags(render(b)).some((t) => t.includes("data-off"))).toBe(false);
    expect(render(spec, { view: { brush: [["sales", 1, 2]] } })).not.toContain("<rect data-range");
  });
  it("an axis strip per measure with spec.brush, none without", () => {
    expect(tags(render(b), 'rect data-maya="axis"')).toHaveLength(3);
    expect(render(spec)).not.toContain('data-maya="axis"');
  });
});
