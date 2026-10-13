import { describe, expect, it } from "vitest";
import { renderParts } from "../src/index.ts";
import "../src/hierarchy.ts";
import "../src/radial.ts";
import { css } from "../src/styles/theme.ts";
import type { ChartSpec } from "../src/core/types.ts";

const parts = (spec: object, opts: object = {}) => renderParts(spec as ChartSpec, opts as never);

describe("M5 marks: was ghosts and trails", () => {
  const q = ["Q1", "Q2", "Q3"];
  const rows = ["N", "S"].flatMap((s, k) =>
    q.map((x, i) => ({ s, x, v: 10 + k * 9 + i, w: 8 + k * 9 + i })),
  );
  it("line and area draw a dashed ghost path per series, keyed and without data-maya", () => {
    for (const type of ["line", "area"]) {
      const { svg } = parts({ type, x: "x", y: "v", series: "s", was: "w", data: rows });
      const ghosts = svg.match(/<path[^>]*data-past[^>]*>/g)!;
      expect(ghosts).toHaveLength(2);
      for (const g of ghosts) {
        expect(g).toContain('data-key="%00was~');
        expect(g).not.toContain("data-maya");
      }
    }
    expect(parts({ type: "line", x: "x", y: "v", data: rows.slice(0, 3) }).svg).not.toContain(
      "data-past",
    );
  });
  it("a hole in was breaks the ghost line", () => {
    const d = rows.slice(0, 3).map((r, i) => ({ ...r, w: i === 1 ? null : r.w }));
    const g = parts({ type: "line", x: "x", y: "v", was: "w", data: d }).svg.match(
      /<path[^>]*data-past[^>]*d="([^"]*)"/,
    )![1]!;
    expect(g.match(/M/g)).toHaveLength(2);
  });
  it("scatter trails: a line to the current point and fading dots, no data-maya", () => {
    const data = ["A", "B"].flatMap((n, k) =>
      [1, 2, 3, 4].map((t) => ({ n, t, a: t * 5 + k * 9, b: t * 3 + k })),
    );
    const spec = { type: "scatter", x: "a", y: "b", name: "n", frame: "t", trail: 2, data };
    const { svg } = parts(spec, { view: { frame: 3 } });
    const t = svg.match(/<[^>]*data-trail[^>]*>/g)!;
    expect(t.filter((e) => e.includes('data-trail="seg"'))).toHaveLength(4); // 2 segments a name, fading
    expect(t.filter((e) => e.includes('data-trail="dot"'))).toHaveLength(4);
    expect(t.every((e) => !e.includes("data-maya") && e.includes('data-key="%00trail~'))).toBe(
      true,
    );
    expect(parts({ ...spec, trail: undefined }, { view: { frame: 3 } }).svg).not.toContain(
      "data-trail",
    );
  });
});

describe("M5 marks: designer fixes", () => {
  it("a waterfall with a high opening total breaks its total bars instead of squashing the steps", () => {
    const data = [
      { s: "Open", d: 48200 },
      { s: "a", d: -310 },
      { s: "b", d: 620 },
      { s: "Total", d: 0 },
    ];
    const svg = parts({ type: "waterfall", x: "s", y: "d", totals: ["Open", "Total"], data }).svg;
    expect(svg).toContain("data-brk");
    const zero = parts({
      type: "waterfall",
      x: "s",
      y: "d",
      totals: ["Open", "Total"],
      data: data.map((r) => ({ ...r, d: r.s === "Open" ? 5 : r.d })),
    }).svg;
    expect(zero).not.toContain("data-brk");
  });
  it("a drilled marimekko tints its segments of the column's colour", () => {
    const data = ["E", "W"].flatMap((region) =>
      ["Tops", "Shoes"].flatMap((family) =>
        ["a", "b", "c"].map((item, i) => ({ region, family, item, sales: 10 + i })),
      ),
    );
    const spec = {
      type: "marimekko",
      path: ["region", "family", "item"],
      y: "sales",
      drill: true,
      data,
    };
    expect(parts(spec).svg).not.toContain("data-lt");
    const d = parts(spec, { view: { drill: ["W"] } }).svg;
    expect(d.match(/data-maya="mark"[^>]*data-lt="\d"/g)!.length).toBeGreaterThan(5);
    expect(d).toMatch(/data-ink="a"/);
  });
  it("a narrow table says how many columns it dropped", () => {
    const data = [{ n: "alpha", a: 100000, b: 200000, c: 300000, d: 400000 }];
    const svg = parts(
      { type: "table", x: "n", y: ["a", "b", "c", "d"], data },
      { width: 260, height: 200 },
    ).svg;
    expect(svg).toMatch(/data-th[^>]*>\+\d</);
  });
  it("heatmap totals fall back to a compact number when the cell is narrow", () => {
    const data = ["A", "B", "C", "D", "E", "F"].flatMap((x) =>
      ["r1", "r2"].map((s) => ({ x, s, v: 1234567 })),
    );
    const { svg: labels } = parts(
      { type: "heatmap", x: "x", series: "s", y: "v", totals: true, data },
      { width: 300, height: 200 },
    );
    expect(labels).toMatch(/>\d+(\.\d+)?M</);
  });
});

describe("M5 marks: critic round", () => {
  it("a gauge draws a tick at the old value", () => {
    const g = (o: object) =>
      parts({ type: "gauge", y: "v", was: "w", data: [{ v: 62, w: 50 }], ...o }).svg;
    expect(g({})).toMatch(/<line[^>]*data-past/);
    expect(g({ was: undefined })).not.toContain("data-past");
  });
  it("a 360 gauge reserves room on its target's side only", () => {
    const at = (t: number) =>
      parts(
        {
          type: "gauge",
          arc: 360,
          y: "v",
          yDomain: [0, 100],
          colorBy: { target: t },
          data: [{ v: 50 }],
        },
        { width: 360, height: 300 },
      ).svg.match(/data-maya="mark"[^>]*cx="([\d.]+)"/)![1]!;
    expect(+at(80)).toBeGreaterThan(180 + 20); // label on the left: the dial moves right
    expect(+at(25)).toBeLessThan(180 - 20);
    expect(Math.abs(+at(100) - 180)).toBeLessThan(2); // at the pole nothing is reserved
  });
  it("a thin drilled marimekko column keeps its name (six characters) beside it", () => {
    const data = [
      ...["a", "b", "c"].map((item, i) => ({ r: "W", f: "Tops", item, v: 100 + i })),
      ...["a", "b"].map((item) => ({ r: "W", f: "Shoes", item, v: 1 })),
    ];
    const svg = parts(
      { type: "marimekko", path: ["r", "f", "item"], y: "v", drill: true, data },
      { width: 360, view: { drill: ["W"] } },
    ).svg;
    expect(svg).toMatch(/data-col=""[^>]*>Shoes</);
  });
});

describe("M5 theme", () => {
  it("styles the controls, panels, ghosts and trails, and keeps the contrast fixes", () => {
    for (const hook of [
      "path[data-past]",
      "circle[data-trail=dot]",
      "input.maya-frame",
      ".maya-ctl[data-maya=frame]",
      ".maya-params",
      ".maya-params-btn",
      "svg[data-maya=panel]:focus-visible",
      "text[data-facet]",
      "::-webkit-slider-runnable-track",
      "overflow-wrap:anywhere",
      "[data-past][data-line] i",
    ])
      expect(css).toContain(hook);
    expect(css).toContain("--maya-fg) 55%,transparent"); // filter border, 3:1
    expect(css).not.toContain("wip-y");
  });
});
