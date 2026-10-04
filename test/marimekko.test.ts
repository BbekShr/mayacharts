import { describe, expect, it } from "vitest";
import { render, renderParts } from "../src/index.ts";
import "../src/hierarchy.ts";
import type { ChartSpec } from "../src/core/types.ts";

const regions = ["North", "South", "East"];
const items = ["Tools", "Toys"];
const data = regions.flatMap((r, i) => items.map((t, j) => ({ r, t, v: (i + 1) * 10 * (j + 1) })));
const spec: ChartSpec = { type: "marimekko", x: "r", y: "v", series: "t", data };
const svg = (s: ChartSpec, hidden: string[] = []) => renderParts(s, { view: { hidden } }).svg;
const marks = (s: string) => [...s.matchAll(/<rect data-maya="mark"[^>]*>/g)].map((m) => m[0]);
const num = (m: string, a: string) => Number(m.match(new RegExp(` ${a}="([^"]*)"`))![1]);

describe("marimekko", () => {
  it("one rect per column and segment with payload", () => {
    const m = marks(svg(spec));
    expect(m).toHaveLength(6);
    expect(m[0]).toContain('data-key="Tools~North"');
    expect(m[0]).toContain('data-x="North"');
    expect(m[0]).toContain('data-series="Tools"');
    expect(m[0]).toContain('data-y="10"');
    expect(m[0]).toContain("(33%)");
  });
  it("shows each segment's share of its column, with the series name when tall", () => {
    const s = svg(spec);
    expect(s).toMatch(/data-ink="">33%</);
    expect(s).toMatch(/data-ink="">67%</);
    expect(s).toMatch(/data-ink="n">Tools</);
  });
  it("labels columns with name and share of the grand total", () => {
    const s = svg(spec);
    expect(s).toMatch(/data-col="">North · 17%</);
    expect(s).toMatch(/data-col="">East · 50%</);
  });
  it("draws a 0 to 100% scale with gridlines inside the plot", () => {
    const s = svg(spec);
    for (const t of ["0%", "25%", "50%", "75%", "100%"]) expect(s).toContain(`data-ax="">${t}<`);
    const g = s.match(/<g data-maya="grid"[^>]*>(.*?)<\/g>/)![1]!;
    expect(g.match(/<line /g)).toHaveLength(5);
  });
  it("drops labels gracefully when narrow or turned off", () => {
    const narrow = renderParts(spec, { width: 120, height: 200 }).svg;
    expect(narrow).not.toMatch(/data-col="">North/);
    expect(svg({ ...spec, labels: false })).not.toContain("data-ink");
  });
  it("column width follows column total, segments fill the height", () => {
    const m = marks(svg(spec));
    expect(num(m[2]!, "width") / num(m[0]!, "width")).toBeCloseTo(2, 1);
    expect(num(m[0]!, "height") + num(m[1]!, "height")).toBeCloseTo(
      num(m[2]!, "height") + num(m[3]!, "height"),
      1,
    );
  });
  it("hidden series drops out", () => {
    expect(marks(svg(spec, ["Toys"]))).toHaveLength(3);
    expect(marks(svg(spec, ["Toys", "Tools"]))).toHaveLength(0);
  });
  it("empty, zero and negative values do not throw", () => {
    expect(marks(svg({ ...spec, data: [] }))).toHaveLength(0);
    const m = marks(
      svg({
        ...spec,
        data: [
          { r: "A", t: "x", v: -3 },
          { r: "B", t: "x", v: 5 },
        ],
      }),
    );
    expect(m).toHaveLength(1);
  });
  it("escapes hostile strings", () => {
    const s = svg({ ...spec, data: [{ r: '"><script>x</script>', t: "<b>", v: 1 }] });
    expect(s).not.toContain("<script>");
    expect(s).not.toContain("<b>");
  });
  it("is deterministic", () => {
    expect(render(spec)).toBe(render(spec));
  });
  it("requires series", () => {
    expect(() => render({ type: "marimekko", x: "r", y: "v", data })).toThrow();
  });
});
