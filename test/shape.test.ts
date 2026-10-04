import { describe, expect, it } from "vitest";
import { shape } from "../src/core/shape.ts";
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
      ["B"],
    );
    expect(s.series).toEqual(["A", "B"]);
    expect(s.visible).toEqual([0]);
    expect(s.cells).toHaveLength(1);
    expect(s.extent).toEqual([0, 1]);
  });
});
