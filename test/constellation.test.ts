import { describe, expect, it } from "vitest";
import { render } from "../src/index.ts";
import "../src/constellation.ts";
import type { ChartSpec } from "../src/core/types.ts";

type R = Record<string, string | number | null>;
const rows = (n: number): R[] =>
  Array.from({ length: n }, (_, i) => ({
    n: `Star ${i}`,
    a: (i * 7) % 11,
    b: (i * 5) % 13,
    c: (i * 3) % 7,
  }));
const spec = (data: R[], extra: object = {}): ChartSpec =>
  ({ type: "constellation", x: "n", y: ["a", "b", "c"], data, ...extra }) as ChartSpec;
const stars = (svg: string) =>
  [...svg.matchAll(/<circle [^>]*data-maya="mark"[^>]*>/g)].map((m) => m[0]);
const at = (t: string, a: string) => new RegExp(` ${a}="([^"]*)"`).exec(t)?.[1];
const pos = (svg: string) =>
  new Map(stars(svg).map((t) => [at(t, "data-x")!, [+at(t, "cx")!, +at(t, "cy")!]]));

describe("constellation", () => {
  const svg = render(spec(rows(20)));

  it("draws one keyed star per row with measures, neighbours and lighting lists", () => {
    const s = stars(svg);
    expect(s).toHaveLength(20);
    expect(at(s[0]!, "data-key")).toMatch(/^c~Star%20/);
    for (const t of s) {
      expect(at(t, "data-f")).toContain("a\t");
      expect(at(t, "data-f")).toContain("Closest: ");
      expect(at(t, "data-n")).toBeDefined();
    }
    // hovering star i lights the stars whose data-a lists i: exactly i's 3 nearest
    const lit = (i: number) =>
      s.filter((t) => (at(t, "data-a") ?? "").split(" ").includes(String(i)));
    for (let i = 0; i < 20; i++) expect(lit(i).length).toBe(3);
  });

  it("is deterministic and keeps keys across renders", () => {
    expect(render(spec(rows(20)))).toBe(svg);
    const k = (v: string) =>
      stars(v)
        .map((t) => at(t, "data-key"))
        .sort();
    expect(k(render(spec(rows(20), { size: "b" })))).toEqual(k(svg));
  });

  it("gives the same layout when the row order changes (sign-normalised)", () => {
    const a = pos(svg);
    const b = pos(render(spec([...rows(20)].reverse())));
    for (const [name, [x, y]] of a) {
      expect(Math.abs(b.get(name)![0]! - x!)).toBeLessThan(0.1);
      expect(Math.abs(b.get(name)![1]! - y!)).toBeLessThan(0.1);
    }
  });

  it("keeps stars inside the viewBox", () => {
    for (const t of stars(svg)) {
      expect(+at(t, "cx")!).toBeGreaterThan(0);
      expect(+at(t, "cx")!).toBeLessThan(640);
      expect(+at(t, "cy")!).toBeGreaterThan(0);
    }
  });

  it("survives a zero-variance measure and constant data", () => {
    const flat = rows(10).map((r) => ({ ...r, c: 4 }));
    expect(stars(render(spec(flat)))).toHaveLength(10);
    const same = rows(6).map((r) => ({ ...r, a: 1, b: 1, c: 1 }));
    const out = render(spec(same));
    expect(out).not.toMatch(/NaN|Infinity/);
    expect(stars(out)).toHaveLength(6);
  });

  it("leaves out rows with a non-number measure and says so", () => {
    const d = rows(8);
    d[2]!.a = null;
    d[5]!.b = null;
    const out = render(spec(d));
    expect(stars(out)).toHaveLength(6);
    expect(out).toMatch(/2 of 8 rows have a missing measure/);
  });

  it("places 1, 2 and 3 rows", () => {
    const one = stars(render(spec(rows(1))));
    expect(one).toHaveLength(1);
    expect(+at(one[0]!, "cx")!).toBeCloseTo(+at(one[0]!, "cx")!);
    const two = stars(render(spec(rows(2))));
    expect(at(two[0]!, "cy")).toBe(at(two[1]!, "cy"));
    expect(at(two[0]!, "cx")).not.toBe(at(two[1]!, "cx"));
    expect(stars(render(spec(rows(3))))).toHaveLength(3);
    expect(render(spec(rows(2)))).not.toMatch(/NaN/);
  });

  it("escapes hostile names and numbers duplicate names", () => {
    const d = rows(4);
    d[0]!.n = '"><script>alert(1)</script>';
    d[1]!.n = d[2]!.n = "Dup";
    const out = render(spec(d));
    expect(out).not.toContain("<script>");
    const keys = stars(out).map((t) => at(t, "data-key"));
    expect(new Set(keys).size).toBe(4);
  });

  it("renders right-to-left names like any others", () => {
    const d = rows(5);
    d[0]!.n = "حساب أول";
    expect(stars(render(spec(d)))).toHaveLength(5);
  });

  it("honours colorBy ramp and sign", () => {
    expect(stars(render(spec(rows(6), { colorBy: "b" })))[0]).toMatch(/data-q=/);
    const neg = rows(6).map((r, i) => ({ ...r, a: i - 3 }));
    expect(stars(render(spec(neg, { colorBy: "sign" }))).join("")).toMatch(/data-tone=/);
  });

  it("describes the measures in the table", () => {
    expect(svg).toContain("Constellation");
    expect(render(spec(rows(20)))).toMatch(/Closer points are more alike across a, b, c/);
  });

  it("fails clearly above 500 rows or 12 measures", () => {
    expect(() => render(spec(rows(501)))).toThrow(/mayacharts/);
    expect(() => render(spec(rows(501)))).toThrow(/at most 500/);
    const d = rows(5).map((r) => ({
      ...r,
      ...Object.fromEntries("defghijklmn".split("").map((k, i) => [k, i])),
    }));
    const y = ["a", "b", "c", ..."defghijklmn".split("")];
    expect(y).toHaveLength(14);
    expect(() => render(spec(d, { y }))).toThrow(/at most 12/);
    expect(stars(render(spec(rows(500))))).toHaveLength(500);
  });

  it("is pure core: imports with window and document deleted", async () => {
    const g = globalThis as Record<string, unknown>;
    const saved = [g.window, g.document];
    delete g.window;
    delete g.document;
    try {
      const m = await import(/* @vite-ignore */ "../src/constellation.ts" + "");
      expect(m.constellation.noun).toBe("Constellation");
      expect(stars(render(spec(rows(5))))).toHaveLength(5);
    } finally {
      [g.window, g.document] = saved;
    }
  });
  it("names stars that do not sit on other stars", () => {
    const s = render(spec(rows(30)));
    const names = [...s.matchAll(/<text[^>]*data-key="c~[^"]*"/g)];
    expect(names.length).toBeGreaterThan(1);
    expect(names.length).toBeLessThanOrEqual(5);
  });
  it("names up to five stars, beside a star when above and below are taken, and clips the hint", () => {
    const out = render(spec(rows(60)), { width: 240, height: 200 });
    const names = [...out.matchAll(/<text [^>]*>(Star \d+)<\/text>/g)];
    expect(names.length).toBeGreaterThan(0);
    expect(names.length).toBeLessThanOrEqual(5);
    expect(out).toContain("Closer points are more alike");
    expect(out).toContain("…</text>");
  });
});
