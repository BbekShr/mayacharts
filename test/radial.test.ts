import { describe, expect, it } from "vitest";
import { renderParts } from "../src/index.ts";
import "../src/radial.ts";
import type { ChartSpec } from "../src/core/types.ts";

const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const data = M.flatMap((m, i) => ["N", "S"].map((r, j) => ({ m, r, v: 10 + i + j * 5 })));
const spec: ChartSpec = { type: "radial", x: "m", y: "v", series: "r", data };
const svg = (s: ChartSpec, hidden?: string[]) =>
  renderParts(s, hidden ? { view: { hidden } } : {}).svg;
const plain = (data: ChartSpec["data"], more: Partial<ChartSpec> = {}): ChartSpec => ({
  type: "radial",
  x: "m",
  y: "v",
  data,
  ...more,
});
const tags = (s: string, re: string) =>
  [...s.matchAll(new RegExp(`<${re}[^>]*>`, "g"))].map((m) => m[0]);
const marks = (s: string) => tags(s, 'path data-maya="mark"');

describe("radial", () => {
  it("one sector per category and series with payload", () => {
    const m = marks(svg(spec));
    expect(m).toHaveLength(24);
    expect(m[0]).toContain('data-key="N~Jan"');
    expect(m[0]).toContain('data-x="Jan"');
    expect(m[0]).toContain('data-s="0"');
    expect(m[1]).toContain('data-s="1"');
    expect(m[1]).toContain('data-y="15"');
  });
  it("marks group holds only keyed children", () => {
    const g = svg(spec).match(/<g data-maya="marks">(.*?)<\/g>/s)![1]!;
    expect(g.match(/<\w+ /g)!.length).toBe(g.match(/data-key=/g)!.length);
  });
  it("without series uses slot 0", () => {
    const m = marks(svg(plain(data.filter((d) => d.r === "N"))));
    expect(m).toHaveLength(12);
    expect(m.every((t) => t.includes('data-s="0"'))).toBe(true);
  });
  it("hidden series drops its sectors", () => {
    expect(marks(svg(spec, ["S"]))).toHaveLength(12);
  });
  it("draws rings and a label per month at 390x300", () => {
    const s = renderParts(spec, { width: 390, height: 300 }).svg;
    const rings = tags(s, "circle").filter((c) => !c.includes("data-disc"));
    expect(rings.length).toBeGreaterThan(0);
    expect(rings.length).toBeLessThanOrEqual(3);
    expect(tags(s, "text[^>]*data-cat").length).toBe(12);
  });
  it("centre shows the title and the grand total", () => {
    const s = renderParts({ ...spec, titles: { v: "Volume" } }, { width: 600, height: 480 }).svg;
    const t = s.match(/<text[^>]*data-total[^>]*>([^<]*)</)![1];
    expect(t).toBe(String(data.reduce((a, d) => a + d.v, 0)));
    expect(s).toMatch(/data-ring[^>]*>Volume</);
    expect(svg(plain([{ m: "A", v: 5 }]))).toMatch(/data-ring[^>]*>v</);
  });
  it("categories share data-c so a stack lights together", () => {
    const m = marks(svg(spec));
    expect(m[0]).toContain('data-c="0"');
    expect(m[1]).toContain('data-c="0"');
    expect(m[2]).toContain('data-c="1"');
  });
  it("outermost ring is labelled and clear of the bars' angular span", () => {
    const s = renderParts(spec, { width: 600, height: 480 }).svg;
    expect(tags(s, "text[^>]*data-ring").length).toBeGreaterThan(1);
  });
  it("many categories run labels along the radius", () => {
    const many = Array.from({ length: 24 }, (_, i) => ({ m: `Category ${i}`, v: 1 + i }));
    const s = svg(plain(many.concat(many.map((d) => ({ ...d, r: "b" }))), { series: "r" }));
    expect(tags(s, "text[^>]*data-cat")[0]).toContain("rotate(");
    expect(s).not.toContain("NaN");
  });
  it("stack totals sit at the tips; one series names its bars inside", () => {
    const s = renderParts(spec, { width: 600, height: 480 }).svg;
    expect(tags(s, "text[^>]*data-(tip|name)")).toHaveLength(12);
    expect(s).toContain("data-tip");
    const one = renderParts(plain(data.filter((d) => d.r === "N")), {
      width: 600,
      height: 480,
    }).svg;
    expect(tags(one, "text[^>]*data-cat")).toHaveLength(0);
    expect(tags(one, "text[^>]*data-name").length).toBeGreaterThan(0);
  });
  it("the centre total is a keyed text mark that is not a category", () => {
    const t = tags(svg(spec), 'text data-maya="mark"');
    expect(t).toHaveLength(1);
    expect(t[0]).toContain('data-key="t"');
    expect(t[0]).not.toContain("data-c=");
  });
  it("thin sectors get hit paths", () => {
    const tiny = { ...spec, data: [...data, { m: "Z", r: "N", v: 0.001 }] };
    expect(tags(svg(tiny), 'path data-maya="hit"').length).toBeGreaterThan(0);
  });
  it("sort orders categories", () => {
    const s = svg(
      plain(
        data.filter((d) => d.r === "N"),
        { sort: "desc" },
      ),
    );
    expect(marks(s)[0]).toContain("Dec");
  });
  it("empty, single row, nulls and zeros do not throw", () => {
    expect(() => svg({ ...spec, data: [] })).not.toThrow();
    expect(marks(svg(plain([{ m: "A", v: 5 }])))).toHaveLength(1);
    const z = svg(
      plain([
        { m: "A", v: 0 },
        { m: "B", v: null },
      ]),
    );
    expect(z).not.toContain("NaN");
  });
  it("escapes hostile categories", () => {
    const s = svg(plain([{ m: '<img onerror="x">', v: 3 }]));
    expect(s).not.toContain("<img");
  });
  it("is deterministic", () => {
    expect(svg(spec)).toBe(svg(spec));
  });
  it("rejects a missing y", () => {
    expect(() => svg({ ...spec, y: undefined } as never)).toThrow();
  });
  it("a year shared by every date is stated once, in the centre", () => {
    const dated = M.map((m, i) => ({ m: `2025-${String(i + 1).padStart(2, "0")}-01`, v: 5 + i }));
    const out = svg({ ...plain(dated), format: { m: "month" } });
    expect(out).not.toMatch(/>Jan 2025</);
    expect(out).toMatch(/>Jan</);
    expect(out).toMatch(/2025</);
  });
});
