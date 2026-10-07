import { describe, expect, it } from "vitest";
import "../src/stats.ts";
import { render, renderParts } from "../src/index.ts";
import type { ChartSpec } from "../src/core/types.ts";

const tags = (s: string, re: string) =>
  [...s.matchAll(new RegExp(`<${re}[^>]*>`, "g"))].map((m) => m[0]);
const marks = (s: string, el: string) => tags(s, `${el}[^>]*data-maya="mark"`);
const attr = (t: string, a: string) => new RegExp(` ${a}="([^"]*)"`).exec(t)?.[1];
const BAD = /NaN|undefined|\[object Object\]|Infinity/;

// R-7 on 1..9 and 100: q1 3.25, median 5.5, q3 7.75, IQR 4.5, fence 14.5, so 100 is the only outlier.
const vals = [1, 2, 3, 4, 5, 6, 7, 8, 9, 100];
const rows = vals.map((v, i) => ({ g: "A", v, id: `r${i}` }));
const box: ChartSpec = { type: "boxplot", x: "g", y: "v", name: "id", data: rows };
const many = Array.from({ length: 40 }, (_, i) => ({ g: "A", v: i, id: `r${i}` }));

describe("boxplot", () => {
  it("box carries the median and the five numbers plus n", () => {
    const b = marks(render(box), "rect");
    expect(b).toHaveLength(1);
    expect(attr(b[0]!, "data-y")).toBe("5.5");
    const f = attr(b[0]!, "data-f")!.split("\n");
    expect(f.map((l) => l.split("\t")[0])).toEqual([
      "Max",
      "Upper quartile",
      "Median",
      "Lower quartile",
      "Min",
      "Rows",
    ]);
    expect(f.map((l) => l.split("\t")[1])).toEqual(["100", "7.75", "5.5", "3.25", "1", "10"]);
  });
  it("whisker stops at the furthest row inside 1.5 IQR; rows beyond are outlier marks", () => {
    const o = marks(render(box), "circle");
    expect(o).toHaveLength(1);
    expect(attr(o[0]!, "data-y")).toBe("100");
    expect(attr(o[0]!, "data-key")).toContain("r9");
  });
  it("a box with no outlier draws no circle marks", () => {
    expect(marks(render({ ...box, data: rows.slice(0, 9) }), "circle")).toHaveLength(0);
  });
  it("draws every row as a non-mark dot at 30 rows or fewer, none above", () => {
    const all = (s: string) => tags(s, "circle").length;
    expect(all(render(box))).toBe(10);
    expect(all(render({ ...box, data: many }))).toBe(0);
  });
  it("keys are stable when rows are prepended (name keys outliers and dots)", () => {
    const keys = (d: object[]) =>
      new Set(
        tags(render({ ...box, data: d } as ChartSpec), "circle").map((t) => attr(t, "data-key")),
      );
    const a = keys(rows);
    const b = keys([{ g: "A", v: 5, id: "new" }, ...rows]);
    for (const k of a) expect(b.has(k)).toBe(true);
  });
  it("series draws one box per series and category; hidden series drops its box", () => {
    const d = rows.map((r, i) => ({ ...r, s: i % 2 ? "p" : "q" }));
    const s: ChartSpec = { ...box, series: "s", data: d };
    expect(marks(render(s), "rect")).toHaveLength(2);
    expect(marks(renderParts(s, { view: { hidden: ["p"] } }).svg, "rect")).toHaveLength(1);
  });
  it("the hidden table lists the five numbers and n per category, not sums", () => {
    const t = renderParts(box).table;
    for (const n of ["Max", "Median", "Min", "Rows", "3.25", "5.5", "7.75", "100"])
      expect(t).toContain(n);
    expect(t).not.toContain("<td>155</td>");
  });
  it("aggregate is rejected", () => {
    expect(() => render({ ...box, aggregate: "mean" })).toThrow(/aggregate/);
  });
  it("y is required and non-numeric y is rejected", () => {
    expect(() => render({ type: "boxplot", x: "g", data: rows } as unknown as ChartSpec)).toThrow();
    expect(() => render({ ...box, y: "g" })).toThrow();
  });
  it("hostile data: no NaN, undefined or [object Object]", () => {
    const one = [{ g: "A", v: 3, id: "a" }];
    const same = Array.from({ length: 6 }, (_, i) => ({ g: "A", v: 7, id: `e${i}` }));
    const huge = [1e300, -1e300, 5, 7].map((v, i) => ({ g: "A", v, id: `h${i}` }));
    const nulls = [...rows, { g: "A", v: null, id: "n" }, { g: "B", id: "m" }];
    for (const d of [one, same, huge, nulls, many])
      expect(render({ ...box, data: d })).not.toMatch(BAD);
    expect(render({ ...box, data: [] })).toContain('data-maya="empty"');
  });
  it("a single row and all-equal rows still draw one box", () => {
    expect(marks(render({ ...box, data: [rows[0]!] }), "rect")).toHaveLength(1);
    const same = rows.map((r) => ({ ...r, v: 7 }));
    expect(marks(render({ ...box, data: same }), "rect")).toHaveLength(1);
    expect(marks(render({ ...box, data: same }), "circle")).toHaveLength(0);
  });
  it("escapes hostile strings and is deterministic", () => {
    const evil = `"><script>x</script>`;
    const s = render({ ...box, data: [{ g: evil, v: 1, id: evil }] });
    expect(s).not.toContain("<script>");
    expect(render(box)).toBe(render(box));
  });
});

