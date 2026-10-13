import { describe, expect, it } from "vitest";
import { render, renderParts } from "../src/index.ts";
import type { ChartSpec } from "../src/core/types.ts";

const cols = ["a", "b", "c", "d"];
const rows = ["r1", "r2", "r3"];
const data = rows.flatMap((r, j) =>
  cols.flatMap((x, i) => (r === "r2" && x === "b" ? [] : [{ x, r, v: j * 4 + i }])),
);
const spec: ChartSpec = { type: "heatmap", x: "x", y: "v", series: "r", data };
const marks = (svg: string) => svg.match(/<rect data-maya="mark"[^>]*>/g) ?? [];

describe("heatmap", () => {
  it("draws one rect per non-null cell, none for missing", () => {
    const m = marks(render(spec));
    expect(m).toHaveLength(11);
    expect(m.some((t) => t.includes('data-series="r2"') && t.includes('data-x="b"'))).toBe(false);
    expect(m.every((t) => !t.includes("data-s="))).toBe(true);
  });
  it("buckets data-q across 0..9", () => {
    const qs = marks(render(spec)).map((t) => Number(/data-q="(\d)"/.exec(t)![1]));
    expect(Math.min(...qs)).toBe(0);
    expect(Math.max(...qs)).toBe(9);
  });
  it("labels on by default at large sizes, off at small, off when false", () => {
    const big = render(spec, { width: 800, height: 400 });
    expect(big).toMatch(/data-maya="labels"><text/);
    expect(render(spec, { width: 100, height: 60 })).toMatch(/data-maya="labels"><\/g>/);
    expect(render({ ...spec, labels: false }, { width: 800, height: 400 })).toMatch(
      /data-maya="labels"><\/g>/,
    );
  });
  it("a value too wide for its cell falls back to 2 significant digits", () => {
    const wide: ChartSpec = {
      ...spec,
      format: "compact",
      data: data.map((d) => ({ ...d, v: d.v * 1e6 + 234567 })),
    };
    const labels = (w: number) =>
      render(wide, { width: w, height: 200 }).match(/<text[^>]*data-in[^>]*>([^<]*)</g) ?? [];
    expect(labels(520).some((t) => /\d\.\d+M</.test(t))).toBe(true);
    // Heatmap bands have no padding (M4), so the fallback starts below 200 px.
    const tight = labels(170);
    expect(tight.length).toBeGreaterThan(0);
    expect(tight.every((t) => !/\d\.\d+M</.test(t))).toBe(true);
  });
  it("renders a ramp legend with formatted extent", () => {
    const html = renderParts(spec).legend;
    expect(html).toContain("data-maya");
  });
  it("handles __proto__ as a row name", () => {
    const s: ChartSpec = {
      ...spec,
      data: [
        { x: "a", r: "__proto__", v: 1 },
        { x: "b", r: "__proto__", v: 2 },
      ],
    };
    expect(marks(render(s))).toHaveLength(2);
    expect(render(s)).toContain('data-series="__proto__"');
  });
  it("snapshot", () => {
    const tiny: ChartSpec = {
      type: "heatmap",
      x: "x",
      y: "v",
      series: "r",
      data: [
        { x: "a", r: "r1", v: 1 },
        { x: "b", r: "r1", v: 3 },
      ],
    };
    expect(marks(render(tiny, { width: 200, height: 100 }))).toMatchInlineSnapshot(`
      [
        "<rect data-maya="mark" data-hm="" data-key="r1~a" data-c="0" data-x="a" data-series="r1" data-y="1" data-f="1" data-q="0" x="33.4" y="11" width="75.8" height="64"/>",
        "<rect data-maya="mark" data-hm="" data-key="r1~b" data-c="1" data-x="b" data-series="r1" data-y="3" data-f="3" data-q="9" x="111.2" y="11" width="75.8" height="64"/>",
      ]
    `);
  });
  it("labels repeat their cell's ramp step so the ink follows the fill (data-ink a)", () => {
    const svg = render(spec, { width: 800, height: 400 });
    const t = svg.match(/<text [^>]*data-in[^>]*>/g) ?? [];
    const q = marks(svg).map((m) => /data-q="(\d)"/.exec(m)![1]);
    expect(t.length).toBe(11);
    expect(t.every((x) => x.includes('data-ink="a"'))).toBe(true);
    expect(t.map((x) => /data-q="(\d)"/.exec(x)![1]).sort()).toEqual([...q].sort());
  });
  it("cells fill their band (not forced square); a cell under 8 px drops its 1 px outline", () => {
    const wh = (svg: string) => {
      const t = marks(svg)[0]!;
      return [/ width="([\d.]+)"/, / height="([\d.]+)"/].map((re) => Number(re.exec(t)![1]));
    };
    const [w, h] = wh(render(spec, { width: 400, height: 400 }));
    expect(w).not.toBe(h);
    const small = wh(render(spec, { width: 160, height: 400 }));
    expect(small[0]).toBeLessThan(small[1]!);
    expect(renderParts(spec).legend).toContain("<b>v</b>");
    const tiny = render(spec, { width: 70, height: 400 });
    expect(marks(tiny)[0]).toContain('stroke-width="0"');
    expect(marks(render(spec, { width: 800, height: 400 }))[0]).not.toContain("stroke-width");
  });
});

