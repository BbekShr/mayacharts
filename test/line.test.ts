import { describe, expect, it } from "vitest";
import { renderParts } from "../src/index.ts";
import type { ChartSpec } from "../src/core/types.ts";

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
