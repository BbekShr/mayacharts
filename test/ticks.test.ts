import { describe, expect, it } from "vitest";
import { niceTicks, toTime } from "../src/core/ticks.ts";

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

describe("toTime plain shapes", () => {
  // The arithmetic fast path must agree with Date.parse on every shape, valid or not.
  const ISO =
    /^\d{4}-\d{2}(?:-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?)?$/;
  const ref = (v: string) => {
    const m = ISO.exec(v);
    const t = m ? Date.parse(v.length > 10 && m[1] === undefined ? v + "Z" : v) : NaN;
    return Number.isNaN(t) ? null : t;
  };
  const p = (n: number, k: number) => String(n).padStart(k, "0");
  it("matches Date.parse", () => {
    let seed = 7;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff), seed % n);
    for (let i = 0; i < 20000; i++) {
      const [Y, M, D, h, mi, s, ms] = [10000, 14, 33, 26, 62, 62, 1000].map(rnd) as [
        number,
        number,
        number,
        number,
        number,
        number,
        number,
      ];
      const d = `${p(Y, 4)}-${p(M, 2)}-${p(D, 2)}`;
      const hm = `${d}T${p(h, 2)}:${p(mi, 2)}`;
      const hms = `${hm}:${p(s, 2)}`;
      const all = [d, hm, hm + "Z", hms, hms + "Z", `${hms}.${p(ms, 3)}`, `${hms}.${p(ms, 3)}Z`];
      for (const v of all) expect(toTime(v, false)).toBe(ref(v));
    }
  });
});

describe("niceTicks crossing zero", () => {
  it("pads the short side by less than a step (stacked negatives)", () => {
    expect(niceTicks(-40, 510).domain).toEqual([-100, 600]);
  });
});
