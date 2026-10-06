import { describe, expect, it } from "vitest";
import { renderParts } from "../src/index.ts";
import type { ChartSpec } from "../src/core/types.ts";

describe("line value labels", () => {
  it("sit above a peak and below a trough", () => {
    const svg = renderParts({
      type: "line",
      x: "m",
      y: "v",
      labels: true,
      data: [10, 25, 10, 25, 10, 30].map((v, i) => ({ m: `m${i}`, v })),
    }).svg;
    const g = svg.slice(svg.indexOf('data-maya="labels"'));
    const y = (t: string) => Number(g.match(new RegExp(`<text[^>]*y="([\\d.]+)"[^>]*>${t}<`))![1]);
    const dot = (t: string) =>
      Number(svg.match(new RegExp(`data-y="${t}"[^>]*cy="([\\d.]+)"`))![1]);
    expect(y("25")).toBeLessThan(dot("25")); // above its peak
    expect(y("10")).toBeGreaterThan(dot("10")); // below its trough
  });
});

const months = ["Jan", "Feb", "Mar"];
const one: ChartSpec = {
  type: "line",
  x: "m",
  y: "v",
  data: months.map((m, i) => ({ m, v: (i + 1) * 10 })),
};
const two: ChartSpec = {
  type: "line",
  x: "m",
  y: "v",
  series: "r",
  data: months.flatMap((m, i) => ["N", "S"].map((r, j) => ({ m, r, v: (i + 1) * (j + 2) }))),
};
const svg = (s: ChartSpec) => renderParts(s).svg;
const paths = (s: string, kind: string) =>
  [...s.matchAll(new RegExp(`<path data-maya="${kind}"[^>]*>`, "g"))].map((m) => m[0]);
const attr = (s: string, a: string) =>
  [...s.matchAll(new RegExp(` ${a}="([^"]*)"`, "g"))].map((m) => m[1]!);
const circles = (s: string) => [...s.matchAll(/<circle [^>]*>/g)].map((m) => m[0]);
const group = (s: string, g: string) =>
  s.match(new RegExp(`<g data-maya="${g}">(.*?)</g>`, "s"))![1]!;

describe("line", () => {
  it("one path per series", () => {
    expect(paths(svg(one), "line")).toHaveLength(1);
    expect(paths(svg(two), "line")).toHaveLength(2);
    expect(paths(svg(two), "line")[0]).toContain('pathLength="1"');
  });
  it("null starts a new segment", () => {
    const d = attr(
      paths(
        svg({
          ...one,
          data: [
            { m: "a", v: 1 },
            { m: "b", v: null },
            { m: "c", v: 3 },
            { m: "d", v: 4 },
          ],
        }),
        "line",
      )[0]!,
      "d",
    )[0]!;
    expect(d.match(/M/g)).toHaveLength(2);
  });
  it("circles are contracted marks with unique keys", () => {
    const cs = circles(svg(two));
    expect(cs).toHaveLength(6);
    for (const c of cs)
      for (const a of [
        "data-key",
        "data-c",
        "data-s",
        "data-x",
        "data-series",
        "data-y",
        "data-f",
        "r",
        "cx",
        "cy",
      ])
        expect(c).toContain(` ${a}=`);
    const keys = attr(cs.join(""), "data-key");
    expect(new Set(keys).size).toBe(6);
  });
  it("one keyless plot-wide hit; the element picks the nearest point", () => {
    const h = group(svg(two), "hits");
    const rects = h.match(/<rect [^>]*>/g)!;
    expect(rects).toHaveLength(1);
    expect(rects[0]).not.toMatch(/data-(key|c)=/);
    expect(group(svg(two), "cross")).toMatch(/^<line /);
  });
  it("labels and tone", () => {
    expect(group(svg({ ...one, labels: true }), "labels")).toContain("<text");
    expect(svg({ ...one, colorBy: "sign" })).toMatch(/data-tone="(good|bad)"/);
  });
  it("snapshot", () => {
    expect(
      group(
        renderParts({ ...one, data: one.data.slice(0, 2) }, { width: 200, height: 100 }).svg,
        "marks",
      ),
    ).toMatchInlineSnapshot(
      `"<path data-maya="line" data-key="l~" data-s="0" pathLength="1" d="M71.3 43L149.1 10"/><circle data-maya="mark" data-key="~Jan" data-c="0" data-s="0" data-x="Jan" data-series="" data-y="10" data-f="10" r="3" cx="71.3" cy="43"/><circle data-maya="mark" data-key="~Feb" data-c="1" data-s="0" data-x="Feb" data-series="" data-y="20" data-f="20" r="3" cx="149.1" cy="10"/>"`,
    );
  });
});

