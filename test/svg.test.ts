import { describe, expect, it } from "vitest";
import { DEG, TAU } from "../src/core/scale.ts";
import { clip, tw } from "../src/core/svg.ts";

describe("svg helpers", () => {
  it("tw counts code points, not UTF-16 units", () => {
    expect(tw("abc")).toBeCloseTo(3 * 7.2 + 4);
    expect(tw("abc", 12)).toBeCloseTo(3 * 7.2 + 12);
    expect(tw("😀")).toBeCloseTo(7.2 + 4);
  });
  it("clip cuts by code point with an ellipsis", () => {
    expect(clip("abc", 3)).toBe("abc");
    expect(clip("abcdef", 4)).toBe("abc…");
    expect(clip("abcdef", 0)).toBe("a…");
    expect(clip("😀😀😀😀", 3)).toBe("😀😀…");
  });
  it("angle constants", () => {
    expect(TAU).toBeCloseTo(6.2832, 4);
    expect(DEG * Math.PI).toBeCloseTo(180);
  });
});
