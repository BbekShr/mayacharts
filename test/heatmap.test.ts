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
    const tight = labels(200);
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
        "<rect data-maya="mark" data-hm="" data-key="r1~a" data-c="0" data-x="a" data-series="r1" data-y="1" data-f="1" data-q="0" x="41.18" y="17.6" width="60.24" height="50.8"/>",
        "<rect data-maya="mark" data-hm="" data-key="r1~b" data-c="1" data-x="b" data-series="r1" data-y="3" data-f="3" data-q="9" x="118.98" y="17.6" width="60.24" height="50.8"/>",
      ]
    `);
  });
  it("inks labels by ramp step: dark ink on steps 7 to 9, the tint ink on the paler ones", () => {
    const svg = render(spec, { width: 800, height: 400 });
    const t = svg.match(/<text [^>]*data-in[^>]*>/g) ?? [];
    const q = marks(svg).map((m) => Number(/data-q="(\d)"/.exec(m)![1]));
    expect(t.length).toBe(11);
    expect(t.filter((x) => x.includes("data-dark"))).toHaveLength(q.filter((n) => n > 7).length);
    expect(t.filter((x) => x.includes('data-ink="t"'))).toHaveLength(q.filter((n) => n < 8).length);
    expect(t.filter((x) => x.includes("data-dark") && x.includes("data-q"))).toHaveLength(
      q.filter((n) => n > 7).length,
    );
  });
  it("small cells are squares, large ones fill the band; the legend names the field", () => {
    const wh = (svg: string) => {
      const t = marks(svg)[0]!;
      return [/ width="([\d.]+)"/, / height="([\d.]+)"/].map((re) => Number(re.exec(t)![1]));
    };
    const [w, h] = wh(render(spec, { width: 400, height: 400 }));
    expect(w).not.toBe(h);
    const small = wh(render(spec, { width: 160, height: 400 }));
    expect(small[0]).toBe(small[1]);
    expect(renderParts(spec).legend).toContain("<b>v</b>");
  });
});
