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

  it("default radius is 5 and every small point gets a 12px hit", () => {
    const svg = renderParts(base).svg;
    expect(circles(svg).map((c) => attr(c, "r"))).toEqual(["5", "5", "5"]);
    expect(circles(svg, "hit").map((c) => attr(c, "r"))).toEqual(["12", "12", "12"]);
  });

  it("size grows the radius, biggest drawn first, and big bubbles get no hit", () => {
    const svg = renderParts(bubbles).svg;
    const rs = circles(svg).map((c) => Number(attr(c, "r")));
    expect(rs).toEqual([...rs].sort((a, b) => b - a));
    expect(new Set(rs).size).toBe(3);
    expect(attr(circles(svg)[0]!, "data-x")).toBe("big");
    // plot ~ 320 high -> max r = 2 + 26.7 = 28.7 (>= 12 so no hit); the small one is 2 + 0.1*26.7 = 4.7
    const hitNames = circles(svg, "hit").map((c) => attr(c, "data-x"));
    expect(hitNames).toContain("small");
    expect(hitNames).not.toContain("big");
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
    expect(attr(circles(svg)[1]!, "data-gx")).toBe("2");
    expect(renderParts({ ...base, data: [] }).svg).not.toContain("data-g=");
  });

  it("snapshot", () =>
    expect(circles(renderParts(base).svg).join("")).toMatchInlineSnapshot(
      `"<circle data-maya="mark" data-key="~0" data-c="0" data-s="0" data-x="1" data-series="" data-y="2" data-f="2" data-gx="1" data-gy="2" r="5" cx="39.6" cy="296"/><circle data-maya="mark" data-key="~1" data-c="1" data-s="0" data-x="2" data-series="" data-y="4" data-f="4" data-gx="2" data-gy="4" r="5" cx="333.8" cy="10"/><circle data-maya="mark" data-key="~2" data-c="2" data-s="0" data-x="3" data-series="" data-y="3" data-f="3" data-gx="3" data-gy="3" r="5" cx="628" cy="153"/>"`,
    ));
});
