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
    expect(s).toContain("<line data-xrule=");
    expect(s).toMatch(/<text[^>]*>Launch b<\/text>/);
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

describe("fix round", () => {
  const two: ChartSpec = {
    type: "line",
    x: "m",
    y: "v",
    series: "r",
    title: "{max.y} at {max.x}, {min.y}, {first.x}, {last.y}, {total}, {mean}",
    data: [
      { m: "2025-01-01", r: "A", v: 10 },
      { m: "2025-01-01", r: "B", v: 5 },
      { m: "2025-02-01", r: "A", v: 7 },
      { m: "2025-02-01", r: "B", v: 20 },
    ],
  };
  it("tokens name one drawn point, not the category sum", () => {
    const t = renderParts(two).title;
    expect(t).toContain("20 at");
    expect(t).toContain(", 5,");
    expect(t).toContain(", 20, 42, 10.5");
    expect(renderParts({ ...two, type: "area", stack: true }).title).toContain("27 at");
  });
  it("a legend placement drops end labels", () => {
    expect(render(two)).toContain("data-end");
    expect(render({ ...two, legend: "right" })).not.toContain("<text data-end");
  });
  it("a table row label is a drill target", () => {
    const t = {
      type: "table",
      y: "sales",
      path: ["region", "state"],
      drill: true,
      data: rows,
    } as ChartSpec;
    expect(render(t)).toMatch(/data-maya="hit"[^>]*x="0"/);
  });
});

describe("fix round 2", () => {
  const b: ChartSpec = {
    type: "line",
    x: "m",
    y: "v",
    series: "r",
    dash: ["B"],
    data: ["a", "b"].flatMap((m, i) => ["A", "B"].map((r) => ({ m, r, v: i + 1 }))),
  };
  it("a dashed series gives the solid ones a line key", () => {
    const leg = renderParts({ ...b, legend: true }).legend;
    expect(leg).toMatch(
      /<button[^>]*data-line=""[^>]*data-key="A"|<button[^>]*data-key="A"[^>]*data-line=""/,
    );
    expect(leg).not.toMatch(/data-dash=""[^>]*data-line|data-line[^>]*data-dash=""/);
  });
  it("colliding rule labels step down; an x label near the edge ends at its line", () => {
    const s = render(
      {
        type: "bar",
        x: "m",
        y: "v",
        rules: [
          { x: "c", label: "A very long launch label" },
          { band: [1, 2], label: "Within" },
        ],
        data: ["a", "b", "c"].map((m, i) => ({ m, v: i + 1 })),
      },
      { width: 360 },
    );
    expect(s).toMatch(/text-anchor="end"[^>]*>A very long launch label c</);
  });
  it("the description mentions slopes and annotations", () => {
    const d = render({
      type: "scatter",
      x: "x",
      y: "y",
      rules: [{ slope: 2, label: "Trend" }],
      annotate: ["max", { x: 1, text: "Peak" }],
      data: [
        { x: 1, y: 2 },
        { x: 2, y: 5 },
      ],
    });
    expect(d).toContain("Trend: y = 2x.");
    expect(d).toContain("Labelled points: Max.");
    expect(d).toContain("Peak: 1.");
  });
});
