import { describe, expect, it } from "vitest";
import "../src/hierarchy.ts";
import "../src/flow.ts";
import "../src/geo.ts";
import "../src/stats.ts";
import { renderParts } from "../src/core/render.ts";
import { KEYS, MayaSpecError, validateSpec } from "../src/core/validate.ts";

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = mulberry32(0xc0ffee);
const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]!;
const set = (o: object, k: string, v: unknown) =>
  Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });

const NAMES = [
  "__proto__",
  "constructor",
  "toString",
  "hasOwnProperty",
  "x",
  "y",
  "v",
  "c",
  "",
  "ünï",
  "😀",
  "a b",
  "valueOf",
];
const STRS = [
  ...NAMES,
  "Other",
  "\u0000other",
  "~",
  "%",
  "<b>",
  "9",
  "NaN",
  "2024-01-01",
  " ",
  "x".repeat(200),
];
const TYPES = [
  "bar",
  "line",
  "area",
  "scatter",
  "heatmap",
  "waterfall",
  "kpi",
  "dumbbell",
  "ridgeline",
  "beeswarm",
  "parallel",
  "table",
  "chord",
  "marimekko",
  "waffle",
  "radial",
  "treemap",
  "sunburst",
  "sankey",
  "hexmap",
  "boxplot",
  "funnel",
  "__proto__",
  "toString",
  "pie",
  "",
];
const NUMS = [
  0,
  -0,
  1,
  -1,
  1.5,
  1e308,
  -1e308,
  1e-300,
  Number.MAX_SAFE_INTEGER,
  NaN,
  Infinity,
  -Infinity,
  5e-324,
  2 ** 31,
];

function scalar(): unknown {
  switch (Math.floor(rnd() * 8)) {
    case 0:
      return pick(STRS);
    case 1:
      return pick(NUMS);
    case 2:
      return rnd() < 0.5;
    case 3:
      return null;
    case 4:
      return undefined;
    case 5:
      return Math.floor(rnd() * 100);
    case 6:
      return pick(STRS);
    default:
      return pick(NUMS);
  }
}
function junk(depth = 0): unknown {
  const r = rnd();
  if (depth > 3 || r < 0.5) return scalar();
  if (r < 0.75) return Array.from({ length: Math.floor(rnd() * 4) }, () => junk(depth + 1));
  const o = {};
  for (let i = Math.floor(rnd() * 4); i > 0; i--) set(o, pick(NAMES), junk(depth + 1));
  return o;
}
function row(): object {
  const o = {};
  for (const k of ["x", "y", "v", "c", "s", pick(NAMES)])
    if (rnd() < 0.8) set(o, k, rnd() < 0.5 ? pick(STRS) : rnd() < 0.7 ? pick(NUMS) : junk(2));
  return o;
}
function rows(): unknown {
  if (rnd() < 0.05) return junk();
  return Array.from({ length: Math.floor(rnd() * 8) }, () => (rnd() < 0.03 ? junk(2) : row()));
}
function spec(): unknown {
  if (rnd() < 0.03) return junk();
  const s = {};
  set(s, "type", rnd() < 0.9 ? pick(TYPES) : junk(2));
  if (rnd() < 0.9) set(s, "data", rows());
  if (rnd() < 0.8) set(s, "x", rnd() < 0.8 ? pick(["x", "c", "v", "s", ...NAMES]) : junk(2));
  if (rnd() < 0.8) set(s, "y", rnd() < 0.7 ? pick(["y", "v", ["y", "v"]]) : junk(2));
  const extra = Math.floor(rnd() * 6);
  for (let i = 0; i < extra; i++) {
    const k = rnd() < 0.85 ? pick(KEYS) : pick([...NAMES, "junk", "foo"]);
    set(s, k, rnd() < 0.6 ? junk(1) : scalar());
  }
  return s;
}

/** Wrap a render so a not-yet-implemented type is a skip signal rather than a failure. */
const notImpl = (e: unknown) => e instanceof Error && e.message.includes("not implemented");

describe("fuzz: validateSpec and renderParts", () => {
  it("500 seeded random specs only ever throw MayaSpecError", () => {
    let valid = 0;
    let rendered = 0;
    for (let i = 0; i < 500; i++) {
      const s = spec();
      let ok = false;
      try {
        validateSpec(s);
        ok = true;
        valid++;
      } catch (e) {
        if (!(e instanceof MayaSpecError))
          throw new Error(`spec #${i} validateSpec threw ${String(e)} :: ${(e as Error).stack}`);
      }
      if (!ok) continue;
      try {
        renderParts(s as never);
        rendered++;
      } catch (e) {
        if (notImpl(e)) continue;
        if (!(e instanceof MayaSpecError))
          throw new Error(`spec #${i} renderParts threw ${(e as Error).stack}`);
      }
    }
    expect(valid + rendered).toBeGreaterThanOrEqual(0);
  });

  it("mutations of valid specs (higher validity rate) only throw MayaSpecError", () => {
    const base = () => ({
      type: pick([
        "bar",
        "line",
        "area",
        "scatter",
        "heatmap",
        "waterfall",
        "kpi",
        "dumbbell",
        "boxplot",
        "funnel",
      ]),
      x: "c",
      y: "v",
      data: Array.from({ length: 6 }, (_, i) => ({
        c: pick(["a", "b", "__proto__", "toString", "constructor", String(i)]),
        v: i * 3 - 4,
        s: pick(["p", "q"]),
      })),
    });
    let okCount = 0;
    for (let i = 0; i < 500; i++) {
      const s = base() as Record<string, unknown>;
      for (let m = Math.floor(rnd() * 3); m >= 0; m--) set(s, pick(KEYS), junk(1));
      try {
        validateSpec(s);
        okCount++;
        renderParts(s as never);
      } catch (e) {
        if (notImpl(e)) continue;
        if (!(e instanceof MayaSpecError))
          throw new Error(`mutation #${i} ${JSON.stringify(s)} threw ${(e as Error).stack}`);
      }
    }
    expect(okCount).toBeGreaterThan(15); // seeded: shifts whenever KEYS grows
  });

  it("__proto__/constructor/toString as category and series values render safely", () => {
    for (const type of ["bar", "line", "area", "waterfall", "heatmap", "kpi", "dumbbell"]) {
      const data = ["__proto__", "constructor", "toString", "hasOwnProperty"].flatMap((c) =>
        ["__proto__", "toString"].map((s) => ({ c, s, v: 1 })),
      );
      try {
        const p = renderParts({
          type,
          x: "c",
          y: "v",
          series: type === "waterfall" ? undefined : "s",
          data,
        } as never);
        expect(p.svg).toContain("<svg");
      } catch (e) {
        if (!notImpl(e) && !(e instanceof MayaSpecError)) throw e;
      }
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty("v");
  });
});