describe("area", () => {
  const st: ChartSpec = { ...two, type: "area", stack: true };
  it("fill path per series, closed", () => {
    const a = paths(svg(st), "area");
    expect(a).toHaveLength(2);
    for (const p of a) expect(attr(p, "d")[0]).toMatch(/Z$/);
    expect(paths(svg(st), "line")).toHaveLength(2);
  });
  it("top series y0 equals lower series y1", () => {
    const [lo, hi] = paths(svg(st), "area").map((p) => attr(p, "d")[0]!);
    const ys = (d: string) => [...d.matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)].map((m) => m[2]!);
    // lower: top edge y1 then base y0; upper: top edge then its base (= lower's y1)
    expect(ys(hi!).slice(3)).toEqual(ys(lo!).slice(0, 3).reverse());
  });
  it("snapshot", () => {
    expect(
      group(
        renderParts({ ...st, data: st.data.slice(0, 4) }, { width: 200, height: 100 }).svg,
        "marks",
      ),
    ).toMatchInlineSnapshot(
      `"<path data-maya="area" data-key="a~N" data-s="0" d="M76.7 62.8L150.9 49.6L150.9 76L76.7 76Z"/><path data-maya="area" data-key="a~S" data-s="1" d="M76.7 43L150.9 10L150.9 49.6L76.7 62.8Z"/><path data-maya="line" data-key="l~N" data-s="0" pathLength="1" d="M76.7 62.8L150.9 49.6"/><path data-maya="line" data-key="l~S" data-s="1" pathLength="1" d="M76.7 43L150.9 10"/><circle data-maya="mark" data-key="N~Jan" data-c="0" data-s="0" data-x="Jan" data-series="N" data-y="2" data-f="2" r="3" cx="76.7" cy="62.8"/><circle data-maya="mark" data-key="N~Feb" data-c="1" data-s="0" data-x="Feb" data-series="N" data-y="4" data-f="4" r="3" cx="150.9" cy="49.6"/><circle data-maya="mark" data-key="S~Jan" data-c="0" data-s="1" data-x="Jan" data-series="S" data-y="3" data-f="3" r="3" cx="76.7" cy="43"/><circle data-maya="mark" data-key="S~Feb" data-c="1" data-s="1" data-x="Feb" data-series="S" data-y="6" data-f="6" r="3" cx="150.9" cy="10"/>"`,
    );
  });
});

