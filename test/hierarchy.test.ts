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
  const svg = renderParts(sb).svg;
  const rings = tags(svg, "circle");
  const start = (c: string) => 90 - +at(c, "stroke-dashoffset");
  const sweep = (c: string) => parseFloat(at(c, "stroke-dasharray"));
  it("one slice per node plus the centre disk, last", () => {
    expect(rings.length).toBe(3 + 5 + 1);
    expect(rings.filter((p) => at(p, "data-depth") === "1").length).toBe(3);
    expect(rings.filter((p) => at(p, "data-depth") === "2").length).toBe(5);
    expect(new Set(rings.map((p) => at(p, "data-key"))).size).toBe(9);
    expect(at(rings.at(-1)!, "data-key")).toBe("h");
    expect(at(rings.at(-1)!, "data-x")).toBe("Total");
    expect(at(rings.at(-1)!, "stroke-dasharray")).toBe("360 0");
  });
  it("slices are dashes in degrees: period 360, each ring closes the circle", () => {
    for (const c of rings) {
      expect(at(c, "pathLength")).toBe("360");
      const [d, g] = at(c, "stroke-dasharray").split(" ").map(Number) as [number, number];
      expect(d + g).toBeCloseTo(360, 1);
    }
    const top = rings.filter((p) => at(p, "data-depth") === "1");
    // 1 px gaps: sweeps fall just short of 360, and slices tile in order from 12 o'clock.
    const total = top.reduce((s, c) => s + sweep(c), 0);
    expect(total).toBeGreaterThan(355);
    expect(total).toBeLessThan(360);
    expect(start(top[0]!)).toBeGreaterThanOrEqual(0);
    expect(start(top[0]!)).toBeLessThan(2);
  });
  it("children sort largest first and tooltips carry their share", () => {
    const c = rings.filter((p) => at(p, "data-key").startsWith("h~C~"));
    expect(c.map((p) => at(p, "data-key"))).toEqual(["h~C~c1", "h~C~c2"]);
    expect(at(c[0]!, "data-f")).toBe("30 · 86% of C");
    expect(
      at(
        rings.find((p) => at(p, "data-key") === "h~B")!,
        "data-f",
      ),
    ).toBe("40 · 35%");
  });
  it("names label the rings and the centre shows the total", () => {
    expect(svg).toContain(">B<");
    expect(svg).toContain(">Total<");
    expect(svg).toContain(">115<");
    expect(renderParts({ ...sb, labels: false }).svg).not.toContain(">B<");
  });
  it("a lone node is a full ring", () => {
    const s = tags(renderParts({ ...sb, data: [{ g: "A", n: "a", v: 1 }] }).svg, "circle");
    expect(s.length).toBe(3);
    expect(at(s[0]!, "stroke-dasharray")).toBe("360 0");
  });
  it("drilled: every level below the branch, the branch is the centre", () => {
    const d = tags(renderParts({ ...sb, drill: true }, { view: { drill: ["C"] } }).svg, "circle");
    expect(d.map((p) => at(p, "data-key"))).toEqual(["h~C~c1", "h~C~c2", "h~C"]);
    expect(at(d[2]!, "data-x")).toBe("C");
    expect(at(d[0]!, "data-depth")).toBe("1");
  });
  it("slivers under 4 px lump into one Other slice that does not drill", () => {
    const rows = [
      { g: "A", n: "big", v: 1000 },
      ...Array.from({ length: 30 }, (_, i) => ({ g: "A", n: `s${i}`, v: 3 })),
    ];
    const s = tags(renderParts({ ...sb, data: rows, drill: true }).svg, "circle");
    const other = s.filter((c) => / data-other="/.test(c));
    expect(other).toHaveLength(1);
    expect(at(other[0]!, "data-x")).toBe("A › Other (30)");
    // Keyed by the sentinel, not the count, so a new count still sweeps; neutral, no slot.
    expect(at(other[0]!, "data-key")).toBe("h~A~%00other");
    expect(s.map((c) => at(c, "data-key"))).toEqual(["h~A", "h~A~big", "h~A~%00other", "h"]);
  });
  it("a ring of only slivers keeps its largest child as a tick and lumps the rest", () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({ g: "A", n: `s${i}`, v: 5 }));
    const s = tags(renderParts({ ...sb, data: rows }).svg, "circle");
    expect(s.filter((c) => at(c, "data-depth") === "2").map((c) => at(c, "data-x"))).toEqual([
      "A › s0",
      "A › Other (999)",
    ]);
  });
  it("colour slots follow size, so the drawn order cycles the palette", () => {
    const rows = [
      { g: "small", n: "x", v: 1 },
      { g: "big", n: "x", v: 9 },
    ];
    const s = tags(renderParts({ ...sb, data: rows }).svg, "circle");
    const top = s.filter((c) => at(c, "data-depth") === "1");
    expect(top.map((c) => [at(c, "data-x"), at(c, "data-s")])).toEqual([
      ["big", "0"],
      ["small", "1"],
    ]);
    const d = tags(
      renderParts({ ...sb, data: rows, drill: true }, { view: { drill: ["small"] } }).svg,
      "circle",
    );
    expect(d.every((c) => at(c, "data-s") === "1")).toBe(true);
  });
  it("a name runs along the arc, upright, cut to what fits", () => {
    // Twelve 30 degree slices in a 400 px box: the arc holds about 8 characters.
    const rows = Array.from({ length: 12 }, (_, i) => ({ g: `Categories ${i}`, n: "x", v: 1 }));
    const svg = renderParts({ ...sb, data: rows, path: ["g"] }, { width: 400, height: 400 }).svg;
    const texts = [...svg.matchAll(/<text[^>]*rotate\((-?[\d.]+)[^>]*>([^<]*)</g)];
    expect(texts).toHaveLength(12);
    for (const [, deg, t] of texts) {
      const a = ((+deg! % 360) + 360) % 360;
      expect(a <= 90 || a >= 270).toBe(true); // never upside down
      expect(t!.endsWith("…")).toBe(true);
    }
  });
  it("depth 1 names carry dark ink", () => {
    const svg = renderParts({ ...sb }).svg;
    expect(/<text[^>]*data-ink[^>]*>[^<]+</.test(svg)).toBe(true);
  });
  it("a drilled branch keeps its colour", () => {
    const d = tags(renderParts({ ...sb, drill: true }, { view: { drill: ["C"] } }).svg, "circle");
    expect(d.map((p) => at(p, "data-s"))).toEqual(["2", "2", "2"]);
    // Tint by depth in the whole tree: the disk is C's own colour, its children one step lighter.
    expect(d.map((p) => at(p, "data-tint"))).toEqual(["2", "2", "1"]);
  });
});

