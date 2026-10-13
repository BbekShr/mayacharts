import { describe, expect, it } from "vitest";
import { renderParts } from "../src/index.ts";
import "../src/radial.ts";
import type { ChartSpec } from "../src/core/types.ts";

const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const data = M.flatMap((m, i) => ["N", "S"].map((r, j) => ({ m, r, v: 10 + i + j * 5 })));
const spec: ChartSpec = { type: "radial", x: "m", y: "v", series: "r", data };
const svg = (s: ChartSpec, hidden?: string[]) =>
  renderParts(s, hidden ? { view: { hidden } } : {}).svg;
const plain = (data: ChartSpec["data"], more: Partial<ChartSpec> = {}): ChartSpec => ({
  type: "radial",
  x: "m",
  y: "v",
  data,
  ...more,
});
const tags = (s: string, re: string) =>
  [...s.matchAll(new RegExp(`<${re}[^>]*>`, "g"))].map((m) => m[0]);
const marks = (s: string) => tags(s, 'path data-maya="mark"');

describe("radial", () => {
  it("one sector per category and series with payload", () => {
    const m = marks(svg(spec));
    expect(m).toHaveLength(24);
    expect(m[0]).toContain('data-key="N~Jan"');
    expect(m[0]).toContain('data-x="Jan"');
    expect(m[0]).toContain('data-s="0"');
    expect(m[1]).toContain('data-s="1"');
    expect(m[1]).toContain('data-y="15"');
  });
  it("marks group holds only keyed children", () => {
    const g = svg(spec).match(/<g data-maya="marks">(.*?)<\/g>/s)![1]!;
    expect(g.match(/<\w+ /g)!.length).toBe(g.match(/data-key=/g)!.length);
  });
  it("without series uses slot 0", () => {
    const m = marks(svg(plain(data.filter((d) => d.r === "N"))));
    expect(m).toHaveLength(12);
    expect(m.every((t) => t.includes('data-s="0"'))).toBe(true);
  });
  it("hidden series drops its sectors", () => {
    expect(marks(svg(spec, ["S"]))).toHaveLength(12);
  });
  it("draws rings and a label per month at 390x300", () => {
    const s = renderParts(spec, { width: 390, height: 300 }).svg;
    const rings = tags(s, "circle").filter((c) => !c.includes("data-disc"));
    expect(rings.length).toBeGreaterThan(0);
    expect(rings.length).toBeLessThanOrEqual(3);
    expect(tags(s, "text[^>]*data-cat").length).toBe(12);
  });
  it("centre shows the title and the grand total", () => {
    const s = renderParts({ ...spec, titles: { v: "Volume" } }, { width: 600, height: 480 }).svg;
    const t = s.match(/<text[^>]*data-total[^>]*>([^<]*)</)![1];
    expect(t).toBe(String(data.reduce((a, d) => a + d.v, 0)));
    expect(s).toMatch(/data-ring[^>]*>Volume</);
    expect(svg(plain([{ m: "A", v: 5 }]))).toMatch(/data-ring[^>]*>v</);
  });
  it("categories share data-c so a stack lights together", () => {
    const m = marks(svg(spec));
    expect(m[0]).toContain('data-c="0"');
    expect(m[1]).toContain('data-c="0"');
    expect(m[2]).toContain('data-c="1"');
  });
  it("outermost ring is labelled and clear of the bars' angular span", () => {
    const s = renderParts(spec, { width: 600, height: 480 }).svg;
    expect(tags(s, "text[^>]*data-ring").length).toBeGreaterThan(1);
  });
  it("many categories run labels along the radius", () => {
    const many = Array.from({ length: 24 }, (_, i) => ({ m: `Category ${i}`, v: 1 + i }));
    const s = svg(plain(many.concat(many.map((d) => ({ ...d, r: "b" }))), { series: "r" }));
    expect(tags(s, "text[^>]*data-cat")[0]).toContain("rotate(");
    expect(s).not.toContain("NaN");
  });
  it("stack totals sit at the tips; one series names its bars inside", () => {
    const s = renderParts(spec, { width: 600, height: 480 }).svg;
    expect(tags(s, "text[^>]*data-(tip|name)")).toHaveLength(12);
    expect(s).toContain("data-tip");
    const one = renderParts(plain(data.filter((d) => d.r === "N")), {
      width: 600,
      height: 480,
    }).svg;
    expect(tags(one, "text[^>]*data-cat")).toHaveLength(0);
    expect(tags(one, "text[^>]*data-name").length).toBeGreaterThan(0);
  });
  it("the centre total is a keyed text mark that is not a category", () => {
    const t = tags(svg(spec), 'text data-maya="mark"');
    expect(t).toHaveLength(1);
    expect(t[0]).toContain('data-key="t"');
    expect(t[0]).not.toContain("data-c=");
  });
  it("thin sectors get hit paths", () => {
    const tiny = { ...spec, data: [...data, { m: "Z", r: "N", v: 0.001 }] };
    expect(tags(svg(tiny), 'path data-maya="hit"').length).toBeGreaterThan(0);
  });
  it("sort orders categories", () => {
    const s = svg(
      plain(
        data.filter((d) => d.r === "N"),
        { sort: "desc" },
      ),
    );
    expect(marks(s)[0]).toContain("Dec");
  });
  it("empty, single row, nulls and zeros do not throw", () => {
    expect(() => svg({ ...spec, data: [] })).not.toThrow();
    expect(marks(svg(plain([{ m: "A", v: 5 }])))).toHaveLength(1);
    const z = svg(
      plain([
        { m: "A", v: 0 },
        { m: "B", v: null },
      ]),
    );
    expect(z).not.toContain("NaN");
  });
  it("escapes hostile categories", () => {
    const s = svg(plain([{ m: '<img onerror="x">', v: 3 }]));
    expect(s).not.toContain("<img");
  });
  it("is deterministic", () => {
    expect(svg(spec)).toBe(svg(spec));
  });
  it("rejects a missing y", () => {
    expect(() => svg({ ...spec, y: undefined } as never)).toThrow();
  });
  it("a year shared by every date is stated once, in the centre", () => {
    const dated = M.map((m, i) => ({ m: `2025-${String(i + 1).padStart(2, "0")}-01`, v: 5 + i }));
    const out = svg({ ...plain(dated), format: { m: "month" } });
    expect(out).not.toMatch(/>Jan 2025</);
    expect(out).toMatch(/>Jan</);
    expect(out).toMatch(/2025</);
  });
  it("the centre total only appears for sums and counts", () => {
    const d = [
      { m: "a", v: 10 },
      { m: "a", v: 30 },
      { m: "b", v: 20 },
    ];
    expect(svg(plain(d))).toContain('data-total=""');
    expect(svg(plain(d, { aggregate: "count" }))).toContain('data-total=""');
    expect(svg(plain(d, { aggregate: "mean" }))).not.toContain('data-total=""');
    expect(svg(plain(d, { aggregate: "max" }))).not.toContain('data-total=""');
  });
  it("a series with no row at a category has no sector (so no empty tooltip row) (#93.4)", () => {
    const rows = [
      { it: "Jackets", fam: "Outerwear", v: 189 },
      { it: "Shirts", fam: "Tops", v: 68 },
    ];
    const m = marks(svg({ type: "radial", x: "it", y: "v", series: "fam", data: rows }));
    expect(m).toHaveLength(2);
    expect(m.some((t) => t.includes('data-x="Jackets"') && t.includes('data-series="Tops"'))).toBe(
      false,
    );
  });
  it("a value beyond its bar never overprints a category label, over 200 small tiles (#91.4)", () => {
    const names = [
      "Bags",
      "Jackets",
      "Shirts",
      "Pants",
      "Shoes",
      "Hats",
      "Socks",
      "Swim",
      "Belts",
      "Ties",
      "Gloves",
      "Coats",
    ];
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let t = 0; t < 200; t++) {
      const [n, w, h] = [
        3 + Math.floor(rnd() * 10),
        180 + Math.floor(rnd() * 200),
        200 + Math.floor(rnd() * 150),
      ];
      const ser = rnd() < 0.5;
      const rows = names
        .slice(0, n)
        .flatMap((it) =>
          (ser ? ["A", "B"] : [""]).map((f) => ({ it, f, v: Math.round((5 + rnd() * 100) * 1e6) })),
        );
      const s = renderParts(
        {
          type: "radial",
          x: "it",
          y: "v",
          ...(ser ? { series: "f" } : {}),
          format: { v: "compact" },
          data: rows,
        },
        { width: w, height: h },
      ).svg;
      const cat = [
        ...s.matchAll(
          /<text x="([\d.]+)" y="([\d.]+)" text-anchor="(\w+)"[^>]*data-cat=""[^>]*>([^<]*)</g,
        ),
      ].map((m) => {
        const len = m[4]!.length * 7.2;
        const x = +m[1]!;
        const l = m[3] === "middle" ? x - len / 2 : m[3] === "end" ? x - len : x;
        return [l, +m[2]! - 7, l + len, +m[2]! + 7];
      });
      for (const m of s.matchAll(
        /<text x="([\d.]+)" y="([\d.]+)" transform="rotate\(([-\d.]+)[^>]*data-tip=""[^>]*>([^<]*)</g,
      )) {
        const [x, y, a] = [+m[1]!, +m[2]!, (+m[3]! * Math.PI) / 180];
        const len = m[4]!.length * 6.4;
        const dir = /text-anchor="end"/.test(m[0]) ? -1 : 1;
        const [x1, y1] = [x + dir * len * Math.cos(a), y + dir * len * Math.sin(a)];
        for (const b of cat)
          expect(
            Math.min(x, x1) - 5 < b[2]! &&
              Math.max(x, x1) + 5 > b[0]! &&
              Math.min(y, y1) - 5 < b[3]! &&
              Math.max(y, y1) + 5 > b[1]!,
          ).toBe(false);
      }
    }
  });
});

