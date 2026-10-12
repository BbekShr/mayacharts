import { describe, expect, it } from "vitest";
import { render, renderParts } from "../src/core/render.ts";
import { pivotWas } from "../src/core/shape.ts";
import { logTicks } from "../src/core/ticks.ts";
import { linearScale } from "../src/core/scale.ts";
import type { ChartSpec } from "../src/core/types.ts";

const labels = (svg: string, g: string) =>
  [
    ...(svg.match(new RegExp(`<g data-maya="${g}">(.*?)</g>`))?.[1] ?? "").matchAll(
      />([^<]+)<\/text>/g,
    ),
  ].map((m) => m[1]);

describe("#60 pivotWas", () => {
  const rows = [
    { t: "Shirts", y: 1704067200000, v: 2870 },
    { t: "Shirts", y: 1735689600000, v: 2350 },
    { t: "Hats", y: 1735689600000, v: 100 },
    { t: "Hats", y: 1735689600000, v: 20 },
    { t: "Hats", y: 1672531200000, v: 90 },
  ];
  const w = { by: "y", current: null, previous: null };
  it("latest period is current, the one before is previous, periods combine", () => {
    const p = pivotWas(rows, "t", null, "v", w, "sum");
    expect(p.rows).toEqual([
      { t: "Shirts", v: 2350, y: 2870 },
      { t: "Hats", v: 120 },
    ]);
    expect(p.previous).toBe(1704067200000);
  });
  it("explicit periods and data order for plain strings", () => {
    const r = [
      { k: "a", p: "Q2", v: 2 },
      { k: "a", p: "Q1", v: 1 },
      { k: "a", p: "Q3", v: 3 },
    ];
    expect(
      pivotWas(r, "k", null, "v", { by: "p", current: null, previous: null }, "sum").rows,
    ).toEqual([{ k: "a", v: 3, p: 1 }]);
    expect(
      pivotWas(r, "k", null, "v", { by: "p", current: "Q2", previous: "Q3" }, "sum").rows,
    ).toEqual([{ k: "a", v: 2, p: 3 }]);
  });
  it("renders a ghost per bar and names it by the previous period", () => {
    const spec: ChartSpec = {
      type: "bar",
      x: "t",
      y: "v",
      was: { by: "y" },
      data: rows,
      format: { y: "year" },
    };
    const p = renderParts(spec);
    expect(p.svg).toContain("data-past");
    expect(p.legend).toContain("2024");
  });
});

describe("#65 tick precision", () => {
  it("steps need their own decimals, the format keeps the rest", () => {
    const data = [
      { p: "A", g: 1.24 },
      { p: "B", g: 0.6 },
      { p: "C", g: 0.31 },
      { p: "D", g: -0.04 },
    ];
    const svg = render(
      {
        type: "bar",
        horizontal: true,
        x: "p",
        y: "g",
        format: { g: { maximumFractionDigits: 1 } },
        data,
      },
      { width: 520, height: 300 },
    );
    const t = labels(svg, "axis-x");
    expect(t).toContain("0.25");
    expect(t).toContain("-0.25");
    expect(t.join()).not.toMatch(/0\.3|0\.8/);
  });
  it("keeps prefix and suffix and currency", () => {
    const data = [
      { p: "A", g: 0 },
      { p: "B", g: 2500 },
    ];
    const a = render(
      { type: "bar", x: "p", y: "g", format: { g: { prefix: "~", suffix: " u" } }, data },
      { width: 520, height: 300 },
    );
    expect(labels(a, "axis-y").every((l) => /^~.* u$/.test(l!))).toBe(true);
    const b = render(
      {
        type: "bar",
        x: "p",
        y: "g",
        format: { g: { style: "currency", currency: "USD", minimumFractionDigits: 2 } },
        data,
      },
      { width: 520, height: 300 },
    );
    expect(labels(b, "axis-y")).toContain("$1,000");
  });
});