describe("line end labels", () => {
  const data = ["a", "b"].flatMap((s, k) =>
    [1, 2, 3].map((m) => ({ m: `m${m}`, s, v: m * 10 + k })),
  );
  const spec: ChartSpec = { type: "line", x: "m", y: "v", series: "s", data };
  const ends = (c: ChartSpec, width = 640) => {
    const g = renderParts(c, { width }).svg;
    return [...g.matchAll(/<text data-end[^>]*>(.*?)<\/text>/g)].map((m) =>
      m[1]!.replace(/<[^>]*>/g, ""),
    );
  };
  it("name each series and its last value at the right end, never one for a single series", () => {
    expect(ends(spec)).toEqual(["b31", "a30"]);
    expect(ends({ ...spec, data: data.filter((d) => d.s === "a") })).toEqual([]);
  });
  it("reserve a right gutter and drop the legend", () => {
    const p = renderParts(spec, { width: 640 });
    expect(p.legend).toBe("");
    const [x, , w] = p.svg
      .match(/data-plot="([^"]*)"/)![1]!
      .split(" ")
      .map(Number);
    expect(x! + w!).toBeLessThan(640 - 20);
  });
  it("nudge colliding labels at least 13px apart", () => {
    const close = ["a", "b"].flatMap((s, k) =>
      [1, 2].map((m) => ({ m: `m${m}`, s, v: 5 + k * 0.01 * m })),
    );
    const ys = [
      ...renderParts({ ...spec, data: close }).svg.matchAll(/<text data-end[^>]* y="([\d.]+)"/g),
    ].map((m) => +m[1]!);
    expect(Math.abs(ys[0]! - ys[1]!)).toBeGreaterThanOrEqual(13);
  });
  it("fall back to the legend when narrow, with a hidden series, or with labels on", () => {
    expect(ends(spec, 360)).toEqual([]);
    expect(renderParts(spec, { width: 360 }).legend).toContain("maya-legend");
    const h = renderParts(spec, { width: 640, view: { hidden: ["a"] } });
    expect(h.legend).toContain("maya-legend");
    expect(h.svg).not.toContain("data-end");
    expect(ends({ ...spec, labels: true })).toEqual([]);
  });
  it("turn off with endLabels: false, and keep the legend alongside with an explicit legend: true", () => {
    const off = renderParts({ ...spec, endLabels: false }, { width: 640 });
    expect(off.legend).toContain("maya-legend");
    expect(off.svg).not.toContain("data-end");
    const both = renderParts({ ...spec, legend: true }, { width: 640 });
    expect(both.legend).toContain("maya-legend");
    expect(both.svg).toContain("data-end");
  });
  it("drop the value when the name alone fits the gutter", () => {
    const long = data.map((d) => ({ ...d, s: d.s.repeat(18) }));
    expect(ends({ ...spec, data: long }, 500).every((t) => !/\d/.test(t))).toBe(true);
  });
});

describe("yDomain narrower than the data", () => {
  const data = [
    { c: "a", v: 30 },
    { c: "b", v: -3 },
    { c: "c", v: 2 },
  ];
  // Every mark, line d and area d coordinate lies inside data-plot.
  const inside = (spec: ChartSpec) => {
    const svg = renderParts(spec).svg;
    const [x, y, w, h] = svg
      .match(/data-plot="([^"]+)"/)![1]!
      .split(" ")
      .map(Number) as number[] as [number, number, number, number];
    const pts: [number, number][] = [];
    for (const m of svg.matchAll(/ d="([^"]+)"/g))
      for (const p of m[1]!.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)) pts.push([+p[1]!, +p[2]!]);
    for (const m of svg.matchAll(/<circle[^>]*cx="([^"]+)"[^>]*cy="([^"]+)"/g))
      pts.push([+m[1]!, +m[2]!]);
    expect(pts.length).toBeGreaterThan(3);
    for (const [px, py] of pts) {
      expect(px).toBeGreaterThanOrEqual(x - 0.1);
      expect(px).toBeLessThanOrEqual(x + w + 0.1);
      expect(py).toBeGreaterThanOrEqual(y - 0.1);
      expect(py).toBeLessThanOrEqual(y + h + 0.1);
    }
    return svg;
  };
  it("pins line points to the plot edge and keeps the real value", () => {
    const svg = inside({ type: "line", x: "c", y: "v", yDomain: [0, 5], data });
    expect(svg).toContain('data-y="30"');
  });
  it("keeps a reversed yDomain inside too", () => {
    inside({ type: "line", x: "c", y: "v", yDomain: [5, 0], data });
  });
  it("keeps area and its fill inside", () => {
    inside({ type: "area", x: "c", y: "v", yDomain: [0, 5], data });
  });
  it("keeps stacked area inside", () => {
    inside({
      type: "area",
      x: "c",
      y: "v",
      series: "s",
      stack: true,
      yDomain: [0, 5],
      data: data.flatMap((d) => [
        { ...d, s: "p" },
        { ...d, v: 4, s: "q" },
      ]),
    });
  });
});
