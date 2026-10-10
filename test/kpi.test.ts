import { describe, expect, it } from "vitest";
import { render, renderParts } from "../src/index.ts";
import type { ChartSpec } from "../src/core/types.ts";

const months = ["Jan", "Feb", "Mar", "Apr"];
const base: ChartSpec = {
  type: "kpi",
  x: "m",
  y: "v",
  data: months.map((m, i) => ({ m, v: [100, 80, 90, 110][i]! })),
};
const svg = (s: ChartSpec, o = {}) => renderParts(s, { width: 300, height: 220, ...o }).svg;
const headline = (s: string) =>
  s.match(/<text data-maya="mark" data-key="v"[^>]*>([^<]*)<\/text>/)!;
const delta = (s: string) => s.match(/<text [^>]*data-kpi="delta"[^>]*>([^<]*)<\/text>/);

describe("kpi", () => {
  it("headline is the last category", () => {
    const h = headline(svg(base));
    expect(h[0]).toContain('data-y="110"');
    expect(h[0]).not.toContain("data-c");
    expect(h[0]).toContain('data-x="Apr"');
  });
  it("without x it aggregates all rows", () => {
    const s = svg({ type: "kpi", y: "v", data: base.data });
    expect(headline(s)[0]).toContain('data-y="380"');
    expect(s).not.toContain('data-maya="line"');
    expect(svg({ type: "kpi", y: "v", aggregate: "mean", data: base.data })).toContain(
      'data-y="95"',
    );
  });
  it("delta text and tone", () => {
    const up = delta(svg(base))!;
    expect(up[0]).toContain('data-tone="good"');
    expect(up[1]).toBe("+22.2% vs Mar");
    const down = delta(svg({ ...base, data: base.data.slice(0, 2) }))!;
    expect(down[0]).toContain('data-tone="bad"');
    expect(down[1]).toBe("\u221220% vs Jan");
  });
  it("no delta for a single category or a zero previous", () => {
    expect(delta(svg({ ...base, data: base.data.slice(0, 1) }))).toBeNull();
    expect(
      delta(
        svg({
          ...base,
          data: [
            { m: "a", v: 0 },
            { m: "b", v: 5 },
          ],
        }),
      ),
    ).toBeNull();
  });
  it("the hit covers the sparkline band only and the dots come before the headline", () => {
    const s = svg(base);
    const hit = s.match(/<rect data-maya="hit"[^>]*y="([\d.]+)"[^>]*height="([\d.]+)"/)!;
    expect(+hit[1]!).toBeGreaterThan(40);
    expect(+hit[1]! + +hit[2]!).toBeLessThan(220);
    expect(s.indexOf("<circle")).toBeLessThan(s.indexOf('data-key="v"'));
  });
  it("sparkline only with 3 or more categories", () => {
    const s = svg(base);
    expect(s).toContain('data-maya="line"');
    expect(s.match(/<circle /g)).toHaveLength(4);
    expect(s.match(/data-maya="hit"/g)).toHaveLength(1); // one plot-wide hit
    expect(s.match(/data-last=""/g)).toHaveLength(1);
    const two = svg({ ...base, data: base.data.slice(0, 2) });
    expect(two).not.toContain('data-maya="line"');
    expect(two).not.toContain("<circle");
  });
  it("target bullet tone and text", () => {
    const above = svg({ ...base, colorBy: { target: 100 } });
    expect(above).toContain('data-kpi="fill"');
    expect(above).toMatch(/data-kpi="fill" data-tone="good"/);
    expect(above).toContain(">110% of target 100<");
    const below = svg({ ...base, colorBy: { target: 200 } });
    expect(below).toMatch(/data-kpi="fill" data-tone="bad"/);
    expect(below).toContain(">55% of target 200<");
  });
  it("bullet wins in a short box", () => {
    const s = svg({ ...base, colorBy: { target: 100 } }, { height: 110 });
    expect(s).toContain('data-kpi="fill"');
    expect(s).not.toContain('data-maya="line"');
  });
  it("y array shows every measure together, never a measure toggle", () => {
    const spec: ChartSpec = {
      ...base,
      y: ["v", "w"],
      data: base.data.map((r) => ({ ...r, w: 7 })),
    };
    const p = renderParts(spec, { width: 300, height: 220 });
    expect(p.controls).toBe("");
    expect(headline(p.svg)[0]).toContain('data-y="110"');
    // Contract: one table column per measure (shape gives each measure's cells, si = measure index).
    expect(p.table).toContain("<th>v</th><th>w</th>");
  });
  it("all null shows no data", () => {
    const s = svg({ ...base, data: base.data.map((r) => ({ ...r, v: null })) });
    expect(s).toContain("No data");
  });
  it("is deterministic", () => {
    expect(svg(base)).toBe(svg(base));
    expect(render(base)).toBe(render(base));
  });
  it("escapes hostile strings in x", () => {
    const evil = '"><script>alert(1)</script>';
    const s = svg({ ...base, data: base.data.map((r, i) => (i === 3 ? { ...r, m: evil } : r)) });
    expect(s).not.toContain("<script>");
    expect(s).toContain("&lt;script&gt;");
  });
  it("validate: kpi without x passes, colorBy sign fails", () => {
    expect(() => renderParts({ type: "kpi", y: "v", data: base.data })).not.toThrow();
    expect(() => renderParts({ ...base, colorBy: "sign" })).toThrow(/option-unsupported|colorBy/);
  });
});

describe("kpi period caption", () => {
  it("is right-aligned over the sparkline's last point", () => {
    const t = svg(base).match(/<text[^>]*data-kpi="period"[^>]*>/)![0];
    expect(t).toContain('text-anchor="end"');
  });
});
