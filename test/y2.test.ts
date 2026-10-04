import { describe, expect, it } from "vitest";
import { render, renderParts } from "../src/core/render.ts";
import { shape } from "../src/core/shape.ts";
import { OTHER } from "../src/core/svg.ts";
import { resolve } from "../src/core/validate.ts";
import type { ChartSpec, Row } from "../src/core/types.ts";

const data: Row[] = [
  { m: "a", s: "A", v: 10, u: 1 },
  { m: "a", s: "B", v: 5, u: 3 },
  { m: "b", s: "A", v: 30, u: 4 },
  { m: "c", s: "A", v: 20, u: null },
  { m: "d", s: "A", v: 1, u: 8 },
];
const spec = (o: Partial<ChartSpec> = {}): ChartSpec => ({
  type: "bar",
  data,
  x: "m",
  y: "v",
  y2: "u",
  ...o,
});
const sh = (o: Partial<ChartSpec> = {}) => shape(resolve(spec(o)));

describe("shape y2", () => {
  it("aggregates across series, aligned to categories", () => {
    const s = sh({ series: "s" });
    expect(s.categories).toEqual(["a", "b", "c", "d"]);
    expect(s.y2).toEqual([4, 4, null, 8]);
  });
  it("mean", () => expect(sh({ aggregate: "mean" }).y2[0]).toBe(2));
  it("empty without y2", () => expect(sh({ y2: undefined as never }).y2).toEqual([]));
  it("follows sort", () => {
    const s = sh({ sort: "desc" });
    expect(s.categories).toEqual(["b", "c", "a", "d"]);
    expect(s.y2).toEqual([4, null, 4, 8]);
  });
  it("limit: Other aggregates its rows", () => {
    const s = sh({ sort: "desc", limit: 2 });
    expect(s.categories).toEqual(["b", "c", OTHER]);
    expect(s.y2).toEqual([4, null, 12]);
  });
  it("window", () => {
    const s = shape(resolve(spec()), { window: [1, 2] });
    expect(s.categories).toEqual(["b", "c"]);
    expect(s.y2).toEqual([4, null]);
  });
});

describe("render y2", () => {
  const plain = render(spec({ y2: undefined as never }));
  const svg = render(spec({ titles: { u: "Units" } }));
  it("right axis labels, narrower plot", () => {
    const pw = (x: string) => Number(/data-plot="\S+ \S+ (\S+)/.exec(x)![1]);
    expect(pw(svg)).toBeLessThan(pw(plain));
    expect(svg).toContain('text-anchor="start"');
    expect(svg).toContain("rotate(90");
    expect(svg).toContain("Units");
  });
  it("line path and one circle per non-null category", () => {
    expect(svg).toMatch(/data-maya="line"/);
    const dots = svg.match(/<circle[^>]*>/g)!;
    expect(dots).toHaveLength(3);
    expect(dots[0]).toContain('data-y="4"');
    expect(dots[0]).toContain('data-f="4"');
    expect(dots[0]).toContain('data-series="Units"');
    expect(dots[0]).toContain('data-s="1"');
  });
  it("null gap breaks the path", () => {
    const d = /<path[^>]*data-maya="line"[^>]* d="([^"]*)"/.exec(svg)![1]!;
    expect(d.match(/M/g)).toHaveLength(2);
  });
  it("hits for points", () => {
    expect(svg.match(/data-maya="hit"[^>]*data-series="Units"/g)).toHaveLength(3);
  });
  it("legend: bar measure and line", () => {
    const l = renderParts(spec({ titles: { u: "Units", v: "Sales" } })).legend;
    expect(l).toContain('<span data-s="0"><i></i>Sales</span>');
    expect(l).toContain('<span data-s="1" data-line><i></i>Units</span>');
    expect(l).not.toContain("<button");
  });
  it("series: buttons plus line entry; line slot after series", () => {
    const p = renderParts(spec({ series: "s" }));
    expect(p.legend.match(/<button/g)).toHaveLength(2);
    expect(p.legend).toContain('data-s="2" data-line');
    expect(p.svg).toContain('data-series="u"');
    expect(p.svg).toContain('data-s="2"');
  });
  it("drill keeps y2", () => {
    const rows = [
      { r: "x", m: "a", v: 1, u: 5 },
      { r: "x", m: "b", v: 2, u: 6 },
      { r: "y", m: "c", v: 3, u: 7 },
    ];
    const s = {
      ...spec({ data: rows, path: ["r", "m"], drill: true }),
      x: undefined,
    } as unknown as ChartSpec;
    const p = renderParts(s, { view: { drill: ["x"] } });
    expect(p.svg).toMatch(/data-maya="line"/);
    expect(p.svg.match(/<circle/g)).toHaveLength(2);
  });
  it("deterministic", () => expect(render(spec())).toBe(render(spec())));
});