describe("heatmap encodings", () => {
  const skew = (extra: object = {}): ChartSpec => ({
    ...spec,
    data: [1, 2, 3, 4, 5, 6, 7, 8, 9, 100].map((v, i) => ({ x: `c${i}`, r: "r", v })),
    ...extra,
  });
  const qs = (s: ChartSpec) => marks(render(s)).map((t) => +/data-q="(\d)"/.exec(t)![1]!);
  it("colorScale rank spreads a skewed ramp over every step; linear crushes it", () => {
    expect(new Set(qs(skew())).size).toBeLessThan(3);
    expect(new Set(qs(skew({ colorScale: "rank" }))).size).toBe(10);
  });
  it("quantile uses five classes and the legend shows the breaks between five swatches", () => {
    const s = renderParts(skew({ colorScale: "quantile" }));
    expect(new Set(qs(skew({ colorScale: "quantile" })))).toEqual(new Set([0, 2, 5, 7, 9]));
    expect(s.legend.match(/<i data-q="\d"><\/i>/g)).toHaveLength(5);
    expect(s.legend.match(/<span>/g)).toHaveLength(6);
  });
  it("a diverging ramp centres rampMid on rampMidValue", () => {
    const d = [-10, -5, 0, 5, 10].map((v, i) => ({ x: `c${i}`, r: "r", v }));
    const q = qs({ ...spec, data: d, theme: { rampMid: "#eee" } });
    expect(q[2]).toBeGreaterThanOrEqual(4);
    expect(q[2]).toBeLessThanOrEqual(5);
    expect(q[0]).toBe(0);
    expect(q[4]).toBe(9);
  });
  it("theme cellGap sets the gap; cellRadius is CSS", () => {
    const w = (g?: string) =>
      +/width="([\d.]+)"/.exec(
        marks(
          render({ ...spec, ...(g ? { theme: { cellGap: g } } : {}) }, { width: 400, height: 240 }),
        )[0]!,
      )![1]!;
    expect(w("0")).toBeGreaterThan(w());
    expect(w("6")).toBeLessThan(w());
  });
  it("tooltip.fields and was add data-more and data-was to the cell and its hit", () => {
    const d = data.map((r) => ({ ...r, u: r.v * 2, old: r.v + 1 }));
    const svg = render(
      { ...spec, data: d, tooltip: { fields: ["u"] }, was: "old" },
      { width: 100, height: 60 },
    );
    const cell = marks(svg).find((t) => t.includes('data-key="r1~a"'))!;
    expect(cell).toContain('data-was="was 1"');
    expect(cell).toContain('data-more="u\t0"');
    expect(svg).toMatch(/data-maya="hit"[^>]*data-was="was 1"/);
  });
});