const long: ChartSpec = {
  type: "funnel",
  x: "stage",
  y: "n",
  data: [
    { stage: "Visits", n: 1000 },
    { stage: "Signups", n: 600 },
    { stage: "Paid", n: 150 },
  ],
};
// Wide form: the same totals split over two rows; stages are the measures.
const wide: ChartSpec = {
  type: "funnel",
  y: ["Visits", "Signups", "Paid"],
  data: [
    { Visits: 400, Signups: 250, Paid: 100 },
    { Visits: 600, Signups: 350, Paid: 50 },
  ],
};
const stages = (s: string) => marks(s, "path");
/** x extent of a path from its endpoints (M L H V Q C A, absolute or relative). */
function xr(d: string): [number, number] {
  let x = 0;
  const xs: number[] = [];
  const n = { M: 2, L: 2, H: 1, V: 1, Q: 4, C: 6, A: 7, Z: 0, T: 2, S: 4 } as Record<
    string,
    number
  >;
  for (const [, c, a] of d.matchAll(/([a-zA-Z])([^a-zA-Z]*)/g)) {
    const u = c!.toUpperCase();
    const v = (a!.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);
    const k = n[u]!;
    for (let i = 0; k && i + k <= v.length; i += k) {
      const p = v.slice(i, i + k);
      const rel = c !== u;
      if (u === "V") continue;
      const e = u === "H" ? p[0]! : p[k - 2]!;
      x = rel ? x + e : e;
      xs.push(x);
    }
  }
  return [Math.min(...xs), Math.max(...xs)];
}

