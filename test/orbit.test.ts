import { describe, expect, it } from "vitest";
import { render, renderParts } from "../src/index.ts";
import "../src/orbit.ts";
import type { ChartSpec } from "../src/core/types.ts";

const data = [
  { f: "Shoes", s: 90, g: 30 },
  { f: "Hats", s: 60, g: -10 },
  { f: "Socks", s: 40, g: 6 },
  { f: "Coats", s: 20, g: 0 },
];
const spec: ChartSpec = { type: "orbit", x: "f", y: "s", y2: "g", colorBy: "sign", data };
const svg = (s: ChartSpec, o = {}) => renderParts(s, o).svg;
const planets = (s: string) => [...s.matchAll(/<circle data-maya="mark"[^>]*>/g)].map((m) => m[0]);
const attr = (tag: string, a: string) => new RegExp(` ${a}="([^"]*)"`).exec(tag)?.[1];
const buckets = (s: string) =>
  [...s.matchAll(/<g data-v="(\d)"( data-neg="")?><path/g)].map((m) => m.slice(1));

describe("orbit", () => {
  it("one keyed planet per category, ranked by size, plus the sun total", () => {
    const s = svg(spec);
    const p = planets(s);
    expect(p.map((t) => attr(t, "data-x"))).toEqual(["Shoes", "Hats", "Socks", "Coats"]);
    expect(p[0]).toContain('data-key="~Shoes"');
    expect(Number(attr(p[0]!, "cx")) ** 2 + Number(attr(p[0]!, "cy")) ** 2).toBeGreaterThan(0);
    expect(s).toContain('data-key="t"');
    expect(s).toContain("210");
  });
  it("is deterministic and keeps keys across data changes", () => {
    expect(svg(spec)).toBe(svg(spec));
    const keys = (s: string) => [...s.matchAll(/data-key="([^"]*)"/g)].map((m) => m[1]);
    const more = { ...spec, data: data.map((d) => ({ ...d, s: d.s * 2 })) };
    expect(keys(svg(more))).toEqual(keys(svg(spec)));
  });
  it("assigns speed buckets by growth and reverses negatives", () => {
    const b = buckets(svg(spec));
    expect(b).toEqual([
      ["5", undefined],
      ["2", ' data-neg=""'],
      ["1", undefined],
    ]);
    expect(svg(spec)).toContain("data-trail");
  });
  it("without y2 nothing moves and there are no trails", () => {
    const s = svg({ type: "orbit", x: "f", y: "s", data });
    expect(s).not.toContain("data-v=");
    expect(s).not.toContain("data-trail");
    expect(planets(s)).toHaveLength(4);
  });
  it("limit rolls the rest into a static Other on the outer orbit", () => {
    const s = svg({ ...spec, limit: 2 });
    const p = planets(s);
    expect(p).toHaveLength(3);
    expect(p[2]).toContain('data-other=""');
    expect(buckets(s)).toHaveLength(2);
  });
  it("honours sort", () => {
    const p = planets(svg({ ...spec, sort: "asc" }));
    expect(attr(p[0]!, "data-x")).toBe("Coats");
  });
  it("hostile strings are escaped", () => {
    const s = svg({ ...spec, data: [{ f: '"><script>x</script>', s: 5, g: 1 }] });
    expect(s).not.toContain("<script>");
  });
  it("empty and one row", () => {
    expect(planets(svg({ ...spec, data: [] }))).toHaveLength(0);
    expect(planets(svg({ ...spec, data: [data[0]!] }))).toHaveLength(1);
  });
  it("rtl keeps the geometry and the description names the growth", () => {
    expect(svg({ ...spec, locale: "ar" })).toContain("data-v=");
    expect(render(spec)).toContain("Orbit speed shows g");
  });
  it("is pure core: imports with window and document deleted", async () => {
    const g = globalThis as Record<string, unknown>;
    const [w, d] = [g.window, g.document];
    delete g.window;
    delete g.document;
    try {
      const m = await import(/* @vite-ignore */ "../src/orbit.ts" + "");
      expect(m.orbit.noun).toBe("Orbit");
    } finally {
      g.window = w;
      g.document = d;
    }
  });
  it("a name rides inside its planet's turning group, right after the planet", () => {
    const s = svg(spec);
    const names = [
      ...s.matchAll(/<g data-v="\d"[^>]*>(?:<path [^>]*>)?<circle [^>]*\/><g data-up/g),
    ];
    expect(names.length).toBeGreaterThan(0);
    expect(s).not.toContain('~l"');
    expect(planets(s).map((t) => attr(t, "data-n"))).toEqual(["0", "1", "2", "3"]);
  });
  it("the sun adds the magnitudes, as the planet areas do", () => {
    const s = svg({ ...spec, data: [...data, { f: "Bags", s: -30, g: 2 }] });
    expect(s).toContain("240");
  });
  it("puts growth labels outward from the planet, with the % of the title", () => {
    const s = svg({ ...spec, titles: { g: "Growth (%)" } });
    expect(s).toContain("+30%");
    expect(s).toContain("-10%");
  });
  it("growth is localised: no ASCII percent sign in Arabic, wrapped in an isolate", () => {
    const s = svg({ ...spec, locale: "ar-EG", titles: { g: "Growth (%)" } });
    expect(s).not.toContain("+30%");
    expect(s).toContain("\u2066");
    expect(s).toContain("\u066a");
  });
  it("names keep their ends and stay unique when long", () => {
    const rows = [12, 13].map((i) => ({ f: `Region number ${i}`, s: 50 - i, g: i }));
    const s = svg({ ...spec, data: rows });
    expect(s).toContain("… 12");
    expect(s).toContain("… 13");
  });
  it("only a few planets are named", () => {
    const rows = Array.from({ length: 16 }, (_, i) => ({ f: `P${i}`, s: 100 - i, g: i - 5 }));
    const s = svg({ ...spec, data: rows });
    expect([...s.matchAll(/data-key="o~[^"]*~l"/g)].length).toBeLessThanOrEqual(6);
  });
  it("negative values: the sun says gross, the planet is paler, zero growth is neutral", () => {
    const neg = svg({ ...spec, data: [...data, { f: "Bags", s: -30, g: 2 }] });
    expect(neg).toContain("Gross s");
    expect(neg).toContain('data-below=""');
    expect(svg(spec)).not.toContain("Gross");
    const zero = planets(svg(spec)).find((t) => attr(t, "data-x") === "Coats")!;
    expect(zero).toContain('data-tone="zero"');
  });
  it("the sign legend names the measure", () => {
    expect(renderParts({ ...spec, titles: { g: "Growth (%)" } }).legend).toContain(
      "<b>Growth (%)</b>",
    );
  });
});

describe("orbit labels", () => {
  const rows = Array.from({ length: 16 }, (_, i) => ({
    f: `Planet ${i}`,
    s: 100 - i * 5,
    g: i - 5,
  }));
  const sp = { ...spec, data: rows } as ChartSpec;
  const box = (s: string) =>
    [...s.matchAll(/<g data-up[^>]*><text x="([-\d.]+)" y="([-\d.]+)"/g)].map((m) => [
      Number(m[1]),
      Number(m[2]),
    ]);
  it("names are largest first and never overlap each other", () => {
    const b = box(svg(sp));
    expect(b.length).toBeGreaterThan(2);
    for (const [i, p] of b.entries())
      for (const q of b.slice(i + 1))
        expect(Math.abs(p[0]! - q[0]!) > 40 || Math.abs(p[1]! - q[1]!) > 22).toBe(true);
    expect(svg(sp)).toContain(">Planet 0<");
  });
  it("planets stay inside their lane", () => {
    const r = planets(svg(sp)).map((t) => Number(attr(t, "r")));
    expect(Math.max(...r)).toBeLessThan(10);
  });
  it("zero under sign is its own tone", () => {
    expect(svg(spec)).toContain('data-tone="zero"');
  });
});
