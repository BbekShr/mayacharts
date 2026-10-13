import { describe, expect, it } from "vitest";
import { renderParts } from "../src/index.ts";
import type { ChartSpec } from "../src/core/types.ts";

const labels = (svg: string) =>
  [...svg.slice(svg.indexOf('data-maya="labels"')).matchAll(/>([^<>]+)<\/text>/g)].map((m) => m[1]);
const num = (tag: string, re: RegExp) => Number(tag.match(re)![1]);

describe("bar", () => {
  it("auto roll-up keeps a large negative category by magnitude", () => {
    const data = Array.from({ length: 12000 }, (_, i) => ({
      c: `c${i}`,
      v: i === 5 ? -1e6 : i % 100,
    }));
    const svg = renderParts({ type: "bar", x: "c", y: "v", data }).svg;
    expect(svg).toContain('data-x="c5"');
  });

  it("keeps the Other roll-up out of the value domain and clips it at the plot edge", () => {
    const data = [10, 9, 8, ...Array.from({ length: 30 }, () => 5)].map((v, i) => ({
      c: `c${i}`,
      v,
    }));
    const svg = renderParts({
      type: "bar",
      x: "c",
      y: "v",
      sort: "desc",
      limit: 3,
      horizontal: true,
      data,
    }).svg;
    // The shown max is 10, so no tick reaches the roll-up's 150.
    // (The clipped bar prints its own total at the break, as a keyed label.)
    expect(svg).toContain('data-key="~%00other">150</text>');
    expect(svg.replace(/<text[^>]*data-key="~%00other">150<\/text>/, "")).not.toMatch(
      />(100|150|200)</,
    );
    const other = svg.match(/<rect[^>]*data-other=""[^>]*>/)![0];
    const top = svg.match(/<rect[^>]*data-key="[^"]*c0"[^>]*>/)![0];
    expect(num(other, /width="([\d.]+)"/)).toBeGreaterThanOrEqual(num(top, /width="([\d.]+)"/));
    expect(num(other, /data-y="([\d.]+)"/)).toBe(150); // the real value stays on the mark
  });

  it("waterfall labels the first bar and the Total when they fit their column, and drops any wider than it", () => {
    const data = Array.from({ length: 14 }, (_, i) => ({
      s: `s${i}`,
      d: i ? (i % 2 ? 123456 : -98765) : 500000,
    }));
    const spec: ChartSpec = {
      type: "waterfall",
      x: "s",
      y: "d",
      totals: ["s13"],
      labels: true,
      data,
    };
    const l = labels(renderParts(spec, { width: 1000, height: 300 }).svg);
    expect(l.length).toBeGreaterThan(1);
    // Narrow: the Total's label wider than its column drops instead of running over the neighbouring step (#91.5).
    expect(labels(renderParts(spec, { width: 260, height: 300 }).svg)).toHaveLength(0);
  });

  it("a waterfall opens at a leading total's own value; later totals keep the running sum (#92.4)", () => {
    const rows = [
      { k: "2025", v: 100 },
      { k: "a", v: 20 },
      { k: "b", v: -10 },
      { k: "2026", v: 0 },
    ];
    const svg = renderParts(
      { type: "waterfall", x: "k", y: "v", totals: ["2025", "2026"], data: rows },
      { width: 400, height: 300 },
    ).svg;
    const ys = [...svg.matchAll(/<rect data-maya="mark"[^>]*data-y="(-?[\d.]+)"/g)].map(
      (m) => +m[1]!,
    );
    expect(ys).toEqual([100, 20, -10, 110]);
  });

  it("the value axis includes `was` values so a ghost is never clipped (#90.1)", () => {
    const rows = [
      { Month: "2026-01", Sales: 13e6, "A year earlier": 24.7e6 },
      { Month: "2026-02", Sales: 14e6, "A year earlier": 15e6 },
    ];
    const svg = renderParts(
      { type: "bar", x: "Month", y: "Sales", was: "A year earlier", data: rows },
      { width: 400, height: 300 },
    ).svg;
    const ticks = [...svg.matchAll(/text-anchor="end"[^>]*>([\d,.]+)([MK]?)</g)].map(
      (m) => +m[1]!.replace(/,/g, "") * (m[2] === "M" ? 1e6 : 1),
    );
    expect(Math.max(...ticks)).toBeGreaterThanOrEqual(24.7e6);
    const ghost = svg.match(/<rect[^>]*data-past[^>]*>/)![0];
    expect(+/ y="([\d.-]+)"/.exec(ghost)![1]!).toBeGreaterThanOrEqual(0);
  });

  it("grouped labels: every bar of a series is labelled on its own bar, or the series is dropped whole (#91.6)", () => {
    const rows = ["Q1", "Q2", "Q3", "Q4"].flatMap((Quarter, i) =>
      ["2025", "2026"].map((Year, j) => ({ Quarter, Year, Sales: (12 + i * 2 + j * 5) * 1e6 })),
    );
    const g = (width: number) =>
      renderParts(
        {
          type: "bar",
          x: "Quarter",
          series: "Year",
          y: "Sales",
          labels: true,
          format: { Sales: "compact" },
          data: rows,
        },
        { width, height: 260 },
      ).svg;
    const wide = g(700);
    expect(wide.match(/data-in=""[^>]*data-key="2025~/g)).toHaveLength(4);
    expect(wide.match(/data-in=""[^>]*data-key="2026~/g)).toHaveLength(4);
    const narrow = g(260);
    const n = (y: string) =>
      narrow.match(new RegExp(`<text[^>]*data-key="${y}~[^>]*>[^<]*<`, "g"))?.length ?? 0;
    for (const y of ["2025", "2026"]) expect([0, 4]).toContain(n(y));
  });

  it("axis-break slashes sit inside the plot when values fall below the domain", () => {
    const data = [
      { c: "a", v: 1 },
      { c: "b", v: 5 },
    ];
    const s = renderParts({ type: "bar", x: "c", y: "v", yDomain: [100, 200], data }).svg;
    const ys = [...s.matchAll(/<rect data-maya="mark"[^>]* y="([\d.]+)"/g)].map((m) => +m[1]!);
    const brk = s.match(/data-brk="" d="([^"]+)"/)![1]!;
    const qs = [...brk.matchAll(/M[-\d.]+ ([-\d.]+)/g)].map((m) => +m[1]!);
    expect(qs.length).toBeGreaterThan(0);
    for (const q of qs) expect(q).toBeLessThan(Math.min(...ys)); // above the bar sitting on the bottom edge
  });

  it("a value label sits at the bar's end; a stack segment keeps its middle", () => {
    const data = [
      { c: "alpha", v: 60 },
      { c: "beta", v: 100 },
    ];
    const num = (t: string, k: string) => +t.match(new RegExp(` ${k}="([\\d.]+)"`))![1]!;
    const draw = (extra = {}) => {
      const s = renderParts(
        { type: "bar", x: "c", y: "v", labels: true, data, ...extra },
        { width: 400, height: 300 },
      ).svg;
      return [
        s.match(/<rect data-maya="mark"[^>]*>/)![0],
        s.match(/<text [^>]*data-in[^>]*>/)![0],
      ] as const;
    };
    const [rect, text] = draw();
    expect(num(text, "y")).toBeCloseTo(num(rect, "y") + 10, 0);
    const [r2, t2] = draw({ stack: true });
    expect(num(t2, "y")).toBeCloseTo(num(r2, "y") + num(r2, "height") / 2, 0);
    const [r3, t3] = draw({ horizontal: true });
    expect(t3).toContain('text-anchor="end"');
    expect(num(t3, "x")).toBeCloseTo(num(r3, "x") + num(r3, "width") - 8, 0);
  });

  it("horizontal bars label inside only when every label fits, else outside", () => {
    const ins = (v: number[]) =>
      renderParts({
        type: "bar",
        horizontal: true,
        labels: true,
        x: "c",
        y: "v",
        data: v.map((n, i) => ({ c: "c" + i, v: n })),
      }).svg.match(/data-in=""/g)?.length ?? 0;
    expect(ins([100, 90, 80])).toBe(3);
    expect(ins([100, 90, 0.5])).toBe(1); // only the top bar, which has no room outside
  });
});

describe("annotate and tooltip fields", () => {
  const data = [3, 9, 4, 7, 2].map((v, i) => ({ c: `c${i}`, v, t: v * 10 }));
  const spec: ChartSpec = { type: "bar", x: "c", y: "v", data };
  it("labels the max, min, first and last bar once each, nothing else", () => {
    expect(labels(renderParts({ ...spec, annotate: ["max", "min", "first", "last"] }).svg)).toEqual(
      ["9", "2", "3"],
    );
    expect(labels(renderParts({ ...spec }).svg)).toEqual([]);
  });
  it("does not repeat a plain value label on an annotated bar", () => {
    const l = labels(renderParts({ ...spec, labels: true, annotate: ["max"] }).svg);
    expect(l.filter((t) => t === "9")).toHaveLength(1);
    expect(l).toHaveLength(5);
  });
  it("horizontal: the longest bar's label goes inside its end when there is no room outside", () => {
    const s = renderParts({ ...spec, horizontal: true, annotate: ["max"] }, { width: 200 }).svg;
    expect(labels(s)).toEqual(["9"]);
  });
  it("writes data-more on the mark and its hit", () => {
    const s = renderParts({ ...spec, tooltip: { fields: ["t"] } }).svg;
    expect(s).toMatch(/data-maya="mark"[^>]*data-more="t\t30"/);
  });
  it("a tab or newline in a tooltip field title cannot add rows", () => {
    const s = renderParts({
      ...spec,
      tooltip: { fields: ["t"] },
      titles: { t: "x\nRevenue\t$9M" },
    }).svg;
    expect(s).toMatch(/data-more="x Revenue \$9M\t30"/);
  });
});
