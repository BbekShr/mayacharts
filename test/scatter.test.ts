import { describe, expect, it } from "vitest";
import { renderParts } from "../src/index.ts";
import type { ChartSpec } from "../src/core/types.ts";

const base: ChartSpec = {
  type: "scatter",
  x: "a",
  y: "b",
  data: [
    { a: 1, b: 2 },
    { a: 2, b: 4 },
    { a: 3, b: 3 },
  ],
};
const circles = (svg: string, kind = "mark") =>
  [...svg.matchAll(new RegExp(`<circle data-maya="${kind}"[^>]*/>`, "g"))].map((m) => m[0]);
const attr = (s: string, a: string) => new RegExp(` ${a}="([^"]*)"`).exec(s)?.[1];

const bubbles: ChartSpec = {
  type: "scatter",
  x: "a",
  y: "b",
  size: "z",
  name: "n",
  data: [
    { a: 1, b: 1, z: 10, n: "small" },
    { a: 2, b: 2, z: 1000, n: "big" },
    { a: 3, b: 3, z: 250, n: "mid" },
  ],
};

describe("scatter", () => {
  it("draws one circle per point, null x/y skipped", () => {
    const s = { ...base, data: [...base.data, { a: null, b: 1 }, { a: 4, b: undefined }] };
    expect(circles(renderParts(s).svg)).toHaveLength(3);
  });

  it("default radius is 5 and no point gets a hit element", () => {
    const svg = renderParts(base).svg;
    expect(circles(svg).map((c) => attr(c, "r"))).toEqual(["5", "5", "5"]);
    expect(circles(svg, "hit")).toHaveLength(0); // the element picks the nearest mark within 12px
  });

  it("size grows the radius, biggest drawn first", () => {
    const svg = renderParts(bubbles).svg;
    const rs = circles(svg).map((c) => Number(attr(c, "r")));
    expect(rs).toEqual([...rs].sort((a, b) => b - a));
    expect(new Set(rs).size).toBe(3);
    expect(attr(circles(svg)[0]!, "data-x")).toBe("big");
  });

  it("tooltip payload: name title, x · y · size", () => {
    const c = circles(renderParts(bubbles).svg).find((m) => attr(m, "data-x") === "big")!;
    expect(attr(c, "data-f")).toBe("2 · 2 · 1,000");
    expect(attr(c, "data-y")).toBe("2");
    expect(attr(c, "data-key")).toBe("~big");
  });

  it("duplicate names get #2, no name uses the row index", () => {
    const s = {
      ...bubbles,
      data: [
        { a: 1, b: 1, z: 1, n: "x" },
        { a: 2, b: 2, z: 1, n: "x" },
      ],
    };
    expect(circles(renderParts(s).svg).map((c) => attr(c, "data-key"))).toEqual([
      "~x",
      "~x%23" + "2",
    ]);
    expect(circles(renderParts(base).svg).map((c) => attr(c, "data-key"))).toEqual([
      "~0",
      "~1",
      "~2",
    ]);
  });

  // spec.series is rejected for scatter by validate.ts (option-unsupported), so series/hidden
  // handling in the mark is untestable through render() until that allowlist changes.

  it("xDomain clips points outside and sets the axis", () => {
    const s = { ...base, xDomain: [1.5, 3] as const };
    const svg = renderParts(s).svg;
    expect(circles(svg)).toHaveLength(2);
    expect(attr(svg, "data-xd")).toContain("1.5 3");
  });

  it("labels and tone", () => {
    const s: ChartSpec = { ...base, labels: true, colorBy: { target: 3 } };
    const svg = renderParts(s).svg;
    expect(svg).toMatch(/<g data-maya="labels"><text/);
    expect(circles(svg).map((c) => attr(c, "data-tone"))).toEqual(["bad", "good", "good"]);
  });

  it("colorBy field gives ramp buckets", () => {
    const s: ChartSpec = {
      ...base,
      colorBy: "k",
      data: [
        { a: 1, b: 1, k: 0 },
        { a: 2, b: 2, k: 10 },
      ],
    };
    expect(circles(renderParts(s).svg).map((c) => attr(c, "data-q"))).toEqual(["0", "9"]);
  });

  it("hover guides: a cross group with two lines and two value pills; none without points", () => {
    const svg = renderParts(base).svg;
    const g = /<g data-maya="cross">(.*?)<\/g>/.exec(svg)![1]!;
    expect(g.match(/<line data-g=/g)).toHaveLength(2);
    expect(g.match(/<text data-g=/g)).toHaveLength(2);
    // Plain points: data-x and data-f already are the pill texts, so no data-gx/gy/series.
    expect(attr(circles(svg)[1]!, "data-gx")).toBeUndefined();
    const named = renderParts({
      ...base,
      name: "n",
      data: base.data.map((r, i) => ({ ...r, n: "p" + i })),
    }).svg;
    expect(attr(circles(named)[1]!, "data-gx")).toBe("2");
    expect(attr(circles(named)[1]!, "data-gy")).toBe("4");
    expect(renderParts({ ...base, data: [] }).svg).not.toContain("data-g=");
  });

  it("snapshot", () =>
    expect(circles(renderParts(base).svg).join("")).toMatchInlineSnapshot(
      `"<circle data-maya="mark" data-key="~0" data-c="0" data-s="0" data-x="1" data-y="2" data-f="2" r="5" cx="39.6" cy="296"/><circle data-maya="mark" data-key="~1" data-c="1" data-s="0" data-x="2" data-y="4" data-f="4" r="5" cx="333.8" cy="10"/><circle data-maya="mark" data-key="~2" data-c="2" data-s="0" data-x="3" data-y="3" data-f="3" r="5" cx="628" cy="153"/>"`,
    ));

  describe("density bins", () => {
    const rng = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    const mk = (n: number, extra: Partial<ChartSpec> = {}): ChartSpec => {
      const r = rng(7);
      return {
        ...base,
        series: "g",
        data: Array.from({ length: n }, (_, i) => ({
          a: Math.round(r() * 1000) / 100, // ~1000 distinct x: shaped.cells stays under the pre-draw cap until render skips it for scatter

          b: r() * r() * 10,
          g: i % 2 ? "p" : "q",
        })),
        ...extra,
      };
    };
    const rects = (svg: string) =>
      [...svg.matchAll(/<rect data-maya="mark"[^>]*\/>/g)].map((m) => m[0]);
    const sum = (svg: string) => rects(svg).reduce((t, c) => t + Number(attr(c, "data-y")), 0);

    it("20 000 points draw at most MAX_MARKS cells whose counts sum to the points", () => {
      const svg = renderParts(mk(20000)).svg;
      expect(circles(svg)).toHaveLength(0);
      expect(rects(svg).length).toBeGreaterThan(0);
      expect(rects(svg).length).toBeLessThanOrEqual(5000);
      expect(sum(svg)).toBe(20000);
      const c = rects(svg)[0]!;
      expect(attr(c, "data-f")).toMatch(/ points?$/);
      expect(attr(c, "data-gx")).toMatch(/ to /);
      expect(attr(c, "data-s")).toBe("0");
    });

    it("announces ranges with both axis titles, pluralises, and describes the cells", () => {
      const svg = renderParts(mk(20000)).svg;
      const one = rects(svg).find((c) => attr(c, "data-f") === "1 point")!;
      expect(one).toBeTruthy();
      expect(attr(one, "data-x")).toMatch(/^a [^,]+ to [^,]+, b [^,]+ to /);
      expect(svg).not.toContain("–");
      expect(svg).toMatch(/20,000 rows\. Shown as [\d,]+ density cells, 1 to [\d,]+ points each\./);
    });

    it("keeps cells under MAX_MARKS on an extreme aspect ratio", () => {
      const svg = renderParts(mk(20000), { width: 400000, height: 60 }).svg;
      expect(rects(svg).length).toBeLessThanOrEqual(5000);
    });

    it("is deterministic and keys are unique", () => {
      const a = renderParts(mk(6000)).svg;
      expect(renderParts(mk(6000)).svg).toBe(a);
      const keys = rects(a).map((c) => attr(c, "data-key"));
      expect(new Set(keys).size).toBe(keys.length);
    });

    it("window recomputes, and real circles return under the cap", () => {
      const spec = mk(20000);
      const w = renderParts(spec, { view: { window: [0, 5, 0, 10] } }).svg;
      const inside = (spec.data as { a: number }[]).filter((d) => d.a <= 5).length;
      expect(sum(w)).toBe(inside);
      const z = renderParts(spec, { view: { window: [0, 0.2, 0, 10] } }).svg;
      expect(rects(z)).toHaveLength(0);
      expect(circles(z).length).toBeGreaterThan(0);
    });

    it("hidden series are excluded", () => {
      const svg = renderParts(mk(20000), { view: { hidden: ["p"] } }).svg;
      expect(sum(svg)).toBe(10000);
    });

    it("has the ramp legend, not the series legend", () => {
      const p = renderParts(mk(20000));
      expect(p.legend).toContain('data-maya="ramp"');
    });
  });
});