describe("#68.5 log scale", () => {
  it("ticks at powers of ten, 2 and 5 when sparse", () => {
    expect(logTicks(1, 1e4).values).toEqual([1, 10, 100, 1000, 1e4]);
    expect(logTicks(3, 80).values).toEqual([1, 2, 5, 10, 20, 50, 100]);
    expect(logTicks(0.03, 0.5).domain).toEqual([0.01, 1]);
  });
  it("log scale maps log10 and keeps data units in the domain", () => {
    const s = linearScale([1, 100], [200, 0], true);
    expect(s.of(10)).toBe(100);
    expect(s.of(0)).toBe(200);
    expect(s.domain).toEqual([1, 100]);
  });
  it("the frame draws a log y axis and marks it", () => {
    const data = [1, 10, 1000, 20000].map((v, i) => ({ x: i, y: v }));
    const svg = render(
      { type: "scatter", x: "x", y: "y", yScale: "log", data },
      { width: 400, height: 300 },
    );
    expect(svg).toContain('data-log="y"');
    expect(labels(svg, "axis-y")).toEqual(["1", "10", "100", "1,000", "10,000", "100,000", "y"]);
  });
});

describe("#64 empty has no legend", () => {
  const e = (o: object) =>
    renderParts({ type: "bar", x: "i", y: "s", data: [], ...o } as ChartSpec).legend;
  it("no legend for was, colorBy, series, rules, y2", () => {
    expect(e({ was: "b" })).toBe("");
    expect(e({ colorBy: "sign" })).toBe("");
    expect(e({ series: "k" })).toBe("");
    expect(e({ colorBy: { target: 1 } })).toBe("");
    expect(e({ y2: "z" })).toBe("");
  });
  it("still there with data", () => {
    expect(e({ was: "b", data: [{ i: "a", s: 1, b: 2 }] })).toContain("data-past");
  });
});

describe("#66.1 dense bars", () => {
  const data = Array.from({ length: 14 }, (_, i) => ({ c: `Item ${i}`, v: 100 - i }));
  const spec: ChartSpec = { type: "bar", horizontal: true, x: "c", y: "v", data };
  it("rolls the smallest into Other instead of thinning labels", () => {
    const p = renderParts(spec, { width: 400, height: 220 });
    const t = labels(p.svg, "axis-y");
    expect(t).toHaveLength(13);
    expect(t.at(-1)).toBe("Other");
    expect(p.warnings[0]).toMatch(/Other/);
  });
  it("not with a limit, dates, or room", () => {
    expect(
      labels(render({ ...spec, limit: 14 }, { width: 400, height: 220 }), "axis-y"),
    ).not.toContain("Other");
    const d = data.map((r, i) => ({ ...r, c: `2024-01-${String(i + 1).padStart(2, "0")}` }));
    expect(
      labels(render({ ...spec, data: d }, { width: 400, height: 220 }), "axis-y"),
    ).not.toContain("Other");
    expect(labels(render(spec, { width: 400, height: 400 }), "axis-y")).toHaveLength(14);
  });
});

describe("#66.3 crumbs", () => {
  const spec: ChartSpec = {
    type: "bar",
    y: "v",
    path: ["a", "b"],
    drill: true,
    data: [{ a: "x", b: "y", v: 1 }],
  };
  it("reserves nothing at the root, a nav once drilled", () => {
    expect(renderParts(spec).crumbs).toBe("");
    expect(renderParts(spec, { view: { drill: ["x"] } }).crumbs).toContain("<nav");
  });
});

describe("#63 compact frame", () => {
  const spec: ChartSpec = {
    type: "bar",
    x: "a",
    y: "v",
    titles: { a: "Alpha", v: "Value" },
    data: [
      { a: "x", v: 1 },
      { a: "y", v: 9 },
    ],
  };
  it("no axis titles and fewer ticks under 160 px of plot", () => {
    const small = render(spec, { width: 400, height: 140 });
    const big = render(spec, { width: 400, height: 300 });
    expect(labels(small, "axis-x")).not.toContain("Alpha");
    expect(labels(big, "axis-x")).toContain("Alpha");
    expect(labels(small, "axis-y").length).toBeLessThan(labels(big, "axis-y").length);
  });
});