describe("funnel", () => {
  it("draws one stage mark per row in data order with the payload", () => {
    const s = stages(render(long));
    expect(s.map((t) => attr(t, "data-x"))).toEqual(["Visits", "Signups", "Paid"]);
    expect(attr(s[1]!, "data-y")).toBe("600");
  });
  it("wide input (stages = measures, summed) equals long input", () => {
    // The tooltip's first row is labelled by the y title (long) or "Total" (wide); the rest match.
    const strip = (s: string[]) => s.map((t) => t.replace(/data-f="[^\t]*\t/, 'data-f="'));
    const w = stages(render(wide));
    expect(strip(w)).toEqual(strip(stages(render(long))));
    expect(w.map((t) => attr(t, "data-y"))).toEqual(["1000", "600", "150"]);
  });
  it("wide input names stages by titles on the axis, tooltip and table", () => {
    const p = renderParts({ ...wide, titles: { Visits: "Site visits" } });
    expect(p.svg).toContain(">Site visits<");
    expect(attr(stages(p.svg)[0]!, "data-x")).toBe("Site visits");
    expect(p.table).toContain("<th>Total</th>");
    expect(p.table).toContain(">Site visits</th>");
  });
  it("every stage is centred on the plot centre within 0.5 px", () => {
    for (const spec of [long, wide]) {
      const svg = render(spec, { width: 640, height: 320 });
      const [px, , pw] = attr(svg, "data-plot")!.split(" ").map(Number) as [number, number, number];
      expect(stages(svg)).toHaveLength(3);
      for (const t of stages(svg)) {
        const [a, b] = xr(attr(t, "d")!);
        expect(Math.abs((a + b) / 2 - (px + pw / 2))).toBeLessThan(0.5);
      }
    }
  });
  it("stage widths follow value / first", () => {
    const w = stages(render(long))
      .map((t) => xr(attr(t, "d")!))
      .map(([a, b]) => b - a);
    expect(w[1]! / w[0]!).toBeCloseTo(0.6, 1);
    expect(w[2]! / w[0]!).toBeCloseTo(0.15, 1);
  });
  it("labels each step as a percentage and tones the lowest step bad", () => {
    const svg = render(long);
    expect(svg).toContain("60%");
    expect(svg).toContain("25%");
    const bad = tags(svg, '[a-z]+[^>]*data-tone="bad"');
    expect(bad.length).toBeGreaterThan(0);
  });
  it("data-f lines: value, % of previous, % of first", () => {
    const f = attr(stages(render(long))[2]!, "data-f")!.split("\n");
    expect(f).toHaveLength(3);
    expect(f.map((l) => l.split("\t")[0]).slice(1)).toEqual(["% of previous", "% of first"]);
    expect(f[1]).toContain("25%");
    expect(f[2]).toContain("15%");
  });
  it("a zero stage followed by a stage never produces NaN or Infinity", () => {
    const d = [
      { stage: "A", n: 100 },
      { stage: "B", n: 0 },
      { stage: "C", n: 5 },
    ];
    const svg = render({ ...long, data: d });
    expect(svg).not.toMatch(BAD);
    expect(stages(svg)).toHaveLength(3);
    expect(render({ ...long, data: d.map((r) => ({ ...r, n: 0 })) })).not.toMatch(BAD);
  });
  it("negative values raise non-positive-value", () => {
    const bad = {
      ...long,
      data: [
        { stage: "A", n: 5 },
        { stage: "B", n: -1 },
      ],
    };
    expect(() => render(bad)).toThrow(expect.objectContaining({ code: "non-positive-value" }));
  });
  it("x together with a y array is an error", () => {
    expect(() => render({ ...wide, x: "stage" })).toThrow(/x/);
  });
  it("hostile data: one stage, 1e300, empty", () => {
    const one = render({ ...long, data: [{ stage: "A", n: 3 }] });
    expect(one).not.toMatch(BAD);
    expect(stages(one)).toHaveLength(1);
    const big = render({
      ...long,
      data: [
        { stage: "A", n: 1e300 },
        { stage: "B", n: 1e299 },
      ],
    });
    expect(big).not.toMatch(BAD);
    expect(render({ ...long, data: [] })).toContain('data-maya="empty"');
  });
  it("escapes hostile stage names and is deterministic", () => {
    const evil = `"><script>x</script>`;
    expect(render({ ...long, data: [{ stage: evil, n: 1 }] })).not.toContain("<script>");
    expect(render(long)).toBe(render(long));
  });
  it("median labels use one placement for every box, on the median line and never above the cap", () => {
    const d = ["A", "B", "C", "D"].flatMap((g) =>
      [0, 20000, 47000, 80000, 100000].map((v, i) => ({ g, v, id: `${g}${i}` })),
    );
    const lab = (width: number, data = d) => {
      const svg = renderParts({ ...box, data }, { width, height: 320 }).svg;
      const my = [...svg.matchAll(/<line[^>]*data-kpi="target"[^>]*y1="([\d.]+)"/g)].map(
        (m) => +m[1]!,
      );
      const t = [
        ...svg.matchAll(/<text x="[\d.]+" y="([\d.]+)" text-anchor="(\w+)"[^>]*>47,000</g),
      ];
      return { my, t };
    };
    // 1280: beside each box at its median line
    const a = lab(1280);
    expect(a.t.map((m) => m[2])).toEqual(["start", "start", "start", "start"]);
    expect(a.t.map((m) => +m[1]!)).toEqual(a.my);
    // 360: no room beside; on the box, one text per box, all the same placement, above the median line
    const b = lab(360);
    expect(b.t).toHaveLength(4);
    expect(new Set(b.t.map((m) => m[2]))).toEqual(new Set(["middle"]));
    for (const [i, m] of b.t.entries()) expect(+m[1]!).toBeLessThan(b.my[i]!);
  });
  it("whiskers and median are keyed <line>s so they glide with their box", () => {
    const svg = render(box);
    const keys = [...svg.matchAll(/<line[^>]*data-maya="line"[^>]*data-key="([^"]*)"/g)].map(
      (m) => m[1],
    );
    expect(keys.map((k) => k!.split("~")[0]).sort()).toEqual(["m", "wh", "wl", "ws", "wt"]);
    expect(svg).not.toMatch(/<path[^>]*data-maya="line"/);
  });
  it("a box too short to hold its label drops every label instead of mixing placements", () => {
    // Tight boxes (IQR ~ 0) next to each other at 360: no side room, no height inside.
    const d = ["A", "B", "C", "D", "E", "F"].flatMap((g) =>
      [0, 51224, 51234, 51244, 100000].map((v, i) => ({ g, v, id: `${g}${i}` })),
    );
    const svg = renderParts({ ...box, data: d }, { width: 360, height: 320 }).svg;
    expect(svg.match(/>51,234<\/text>/g) ?? []).toHaveLength(0);
  });
  it("description gives the lowest and highest box medians, not one pooled median", () => {
    const d = [
      ...[10, 11, 12].map((v) => ({ g: "A", v, id: `a${v}` })),
      ...[40, 41, 42].map((v) => ({ g: "B", v, id: `b${v}` })),
    ];
    const desc = /<desc[^>]*>([^<]*)</.exec(render({ ...box, data: d }))![1]!;
    expect(desc).toContain("Median: A 11 to B 41.");
    expect(desc).not.toContain("26");
    const flat = [5, 5, 5].flatMap((v) => ["Flat", "Same"].map((g) => ({ g, v, id: `${g}${v}` })));
    expect(/<desc[^>]*>([^<]*)</.exec(render({ ...box, data: flat }))![1]!).toContain("Median 5.");
    const one = /<desc[^>]*>([^<]*)</.exec(render(box))![1]!;
    expect(one).toContain("Median 5.5.");
  });
  it("the labelled gallery-shaped chart shows every median at 1280 and 576 (the last box uses the right margin)", () => {
    const d = [
      [35, 36, 34, 37, 33, 35.5, 38],
      [44, 40, 47, 37, 46, 45, 42],
      [44, 44, 43, 45, 44, 34, 33],
      [20, 21, 26, 19, 20, 27, 22],
    ].flatMap((v, i) => v.map((n, k) => ({ g: "ABCD"[i], v: n / 100, id: `${i}${k}` })));
    for (const width of [1280, 576]) {
      const svg = renderParts(
        { ...box, labels: true, format: { v: "percent" }, data: d },
        { width, height: 320 },
      ).svg;
      expect((svg.match(/%<\/text>/g) ?? []).length).toBeGreaterThanOrEqual(4 + 4); // 4 ticks + 4 medians
    }
  });
});
describe("description series", () => {
  it("names only series that hold a value", () => {
    const d = [
      { g: "A", v: 1, s: "p", id: "1" },
      { g: "A", v: 2, s: "p", id: "2" },
    ];
    const bar = { type: "bar", x: "g", y: "v", series: "s" } as const;
    const desc = (data: object[]) =>
      /<desc[^>]*>([^<]*)</.exec(render({ ...bar, data } as ChartSpec))![1]!;
    expect(desc([...d, { g: "A", v: null, s: "ghost" }])).toContain("(p)");
    expect(desc([...d, { g: "A", v: null, s: "ghost" }])).not.toContain("ghost");
    expect(desc([...d, { g: "A", v: 3, s: "q" }])).toContain("(p, q)");
  });
});
