import { describe, expect, it } from "vitest";
import { niceTicks } from "../src/core/ticks.ts";

const cases: [number, number][] = [
  [0, 0],
  [5, 5],
  [0, 1e-4],
  [0, 1],
  [0, 1e9],
  [-37, 82],
  [-1, 1],
  [3, 97],
];

describe("niceTicks", () => {
  it("zero span", () => {
    expect(niceTicks(0, 0).domain).toEqual([0, 1]);
    expect(niceTicks(5, 5).domain).toEqual([4, 6]);
  });
  for (const [a, b] of cases) {
    it(`[${a}, ${b}]`, () => {
      const t = niceTicks(a, b);
      expect(t.values.length).toBeGreaterThanOrEqual(3);
      expect(t.values.length).toBeLessThanOrEqual(8);
      expect(t.domain[0]).toBeLessThanOrEqual(a);
      expect(t.domain[1]).toBeGreaterThanOrEqual(b);
      expect(t.values[0]).toBe(t.domain[0]);
      expect(t.values.at(-1)).toBe(t.domain[1]);
      for (const v of t.values)
        expect(Math.abs(v / t.step - Math.round(v / t.step))).toBeLessThan(1e-6);
    });
  }
  it("crossing zero includes 0", () => {
    expect(niceTicks(-37, 82).values).toContain(0);
  });
});

describe("niceTicks crossing zero", () => {
  it("pads the short side by less than a step (stacked negatives)", () => {
    expect(niceTicks(-40, 510).domain).toEqual([-100, 600]);
  });
});
