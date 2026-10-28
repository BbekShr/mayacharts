import { describe, expect, it } from "vitest";
import { logTicks, niceTicks, toTime } from "../src/core/ticks.ts";
import { render } from "../src/core/render.ts";

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
    let t = m ? Date.parse(v.length > 10 && m[1] === undefined ? v + "Z" : v) : NaN;
    // Engines disagree on rollover (Feb 30, T24:00): the contract says not a date.
    const dim = new Date(
      new Date(0).setUTCFullYear(+v.slice(0, 4), +v.slice(5, 7), 0),
    ).getUTCDate();
    if (+v.slice(8, 10) > dim || +v.slice(11, 13) > 23) t = NaN;
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

describe("niceTicks equal huge range", () => {
  for (const v of [1e15, 1e16, 1e300]) {
    it(`[${v}, ${v}] is finite and fast`, () => {
      const t0 = performance.now();
      const t = niceTicks(v, v);
      expect(performance.now() - t0).toBeLessThan(50);
      expect(t.values.length).toBeLessThan(12);
      expect(t.values.every(Number.isFinite)).toBe(true);
    });
  }
});

describe("logTicks on a short span", () => {
  it("5 to 300 snaps to 5 to 500, not 1 to 1000", () => {
    const t = logTicks(5, 300);
    expect(t.domain).toEqual([5, 500]);
    expect(t.values).toEqual([5, 10, 20, 50, 100, 200, 500]);
  });
  it("a wide span stays on whole decades", () => {
    expect(logTicks(2, 5000).values).toEqual([1, 10, 100, 1000, 10000]);
  });
});

describe("engine-independent ISO and denormals", () => {
  it("an impossible day or hour 24 is not a date (V8 rolls over, Firefox and Safari do not)", () => {
    for (const v of [
      "2024-02-30",
      "2023-02-29",
      "2024-04-31",
      "2024-02-10T24:00",
      "2024-02-10T24:00:00Z",
    ])
      expect(toTime(v)).toBeNull();
    expect(toTime("2024-02-29")).toBe(Date.UTC(2024, 1, 29));
    expect(toTime("2024-02-10T23:59")).toBe(Date.UTC(2024, 1, 10, 23, 59));
  });
  it("denormal spans draw no NaN", () => {
    const cases: number[][] = [
      [1e-307, 2e-307],
      [0, 5e-324],
      [5e-324, 1e-323],
      [-5e-324, 5e-324],
    ];
    for (const [a, b] of cases) {
      const t = niceTicks(a!, b!);
      expect(t.values.length).toBeGreaterThan(1);
      expect(t.domain.every(Number.isFinite)).toBe(true);
      const svg = render({
        type: "bar",
        x: "c",
        y: "v",
        data: [
          { c: "a", v: a },
          { c: "b", v: b },
        ],
      } as never);
      expect(svg).not.toContain("NaN");
      const sc = render({
        type: "scatter",
        x: "c",
        y: "v",
        data: [
          { c: a, v: a },
          { c: b, v: b },
        ],
      } as never);
      expect(sc).not.toContain("NaN");
    }
  });
});
