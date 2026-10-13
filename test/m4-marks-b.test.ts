import { describe, expect, it } from "vitest";
import { renderParts } from "../src/index.ts";
import "../src/radial.ts";
import "../src/geo.ts";
import "../src/hierarchy.ts";
import "../src/flow.ts";
import type { ChartSpec, View } from "../src/core/types.ts";

const parts = (spec: object, view?: View) => renderParts(spec as ChartSpec, view && { view });
const keys = (svg: string) => [...svg.matchAll(/data-key="([^"]*)"/g)].map((m) => m[1]!);

const shop = [
  { region: "West", family: "Outerwear", itemType: "Jackets", product: "Parka", sales: 14 },
  { region: "West", family: "Outerwear", itemType: "Vests", product: "Shell", sales: 9 },
  { region: "East", family: "Bottoms", itemType: "Jeans", product: "Chino", sales: 11 },
  { region: "East", family: "Outerwear", itemType: "Jackets", product: "Cargo", sales: 6 },
];

describe("M4 marks: drills", () => {
  it("radial: bars retract and the children draw under S~C keys", () => {
    const spec = {
      type: "radial",
      path: ["family", "itemType"],
      y: "sales",
      drill: true,
      data: shop,
    };
    expect(keys(parts(spec).svg)).toContain("~Outerwear");
    const d = keys(parts(spec, { drill: ["Outerwear"] }).svg).filter((k) => k.includes("~"));
    expect(d).toContain("~Jackets");
    expect(d).not.toContain("~Outerwear");
  });

  it("waffle: key part 1 is the raw category; a drilled tint steps the parent's hue", () => {
    const spec = {
      type: "waffle",
      path: ["family", "itemType"],
      y: "sales",
      drill: true,
      tint: true,
      data: shop,
    };
    expect(parts(spec).svg).toMatch(/data-key="w~Outerwear~0"/);
    const d = parts(spec, { drill: ["Bottoms"] }).svg;
    expect(d).toMatch(/data-key="w~Jeans~0"[^>]*/);
    expect(d).toContain('data-s="1"');
    expect(d).toMatch(/data-lt="\d"/);
    expect(parts(spec).svg).not.toContain("data-lt");
  });

  it("marimekko without series: columns from the level, stacks from the next", () => {
    const spec = {
      type: "marimekko",
      path: ["region", "family", "itemType"],
      y: "sales",
      drill: true,
      data: shop,
    };
    expect(keys(parts(spec).svg)).toContain("Outerwear~West");
    expect(keys(parts(spec, { drill: ["West"] }).svg)).toContain("Jackets~Outerwear");
  });

  it("chord with 3 levels: sources keep their key, targets take the full-path level", () => {
    const spec = {
      type: "chord",
      path: ["region", "family", "itemType"],
      y: "sales",
      drill: true,
      tint: true,
      data: shop,
    };
    const root = keys(parts(spec).svg);
    expect(root).toContain("n~0~West");
    expect(root).toContain("n~1~Outerwear");
    const d = parts(spec, { drill: ["Outerwear"] }).svg;
    expect(keys(d)).toContain("n~0~West");
    expect(keys(d)).toContain("n~2~Jackets");
    expect(d).toMatch(/data-lt="\d"/);
  });

  it("hexmap: validates path[0]; cells carry the raw x; a drill draws bars", () => {
    const rows = [
      { state: "Nevada", store: "a", sales: 7 },
      { state: "Nevada", store: "b", sales: 5 },
      { state: "Iowa", store: "c", sales: 2 },
    ];
    const spec = { type: "hexmap", path: ["state", "store"], y: "sales", drill: true, data: rows };
    expect(parts(spec).svg).toContain('data-raw="Nevada"');
    expect(() => parts({ ...spec, data: [{ state: "Narnia", store: "z", sales: 1 }] })).toThrow(
      /not a US state/,
    );
    const d = parts(spec, { drill: ["Nevada"] }).svg;
    expect(d).not.toContain("data-raw");
    expect(keys(d)).toContain("~a");
  });

  it("waterfall drill: opening and closing totals", () => {
    const rows = [
      { region: "W", state: "NV", change: 4 },
      { region: "W", state: "CA", change: -1 },
      { region: "E", state: "NY", change: 2 },
    ];
    const spec = {
      type: "waterfall",
      path: ["region", "state"],
      y: "change",
      drill: true,
      start: "2025",
      totals: ["2026"],
      data: [
        { region: "2025", state: "x", change: 10 },
        ...rows,
        { region: "2026", state: "x", change: 0 },
      ],
    };
    const svg = parts(spec, { drill: ["W"] }).svg;
    expect(svg).toContain("Before");
    expect(svg).toContain("After");
  });
});

describe("M4 marks: heatmap totals and rank legends", () => {
  const spec = {
    type: "heatmap",
    x: "c",
    series: "s",
    y: "v",
    totals: true,
    labels: true,
    data: [
      { c: "A", s: "r1", v: 1 },
      { c: "B", s: "r1", v: 2 },
      { c: "A", s: "r2", v: 3 },
      { c: "B", s: "r2", v: 4 },
    ],
  };
  it("draws the Total row, column and corner outside the ramp", () => {
    const svg = parts(spec).svg;
    const tot = [...svg.matchAll(/<rect[^>]*data-sum[^>]*>/g)].map((m) => m[0]);
    expect(tot).toHaveLength(5);
    expect(tot.every((t) => !t.includes("data-q"))).toBe(true);
    expect(svg).toContain('data-key="%00total~%00total"');
    expect(svg).toContain(">10<"); // the grand total
    expect(parts({ ...spec, totals: undefined }).svg).not.toContain("data-sum");
  });
  it("rank legend names lowest, median and highest", () => {
    const rows = [1, 2, 3, 4, 5].map((v) => ({ c: "A" + v, s: "r", v: v * 10 }));
    const svg = parts({ ...spec, totals: undefined, colorScale: "rank", data: rows }).legend;
    const leg = svg;
    expect([...leg.matchAll(/<span>([^<]*)<\/span>/g)].map((m) => m[1])).toEqual([
      "10",
      "30",
      "50",
    ]);
    expect(leg.match(/<i /g)).toHaveLength(2);
  });
});
