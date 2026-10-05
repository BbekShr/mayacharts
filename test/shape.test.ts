import { describe, expect, it } from "vitest";
import { agg, shape, thin } from "../src/core/shape.ts";
import { OTHER } from "../src/core/svg.ts";
import { resolve } from "../src/core/validate.ts";
import type { ChartSpec, Row } from "../src/core/types.ts";

const sp = (data: Row[], o: Partial<ChartSpec> = {}) =>
  resolve({ type: "bar", data, x: "m", y: "v", series: "s", ...o });

describe("shape", () => {
  it("missing pairs become null cells", () => {
    const s = shape(
      sp([
        { m: "a", s: "A", v: 1 },
        { m: "b", s: "B", v: 2 },
      ]),
    );
    expect(s.cells).toHaveLength(4);
    expect(s.cells.filter((c) => c.value === null)).toHaveLength(2);
  });
  it("duplicates summed", () => {
    const s = shape(
      sp([
        { m: "a", s: "A", v: 1 },
        { m: "a", s: "A", v: 2 },
      ]),
    );
    expect(s.cells[0]!.value).toBe(3);
  });
  it("first-appearance order", () => {
    const s = shape(
      sp([
        { m: "b", s: "Z", v: 1 },
        { m: "a", s: "Y", v: 1 },
        { m: "b", s: "Y", v: 1 },
      ]),
    );
    expect(s.categories).toEqual(["b", "a"]);
    expect(s.series).toEqual(["Z", "Y"]);
  });
  it("negative stacking splits", () => {
    const s = shape(
      sp(
        [
          { m: "a", s: "A", v: 2 },
          { m: "a", s: "B", v: -3 },
          { m: "a", s: "C", v: 4 },
          { m: "a", s: "D", v: -1 },
        ],
        { stack: true },
      ),
    );
    expect(s.cells.map((c) => [c.y0, c.y1])).toEqual([
      [0, 2],
      [0, -3],
      [2, 6],
      [-3, -4],
    ]);
    expect(s.extent).toEqual([-4, 6]);
  });
  it("null counts as 0 in stacks, gap in groups", () => {
    const d = [
      { m: "a", s: "A", v: null },
      { m: "a", s: "B", v: 5 },
    ];
    expect(shape(sp(d, { stack: true })).cells.map((c) => [c.value, c.y0, c.y1])).toEqual([
      [null, 0, 0],
      [5, 0, 5],
    ]);
    expect(shape(sp(d)).cells[0]!.value).toBeNull();
  });
  it("extent includes 0", () => {
    expect(shape(sp([{ m: "a", s: "A", v: 5 }])).extent).toEqual([0, 5]);
    expect(shape(sp([])).extent).toEqual([0, 0]);
  });
  it("hidden series excluded from cells and extent", () => {
    const s = shape(
      sp([
        { m: "a", s: "A", v: 1 },
        { m: "a", s: "B", v: 100 },
      ]),
      { hidden: ["B"] },
    );
    expect(s.series).toEqual(["A", "B"]);
    expect(s.visible).toEqual([0]);
    expect(s.cells).toHaveLength(1);
    expect(s.extent).toEqual([0, 1]);
  });

  const rows: Row[] = [
    { m: "a", s: "A", v: 1 },
    { m: "a", s: "A", v: 5 },
    { m: "b", s: "A", v: 10 },
    { m: "c", s: "A", v: 20 },
    { m: "c", s: "A", v: 40 },
    { m: "d", s: "A", v: null },
  ];
  const vals = (o: Partial<ChartSpec>) => shape(sp(rows, o)).cells.map((c) => c.value);
  it("aggregates", () => {
    expect(vals({ aggregate: "sum" })).toEqual([6, 10, 60, null]);
    expect(vals({ aggregate: "mean" })).toEqual([3, 10, 30, null]);
    expect(vals({ aggregate: "count" })).toEqual([2, 1, 2, 0]);
    expect(vals({ aggregate: "min" })).toEqual([1, 10, 20, null]);
    expect(vals({ aggregate: "max" })).toEqual([5, 10, 40, null]);
  });
  it("agg reducer", () => {
    const r = agg("mean");
    expect(r.value()).toBeNull();
    r.add(2);
    r.add(4);
    expect(r.value()).toBe(3);
  });
  it("sort uses total over all series, hidden included", () => {
    const d = [
      { m: "a", s: "A", v: 1 },
      { m: "a", s: "B", v: 100 },
      { m: "b", s: "A", v: 50 },
      { m: "b", s: "B", v: 0 },
    ];
    const s = shape(sp(d, { sort: "desc" }), { hidden: ["B"] });
    expect(s.categories).toEqual(["a", "b"]);
    expect(shape(sp(d, { sort: "asc" })).categories).toEqual(["b", "a"]);
  });
  const many: Row[] = [
    { m: "w", s: "A", v: 1 },
    { m: "x", s: "A", v: 100 },
    { m: "x", s: "A", v: 50 },
    { m: "y", s: "A", v: 3 },
    { m: "y", s: "A", v: 7 },
    { m: "z", s: "A", v: 90 },
    { m: "Other", s: "A", v: 2 },
  ];
  it("limit folds the rest into OTHER, re-aggregated from raw rows", () => {
    const o = (a: NonNullable<ChartSpec["aggregate"]>) =>
      shape(sp(many, { limit: 2, aggregate: a }));
    expect(o("sum").categories).toEqual(["x", "z", OTHER]);
    expect(o("sum").cells.map((c) => c.value)).toEqual([150, 90, 13]);
    expect(o("mean").cells.map((c) => c.value)).toEqual([75, 90, (1 + 3 + 7 + 2) / 4 + 0]);
    expect(o("count").cells.map((c) => c.value)).toEqual([2, 2, 3]);
    expect(o("min").cells.map((c) => c.value)).toEqual([50, 90, 1]);
    expect(o("max").cells.map((c) => c.value)).toEqual([100, 90, 7]);
  });
  it("limit ranks descending regardless of sort; real 'Other' does not collide", () => {
    const s = shape(sp(many, { limit: 4, sort: "asc" }));
    expect(s.categories).toEqual(["Other", "y", "z", "x", OTHER]);
    expect(s.cells[4]!.value).toBe(1);
    const t = shape(sp(many, { limit: 1 }));
    expect(t.categories).toEqual(["x", OTHER]);
    expect(t.cells[1]!.value).toBe(1 + 10 + 90 + 2);
    const u = shape(sp(many, { limit: 5 }));
    expect(u.categories).toEqual(["w", "x", "y", "z", "Other"]);
  });
  it("window slices after limit and clamps to one category", () => {
    const s = shape(sp(many, { limit: 2 }), { window: [1, 2] });
    expect(s.categories).toEqual(["z", OTHER]);
    expect(shape(sp(many), { window: [-5, 99] }).categories).toHaveLength(5);
    expect(shape(sp(many), { window: [9, 3] }).categories).toHaveLength(1);
  });
  it("waterfall running totals", () => {
    const s = shape(
      resolve({
        type: "waterfall",
        data: [
          { m: "a", v: 10 },
          { m: "b", v: -4 },
          { m: "T", v: 0 },
          { m: "c", v: -8 },
        ],
        x: "m",
        y: "v",
        totals: ["T"],
      }),
    );
    expect(s.totals).toEqual([false, false, true, false]);
    expect(s.cells.map((c) => [c.y0, c.y1])).toEqual([
      [0, 10],
      [10, 6],
      [0, 6],
      [6, -2],
    ]);
    expect(s.extent).toEqual([-2, 10]);
  });
  it("prototype-ish category names", () => {
    const s = shape(
      sp([
        { m: "__proto__", s: "constructor", v: 1 },
        { m: "constructor", s: "__proto__", v: 2 },
        { m: "__proto__", s: "constructor", v: 3 },
      ]),
    );
    expect(s.categories).toEqual(["__proto__", "constructor"]);
    expect(s.series).toEqual(["constructor", "__proto__"]);
    expect(s.cells.find((c) => c.ci === 0 && c.si === 0)!.value).toBe(4);
  });
});

describe("thin", () => {
  it("returns every position when they fit", () => {
    expect(thin([[1, 2, 3]], 3)).toEqual([0, 1, 2]);
  });
  it("keeps first, last, each bucket's extremes and gap edges within max", () => {
    const v: (number | null)[] = Array.from({ length: 1000 }, (_, i) => (i * 7) % 100);
    v[500] = 9999;
    v[300] = null;
    const k = thin([v], 50);
    expect(k.length).toBeLessThanOrEqual(50);
    expect(k).toEqual([...k].sort((a, b) => a - b));
    for (const i of [0, 999, 500, 300]) expect(k).toContain(i);
  });
});
