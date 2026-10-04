import { describe, expect, it } from "vitest";
import { bandScale, linearScale } from "../src/core/scale.ts";

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
