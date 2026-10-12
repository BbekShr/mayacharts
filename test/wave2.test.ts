import { describe, expect, it } from "vitest";
import { render, renderParts, renderShell } from "../src/index.ts";
import "../src/hierarchy.ts";
import "../src/flow.ts";
import type { ChartSpec } from "../src/core/types.ts";

const rows = [
  { region: "West", state: "CA", sales: 100, units: 10 },
  { region: "West", state: "OR", sales: 30, units: 5 },
  { region: "East", state: "NY", sales: 50, units: 0 },
  { region: "East", state: "MA", sales: 20, units: 0 },
];
const ratio = { ratio: ["sales", "units"] } as const;
const ys = (svg: string) =>
  [...svg.matchAll(/data-maya="mark"[^>]*data-x="([^"]*)"[^>]*data-y="([^"]*)"/g)].map(
    (m) => [m[1], +m[2]!] as const,
  );
const bar: ChartSpec = {
  type: "bar",
  x: "region",
  y: "price",
  aggregate: ratio,
  data: rows,
};

describe("ratio aggregate (#69)", () => {
  it("divides the sums, not the row ratios; a zero denominator is no bar", () => {
    const m = ys(render(bar));
    expect(m).toHaveLength(1);
    expect(m[0]![0]).toBe("West");
    expect(m[0]![1]).toBeCloseTo(130 / 15, 6); // not the mean of 10 and 6
  });
  it("holds at every drill level, in Other and in the mean rule", () => {
    const d: ChartSpec = {
      type: "bar",
      y: "price",
      aggregate: ratio,
      path: ["region", "state"],
      drill: true,
      data: rows,
    };
    expect(ys(render(d, { view: { drill: ["West"] } }))).toEqual([
      ["CA", 10],
      ["OR", 6],
    ]);
    const other = ys(
      render({
        ...bar,
        x: "state",
        limit: 1,
        data: [...rows, { state: "TX", sales: 5, units: 1 }],
      }),
    );
    expect(other.find((e) => e[0] === "Other")![1]).toBeCloseTo(105 / 6, 6); // OR, TX, NY, MA: sums merge
    expect(render({ ...bar, rules: ["mean"] })).toContain(`${(130 / 15).toFixed(2)}`);
  });
  it("kpi and table use it", () => {
    const k = render({ type: "kpi", y: "price", aggregate: ratio, data: rows.slice(0, 2) });
    expect(k).toContain("8.67");
    const t = render({ type: "table", x: "region", y: "price", aggregate: ratio, data: rows });
    expect(t).toContain("8.67");
    expect(t).toContain("–");
  });
  it("the shell JSON keeps both fields", () => {
    const j = renderShell(bar);
    expect(j).toContain("sales");
    expect(j).toContain("units");
  });
});

describe("drill on table and heatmap (#70.3)", () => {
  const path = ["region", "state"];
  it("table rows follow the path", () => {
    const t = { type: "table", y: "sales", path, drill: true, data: rows } as ChartSpec;
    expect(render(t)).toContain("West");
    const d = renderParts(t, { view: { drill: ["West"] } });
    expect(d.svg).toContain('data-x="CA"');
    expect(d.svg).not.toContain('data-x="NY"');
    expect(d.crumbs).toContain('<span aria-current="page">West</span>');
  });
  it("heatmap rows follow the path", () => {
    const h = {
      type: "heatmap",
      x: "units",
      y: "sales",
      path,
      drill: true,
      data: rows,
    } as ChartSpec;
    expect(renderParts(h).svg).toContain('data-series="West"');
    expect(renderParts(h, { view: { drill: ["West"] } }).svg).toContain('data-series="CA"');
  });
});

describe("colour slots (#71)", () => {
  it("colors map by path[0] name, stable through a drill", () => {
    const t = {
      type: "treemap",
      path: ["region", "state"],
      y: "sales",
      drill: true,
      colors: { East: "#c00" },
      data: rows,
    } as ChartSpec;
    const v = (o = {}) => renderParts(t, o).vars.find((e) => e[1] === "#c00")![0];
    expect(v()).toBe("--maya-series-2"); // East is the second region
    expect(v({ view: { drill: ["East"] } })).toBe("--maya-series-2");
  });
});

describe("customisation (#72)", () => {
  const b: ChartSpec = {
    type: "bar",
    x: "m",
    y: "v",
    data: [
      { m: "a", v: 1 },
      { m: "b", v: 3 },
    ],
  };
  it("x rule, band and slope intercept", () => {
    const s = render({
      ...b,
      rules: [
        { x: "b", label: "Launch" },
        { band: [1, 2], label: "Target" },
      ],
    });
    expect(s).toMatch(/<line data-xrule=""[^>]*\/><text[^>]*>Launch b<\/text>/);
    expect(s).toMatch(/<rect data-band=""/);
    expect(s).toContain("Target");
    expect(render({ ...b, rules: [{ x: "zz" }] })).not.toContain("<line data-xrule");
  });
  it("subtitle, legend placement, tokens stay literal when unknown", () => {
    const p = renderParts({
      ...b,
      title: "{max.x} leads with {max.y} {nope}",
      subtitle: "of {total}",
      legend: "bottom",
    });
    expect(p.title).toContain("b leads with 3 {nope}");
    expect(p.title).toContain('<p class="maya-sub">of 4</p>');
    expect(p.legendAt).toBe("bottom");
    expect(renderShell({ ...b, legend: "right" })).toContain(
      '<div class="maya" data-legend="right">',
    );
    expect(renderParts(b).legendAt).toBeUndefined();
    expect(renderParts({ ...b, title: "x {mean}" }).title).toContain("x 2");
    expect(renderParts({ ...b, title: "{max.x}", data: [] }).title).toContain("{max.x}");
  });
  it("axisSize widens the label margin", () => {
    const plot = (t = {}) => /data-plot="(\S+)/.exec(render({ ...b, y: "v", theme: t }))![1]!;
    expect(+plot({ axisSize: "24px" })).toBeGreaterThan(+plot());
  });
});

describe("sankey drill clamp", () => {
  it("a drilled node stays as the first column", () => {
    const d = [
      { a: "A", b: "B", c: "C", v: 1 },
      { a: "A", b: "D", c: "C", v: 2 },
    ];
    const sk = { type: "sankey", path: ["a", "b", "c"], y: "v", drill: true, data: d } as ChartSpec;
    const s = renderParts(sk, { view: { drill: ["A", "D"] } });
    expect(s.svg).toContain("n~1~D");
    expect(s.svg).not.toContain("n~1~B");
    expect(s.crumbs).toContain("aria-current");
  });
});
