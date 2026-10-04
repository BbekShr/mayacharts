import { describe, expect, it } from "vitest";
import { shape } from "../src/core/shape.ts";
import { esc, key, OTHER } from "../src/core/svg.ts";
import { niceTicks } from "../src/core/ticks.ts";
import { resolve, validateSpec } from "../src/core/validate.ts";

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const N = 200;

describe("niceTicks", () => {
  it("covers the domain with 3-8 step-multiple ticks", () => {
    const rnd = mulberry32(1);
    for (let i = 0; i < N; i++) {
      const span = 10 ** (rnd() * 18 - 9) * (0.5 + rnd());
      const min = (rnd() * 20 - 10) * span;
      const max = min + span;
      const { domain, values, step } = niceTicks(min, max);
      const ctx = `min=${min} max=${max} -> ${JSON.stringify({ domain, step, n: values.length })}`;
      const tol = step * 1e-6;
      expect(domain[0], ctx).toBeLessThanOrEqual(min + tol);
      expect(domain[1], ctx).toBeGreaterThanOrEqual(max - tol);
      expect(values[0], ctx).toBe(domain[0]);
      expect(values.at(-1), ctx).toBe(domain[1]);
      expect(values.length, ctx).toBeGreaterThanOrEqual(3);
      expect(values.length, ctx).toBeLessThanOrEqual(8);
      for (const v of values) {
        const k = Math.round(v / step);
        expect(Math.abs(v - k * step), ctx).toBeLessThanOrEqual(
          Math.abs(step) * 1e-9 + Math.abs(v) * 1e-11,
        );
      }
    }
  });
  it("handles min === max and tiny/huge magnitudes", () => {
    for (const v of [0, 1, -1, 1e-9, 1e12, -5e8]) {
      const t = niceTicks(v, v);
      expect(t.domain[0]).toBeLessThanOrEqual(v);
      expect(t.domain[1]).toBeGreaterThanOrEqual(v);
      expect(t.values.length).toBeGreaterThanOrEqual(2);
    }
  });
});

const mk = (extra: object, data: object[]) => {
  const s = { type: "bar", x: "c", y: "v", data, ...extra } as never;
  validateSpec(s);
  return resolve(s);
};

describe("shape limit", () => {
  it("sum: kept + Other == total of all rows", () => {
    const rnd = mulberry32(2);
    for (let i = 0; i < N; i++) {
      const cats = 1 + Math.floor(rnd() * 40);
      const data = Array.from({ length: 5 + Math.floor(rnd() * 80) }, () => ({
        c: "k" + Math.floor(rnd() * cats),
        v: Math.floor(rnd() * 200) - 50,
      }));
      const limit = 1 + Math.floor(rnd() * 20);
      const total = data.reduce((a, r) => a + r.v, 0);
      const sh = shape(
        mk({ limit, aggregate: "sum", ...(rnd() < 0.5 ? { sort: "desc" } : {}) }, data),
      );
      const sum = sh.cells.reduce((a, c) => a + (c.value ?? 0), 0);
      expect(sum).toBe(total);
      const distinct = new Set(data.map((r) => r.c)).size;
      expect(sh.categories.length).toBe(distinct > limit ? limit + 1 : distinct);
      if (distinct > limit) expect(sh.categories.at(-1)).toBe(OTHER);
    }
  });
  it("mean: Other equals the mean of the folded raw rows", () => {
    const rnd = mulberry32(3);
    let checked = 0;
    for (let i = 0; i < N; i++) {
      const cats = 3 + Math.floor(rnd() * 30);
      const data = Array.from({ length: 10 + Math.floor(rnd() * 60) }, () => ({
        c: "k" + Math.floor(rnd() * cats),
        v: Math.floor(rnd() * 100),
      }));
      const limit = 1 + Math.floor(rnd() * 5);
      const sh = shape(mk({ limit, aggregate: "mean" }, data));
      const oi = sh.categories.indexOf(OTHER);
      if (oi < 0) continue;
      const kept = new Set(sh.categories.filter((c) => c !== OTHER));
      const folded = data.filter((r) => !kept.has(r.c)).map((r) => r.v);
      const mean = folded.reduce((a, v) => a + v, 0) / folded.length;
      const cell = sh.cells.find((c) => c.ci === oi)!;
      expect(cell.value).toBeCloseTo(mean, 9);
      checked++;
    }
    expect(checked).toBeGreaterThan(50);
  });
});

describe("key()", () => {
  it("is injective over random tuples including ~ and %", () => {
    const rnd = mulberry32(4);
    const alpha = [
      "a",
      "b",
      "~",
      "%",
      "%7E",
      "7E",
      "é",
      "😀",
      " ",
      "/",
      "",
      "Other",
      "\u0000",
      "~~",
    ];
    const str = () =>
      Array.from(
        { length: Math.floor(rnd() * 5) },
        () => alpha[Math.floor(rnd() * alpha.length)],
      ).join("");
    const seen = new Map<string, string>();
    for (let i = 0; i < N * 10; i++) {
      const tuple = Array.from({ length: 1 + Math.floor(rnd() * 3) }, str);
      const k = key(...tuple);
      const id = JSON.stringify(tuple);
      const prev = seen.get(k);
      if (prev !== undefined) expect(prev, `collision on ${k}`).toBe(id);
      seen.set(k, id);
    }
    expect(seen.size).toBeGreaterThan(200);
    // each part is encoded so the separator count equals parts - 1
    expect(key("a~b", "c%d").split("~")).toHaveLength(2);
  });
});

describe("esc()", () => {
  it("round-trips through a tiny parser and leaves no raw specials", () => {
    const rnd = mulberry32(5);
    const alpha = ["<", ">", "&", '"', "'", "a", "&amp;", "&lt;", "&#39;", "é", " ", "😀", "\n"];
    const unesc = (s: string) =>
      s.replace(
        /&(amp|lt|gt|quot|#39);/g,
        (_, e: string) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" })[e]!,
      );
    for (let i = 0; i < N; i++) {
      const s = Array.from(
        { length: Math.floor(rnd() * 20) },
        () => alpha[Math.floor(rnd() * alpha.length)],
      ).join("");
      const e = esc(s);
      expect(e).not.toMatch(/[<>"']/);
      expect(e.replace(/&(amp|lt|gt|quot|#39);/g, "")).not.toContain("&");
      expect(unesc(e)).toBe(s);
    }
    expect(esc(12.5)).toBe("12.5");
  });
});

describe("OTHER", () => {
  it("never collides with a user category called Other", () => {
    expect(OTHER).not.toBe("Other");
    const rnd = mulberry32(6);
    for (let i = 0; i < N; i++) {
      const data = Array.from({ length: 30 }, (_, j) => ({
        c: j === 0 || rnd() < 0.1 ? "Other" : "c" + Math.floor(rnd() * 15),
        v: 1 + Math.floor(rnd() * 9),
      }));
      const limit = 1 + Math.floor(rnd() * 6);
      const sh = shape(mk({ limit }, data));
      expect(sh.categories.filter((c) => c === OTHER)).toHaveLength(1);
      expect(sh.categories.filter((c) => c === "Other").length).toBeLessThanOrEqual(1);
      expect(new Set(sh.categories).size).toBe(sh.categories.length);
      expect(key("Other")).not.toBe(key(OTHER));
    }
  });
});