describe("drill draws one level", () => {
  const many = Array.from({ length: 4 }, (_, g) =>
    Array.from({ length: 30 }, (_, n) => ({ g: `G${g}`, n: `n${n}`, v: 10 + n })),
  ).flat();
  for (const type of ["treemap"] as const) {
    const tag = "rect";
    const spec: ChartSpec = {
      type,
      path: ["g", "n"],
      y: "v",
      data: many,
      drill: true,
      labels: true,
    };
    it(`${type}: root shows only the top level, a drilled view its children`, () => {
      const root = tags(renderParts(spec).svg, tag);
      expect(root.map((t) => at(t, "data-key"))).toEqual(
        ["G0", "G1", "G2", "G3"].map((g) => `h~${g}`),
      );
      expect(root.every((t) => at(t, "data-depth") === "1")).toBe(true);
      const inner = tags(renderParts(spec, { view: { drill: ["G1"] } }).svg, tag);
      expect(inner).toHaveLength(30);
      expect(inner.every((t) => at(t, "data-key").startsWith("h~G1~"))).toBe(true);
    });
  }
  it("treemap top level carries its label", () => {
    const spec: ChartSpec = {
      type: "treemap",
      path: ["g", "n"],
      y: "v",
      data: many,
      drill: true,
      labels: true,
    };
    expect(renderParts(spec).svg).toContain(">G0<");
  });
  it("without drill, tiny leaves are skipped", () => {
    const rows = [
      { g: "A", n: "big", v: 1e6 },
      ...Array.from({ length: 50 }, (_, i) => ({ g: "A", n: `s${i}`, v: 1 })),
    ];
    const t = tags(
      renderParts({ type: "treemap", path: ["g", "n"], y: "v", data: rows }).svg,
      "rect",
    );
    expect(t).toHaveLength(1);
    const p = tags(
      renderParts({ type: "sunburst", path: ["g", "n"], y: "v", data: rows }).svg,
      "circle",
    );
    expect(p.map((x) => at(x, "data-key"))).toEqual(["h~A", "h~A~big", "h"]);
  });
});

describe("treemap names and drill hooks", () => {
  it("names are on unless labels is false", () => {
    expect(renderParts(tm).svg).toContain(">b1<");
    expect(renderParts({ ...tm, labels: false }).svg).not.toContain(">b1<");
  });
  it("svg carries data-drill only while a click can go deeper", () => {
    const d: ChartSpec = { ...tm, drill: true };
    expect(renderParts(d).svg).toMatch(/<svg[^>]* data-drill=""/);
    expect(renderParts(d, { view: { drill: ["A"] } }).svg).not.toMatch(/<svg[^>]* data-drill/);
  });
  it("a drilled treemap keeps its branch colour", () => {
    const s = renderParts({ ...tm, drill: true }, { view: { drill: ["C"] } }).svg;
    expect(tags(s, "rect").map((t) => at(t, "data-s"))).toEqual(["2", "2"]);
  });
});
