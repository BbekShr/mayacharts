import { describe, expect, it } from "vitest";
import { renderParts } from "../src/index.ts";
import type { ChartSpec } from "../src/core/types.ts";

const data = [
  { p: "Yosemite jacket", t: "Jackets", sales: 14.5, vs: 0.1, m: "Jan", ch: 4 },
  { p: "Yosemite jacket", t: "Jackets", sales: 0, vs: 0.1, m: "Feb", ch: -2 },
  { p: "Synch vest", t: "Vests", sales: 13.7, vs: -0.01, m: "Jan", ch: -1 },
  { p: "Synch vest", t: "Vests", sales: 0, vs: -0.01, m: "Feb", ch: 3 },
  { p: "High tide vest", t: "Vests", sales: 12.6, vs: -0.08, m: "Jan", ch: 0 },
  { p: "Aero shell", t: "Jackets", sales: 9, vs: 0.03, m: "Jan", ch: 2 },
];
const base: ChartSpec = { type: "table", x: "p", y: ["sales", "vs"], data };
const draw = (s: Partial<ChartSpec>, o = {}) =>
  renderParts({ ...base, ...s } as ChartSpec, { width: 520, height: 320, ...o });
const count = (s: string, re: RegExp) => s.match(re)?.length ?? 0;

describe("table #84", () => {
  it("pages: slices to shown, a Show more button, content height", () => {
    const p = draw({ page: 2 });
    expect(count(p.svg, /data-td="label"/g)).toBe(2);
    expect(p.svg).toContain('data-maya="more"');
    expect(p.svg).toContain('role="button" tabindex="0"');
    expect(p.svg).toContain("Show 2 more");
    expect(p.svg).toContain("data-scroll");
    expect(p.svg).toMatch(/<svg[^>]* height="(?!320")/);
    const all = draw({ page: 2 }, { view: { page: 2 } });
    expect(count(all.svg, /data-td="label"/g)).toBe(4);
    expect(all.svg).not.toContain('data-maya="more"');
  });
  it("scroll draws every row and wraps the header in thead", () => {
    const p = draw({ scroll: true });
    expect(count(p.svg, /data-td="label"/g)).toBe(4);
    expect(p.svg).toContain('data-maya="thead"');
    expect(p.svg).toMatch(/<g data-maya="thead">.*data-maya="sort" data-field="p"/);
  });
  it("dimension columns: first value per row, sortable", () => {
    const p = draw({ columns: ["t"] }, { view: { sortBy: ["t", "asc"] } });
    expect(p.svg).toContain('data-field="t"');
    expect(p.svg).toContain("Vests");
    const order = [...p.svg.matchAll(/data-td="label">([^<]+)</g)].map((m) => m[1]);
    expect(order.slice(0, 2).sort()).toEqual(["Aero shell", "Yosemite jacket"]);
    expect(p.table).toContain("Jackets");
  });
  it("diverging bars grow from a centre line and carry up and down", () => {
    const p = draw({ bars: { vs: "diverging", sales: "none" } });
    expect(p.svg).toContain('data-way="up"');
    expect(p.svg).toContain('data-way="down"');
    expect(p.svg).toContain("data-centre");
    expect(p.svg).not.toContain('data-maya="mark" data-key="sales~');
    expect(count(p.svg, /data-maya="mark" data-key="vs~/g)).toBe(4);
  });
  it("the centre line runs only through each bar band, never through the value text", () => {
    const p = draw({ bars: { vs: "diverging", sales: "none" } });
    const lines = [...p.svg.matchAll(/<line [^>]*data-centre[^>]*>/g)].map((m) => m[0]);
    expect(lines).toHaveLength(4);
    const ys = (l: string) => [+l.match(/y1="([\d.]+)"/)![1]!, +l.match(/y2="([\d.]+)"/)![1]!];
    const texts = [...p.svg.matchAll(/<text data-key="v~vs~[^>]* y="([\d.]+)"/g)].map(
      (m) => +m[1]!,
    );
    expect(texts).toHaveLength(4);
    lines.forEach((l, i) => {
      const [a, b] = ys(l);
      expect(b! - a!).toBeLessThan(14);
      expect(texts[i]!).toBeLessThan(a!); // the text baseline-centre sits above the segment
    });
  });
  it("strips: one toned square per month, spoken in the data table", () => {
    const p = draw({ cells: { Form: { type: "strip", field: "ch", by: "m", last: 2 } } });
    expect(count(p.svg, /data-key="s~Form~Yosemite%20jacket/g)).toBe(2);
    expect(p.svg).toContain('data-way="up"');
    expect(p.svg).toContain('data-way="down"');
    expect(p.svg).toContain('data-way="zero"');
    expect(p.table).toContain("Jan +4");
    expect(p.table).toContain("Feb -2");
    expect(p.table).toContain("Form");
  });
  it("expand: rows below move down by the sub-chart and the row says it is open", () => {
    const s = { expand: { type: "bar", x: "m", y: "ch" } } as Partial<ChartSpec>;
    const top = (svg: string, name: string) => {
      const m = svg.match(new RegExp(`data-key="t~${name}" x="[\\d.]+" y="([\\d.]+)"`));
      return +m![1]!;
    };
    const shut = draw(s, { view: { expanded: "" } }).svg;
    const open = draw(s, { view: { expanded: "Yosemite jacket" } }).svg;
    expect(shut).toContain('aria-expanded="false"');
    expect(open).toContain('aria-expanded="true"');
    expect(top(open, "Synch%20vest") - top(shut, "Synch%20vest")).toBeGreaterThan(60);
    expect(top(open, "Yosemite%20jacket")).toBe(top(shut, "Yosemite%20jacket"));
    expect(draw({}).svg).not.toContain("aria-expanded");
  });
  it("a narrow tile drops the rightmost columns, text columns included", () => {
    const wide = draw({ columns: ["t"], cells: { F: { type: "strip", field: "ch", by: "m" } } });
    const narrow = draw(
      { columns: ["t"], cells: { F: { type: "strip", field: "ch", by: "m" } } },
      { width: 200 },
    );
    expect(count(wide.svg, /data-key="v~/g)).toBeGreaterThan(count(narrow.svg, /data-key="v~/g));
    expect(narrow.svg).not.toContain('data-key="s~F');
  });
});

describe("table pager key", () => {
  it("keys the pager text whether or not a row is open", () => {
    const s = { page: 2, expand: { type: "bar", x: "m", y: "ch" } } as Partial<ChartSpec>;
    for (const view of [{}, { expanded: "Yosemite jacket" }])
      expect(draw(s, { view }).svg).toContain('<text data-key="more" data-maya="more"');
  });
});
