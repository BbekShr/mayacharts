import { describe, expect, it } from "vitest";
import { bandScale, linearScale, ramp } from "../src/core/scale.ts";

describe("bandScale", () => {
  it("single datum fills range when padOuter is 0", () => {
    const b = bandScale(["a"], [0, 100], 0.1, 0);
    expect(b.bandwidth).toBeCloseTo(100);
    expect(b.at(0)).toBeCloseTo(0);
  });
  it("padding math", () => {
    const b = bandScale(["a", "b", "c"], [0, 300], 0.2, 0);
    expect(b.step).toBeCloseTo(300 / 2.8);
    expect(b.bandwidth).toBeCloseTo(b.step * 0.8);
    expect(b.at(2) + b.bandwidth).toBeCloseTo(300);
  });
  it("centers with outer padding", () => {
    const b = bandScale(["a", "b"], [0, 100]);
    expect(b.at(0)).toBeCloseTo(100 - b.at(1) - b.bandwidth);
  });
});

describe("linearScale", () => {
  it("inverted range", () => {
    const s = linearScale([0, 10], [100, 0]);
    expect(s.of(0)).toBe(100);
    expect(s.of(10)).toBe(0);
    expect(s.of(5)).toBe(50);
  });
  it("zero-span domain maps to range midpoint", () => {
    expect(linearScale([3, 3], [100, 0]).of(3)).toBe(50);
  });
});

describe("ramp (colorScale)", () => {
  const v = [1, 2, 3, 4, 100];
  it("linear by value, rank by order, log by log10", () => {
    expect(ramp(v).q(1)).toBe(0);
    expect(ramp(v).q(4)).toBe(0);
    expect(ramp(v).q(100)).toBe(9);
    expect(v.map(ramp(v, "rank").q)).toEqual([0, 2, 5, 7, 9]);
    expect(ramp([1, 10, 100], "log").q(10)).toBe(5);
    expect(ramp([5, 5]).q(5)).toBe(9);
  });
  it("quantile: five equal-count classes and their breaks", () => {
    const q = ramp([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], "quantile");
    expect(q.breaks).toEqual([1, 3, 5, 7, 9, 10]);
    expect([1, 3, 5, 7, 9].map(q.q)).toEqual([0, 2, 5, 7, 9]);
  });
  it("diverging: mid at the centre, the farther end at its end", () => {
    const d = ramp([-10, 0, 5], "linear", 0);
    expect([d.q(-10), d.q(0), d.q(5)]).toEqual([0, 5, 7]);
  });
});

describe("ramp ties and rank labels (M2)", () => {
  it("quantile collapses tied breaks and spreads steps over the real classes", () => {
    const r = ramp([1, 1, 1, 1, 1, 1, 1, 2, 3, 9], "quantile");
    expect(r.breaks).toEqual([1, 3, 9]);
    expect(r.q(1)).toBe(0);
    expect(r.q(9)).toBe(9);
    expect(r.steps).toEqual([0, 9]);
    const five = ramp([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], "quantile");
    expect(five.steps).toEqual([0, 2, 5, 7, 9]);
    expect(five.breaks).toHaveLength(6);
  });
  it("quantile with one value above a long tie still separates the top", () => {
    const r = ramp([1, 1, 1, 1, 1, 1, 1, 1, 1, 9], "quantile");
    expect([r.q(1), r.q(9)]).toEqual([0, 9]);
  });
  it("rank labels lowest, median and highest", () => {
    expect(ramp([1, 2, 3, 4, 100], "rank").labels).toEqual([1, 3, 100]);
    expect(ramp([5, 7], "rank").labels).toEqual([5, 7]);
  });
});
