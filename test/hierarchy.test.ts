import { describe, expect, it } from "vitest";
import "../src/hierarchy.ts";
import { renderParts } from "../src/core/render.ts";
import { MayaSpecError } from "../src/core/validate.ts";
import type { ChartSpec } from "../src/core/types.ts";

const data = [
  { g: "A", n: "a1", v: 30 },
  { g: "A", n: "a2", v: 10 },
  { g: "B", n: "b1", v: 40 },
  { g: "C", n: "c1", v: 20 },
  { g: "C", n: "c2", v: 5 },
  { g: "C", n: "c1", v: 10 },
];
const tm: ChartSpec = { type: "treemap", path: ["g", "n"], y: "v", data };
const sb: ChartSpec = { ...tm, type: "sunburst" };

const tags = (svg: string, tag: string) =>
  [...svg.matchAll(new RegExp(`<${tag} data-maya="mark"[^>]*>`, "g"))].map((m) => m[0]);
const at = (s: string, a: string) => new RegExp(` ${a}="([^"]*)"`).exec(s)![1]!;
const nums = (s: string, ...a: string[]) => a.map((k) => +at(s, k));
const W = 640;
const H = 320;

describe("treemap", () => {
  const svg = renderParts(tm).svg;
  const tiles = tags(svg, "rect");
  it("tiles fill the plot within 1%, all inside", () => {
    let area = 0;
    for (const t of tiles) {
      const [x, y, w, h] = nums(t, "x", "y", "width", "height");
      area += w! * h!;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x! + w!).toBeLessThanOrEqual(W + 0.01);
      expect(y! + h!).toBeLessThanOrEqual(H + 0.01);
    }
    expect(Math.abs(area - W * H) / (W * H)).toBeLessThan(0.01);
  });
  it("keys are unique and start with h~", () => {
    const keys = tiles.map((t) => at(t, "data-key"));
    expect(new Set(keys).size).toBe(tiles.length);
    expect(tiles.length).toBe(5);
    for (const k of keys) expect(k.startsWith("h~")).toBe(true);
  });
  it("data-s is the top-level index", () => {
    const s = Object.fromEntries(tiles.map((t) => [at(t, "data-x"), at(t, "data-s")]));
    expect(s["A › a1"]).toBe("0");
    expect(s["B › b1"]).toBe("1");
    expect(s["C › c2"]).toBe("2");
  });
  it("aggregates leaves (sum and mean)", () => {
    const v = (spec: ChartSpec) =>
      Object.fromEntries(
        tags(renderParts(spec).svg, "rect").map((t) => [at(t, "data-x"), at(t, "data-y")]),
      );
    expect(v(tm)["C › c1"]).toBe("30");
    expect(v({ ...tm, aggregate: "mean" })["C › c1"]).toBe("15");
  });
  it("rejects non-positive values", () => {
    const bad = { ...tm, data: [...data, { g: "D", n: "d", v: -1 }] };
    try {
      renderParts(bad);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(MayaSpecError);
      expect((e as MayaSpecError).code).toBe("non-positive-value");
    }
  });
  it("handles __proto__ names", () => {
    const s = renderParts({
      ...tm,
      data: [
        { g: "__proto__", n: "x", v: 3 },
        { g: "b", n: "__proto__", v: 1 },
      ],
    }).svg;
    expect(tags(s, "rect").length).toBe(2);
  });
  it("snapshot of a 2-level treemap", () => {
    const s = renderParts({
      type: "treemap",
      path: ["g", "n"],
      y: "v",
      data: [
        { g: "A", n: "a", v: 3 },
        { g: "B", n: "b", v: 1 },
      ],
    }).svg;
    expect(tags(s, "rect")).toMatchInlineSnapshot(`
      [
        "<rect data-maya="mark" data-key="h~A~a" data-c="0" data-s="0" data-x="A › a" data-series="" data-y="3" data-f="3" data-depth="2" x="0.5" y="0.5" width="479" height="319"/>",
        "<rect data-maya="mark" data-key="h~B~b" data-c="1" data-s="1" data-x="B › b" data-series="" data-y="1" data-f="1" data-depth="2" x="480.5" y="0.5" width="159" height="319"/>",
      ]
    `);
  });
});

describe("sunburst", () => {
  const paths = tags(renderParts(sb).svg, "path");
  it("one arc per non-root node with depth", () => {
    expect(paths.length).toBe(3 + 5);
    expect(paths.filter((p) => at(p, "data-depth") === "1").length).toBe(3);
    expect(paths.filter((p) => at(p, "data-depth") === "2").length).toBe(5);
    expect(new Set(paths.map((p) => at(p, "data-key"))).size).toBe(8);
  });
  it("a lone node does not collapse to an empty arc", () => {
    const s = renderParts({ ...sb, data: [{ g: "A", n: "a", v: 1 }] }).svg;
    expect(tags(s, "path").length).toBe(2);
    expect(at(tags(s, "path")[0]!, "d")).toContain("A");
  });
});