describe("radial value labels", () => {
  it("a value that cannot go outside moves inside the top segment instead of vanishing", () => {
    // Bars reach the rim, so no value fits outside; tall single-segment bars have room inside.
    const d = M.map((m) => ({ m, v: 100 }));
    const s = svg(plain(d, { labels: true }));
    expect(
      tags(s, "text[^>]*data-in[^>]*").length + tags(s, "text[^>]*data-tip").length,
    ).toBeGreaterThan(0);
  });
});

describe("radial radar (form: line)", () => {
  const Q = ["Jan", "Feb", "Mar", "Apr"];
  const rows = ["2025", "2026"].flatMap((year, j) =>
    Q.flatMap((m, i) =>
      year === "2026" && m === "Apr" ? [] : [{ m, year, sales: 10 + i * 2 + j * 3 }],
    ),
  );
  const radar = (more: Partial<ChartSpec> = {}): ChartSpec => ({
    type: "radial",
    x: "m",
    y: "sales",
    series: "year",
    form: "line",
    data: rows,
    ...more,
  });
  const paths = (s: string) => tags(s, 'path data-maya="line"');
  it("every radar line carries data-radar, so the legend keys are lines (M2 L19)", () => {
    expect(paths(svg(radar())).every((t) => t.includes("data-radar"))).toBe(true);
  });
  it("one line per series keyed l~series; closed with every value, open where one is missing", () => {
    const p = paths(svg(radar()));
    expect(p).toHaveLength(2);
    expect(p[0]).toContain('data-key="l~2025"');
    expect(p[0]).toMatch(/d="M[^"]*Z"/);
    expect(p[1]).toContain('data-key="l~2026"');
    expect(p[1]).not.toMatch(/Z"/);
    expect(svg(radar())).not.toContain("data-polar");
  });
  it("dash series are dashed and carry data-dash", () => {
    const [a, b] = paths(svg(radar({ dash: ["2026"] })));
    expect(a).not.toContain("data-dash");
    expect(b).toContain("data-dash");
    expect(b).toContain("stroke-dasharray");
  });
  it("a dot per value, and one wedge hit per category keyed to a dot so hover lists every series", () => {
    const s = svg(radar());
    expect(tags(s, 'circle data-maya="mark"')).toHaveLength(7);
    const hits = tags(s, 'path data-maya="hit"');
    expect(hits).toHaveLength(4);
    expect(hits[0]).toContain('data-key="2025~Jan"');
    expect(hits.map((h) => /data-c="(\d)"/.exec(h)![1]).join("")).toBe("0123");
    for (const d of tags(s, 'circle data-maya="mark"')) expect(d).toMatch(/data-c="\d"/);
  });
  it("hiding a series (legend isolate) keeps the others' keys and draws one line", () => {
    const p = paths(svg(radar(), ["2025"]));
    expect(p).toHaveLength(1);
    expect(p[0]).toContain("l~2026");
  });
  it("rings, spokes and category names are drawn", () => {
    const s = svg(radar());
    expect(tags(s, "line x1")).toHaveLength(4);
    expect(s).toContain('data-disc=""');
    expect(tags(s, "text[^>]*data-cat").map((t) => t)).toHaveLength(4);
    expect(tags(s, "text[^>]*data-ring").length).toBeGreaterThan(0);
  });
  it("one category and an empty chart still draw", () => {
    expect(paths(svg(radar({ data: [{ m: "Jan", year: "2025", sales: 5 }] })))).toHaveLength(1);
    expect(() => svg(radar({ data: [] }))).not.toThrow();
  });
});
