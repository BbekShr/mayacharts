import { describe, expect, it } from "vitest";
import "../src/radial.ts";
import { render, renderParts } from "../src/index.ts";
import { niceTicks } from "../src/core/ticks.ts";
import type { ChartSpec } from "../src/index.ts";

const spec = (s: object) => s as unknown as ChartSpec;
const group = (svg: string, name: string) =>
  new RegExp(`<g data-maya="${name}">(.*?)</g>`).exec(svg)?.[1] ?? "";
const texts = (g: string) => [...g.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
const last = (vars: readonly (readonly [string, string])[], k: string) =>
  vars.filter(([n]) => n === k).at(-1)?.[1];

describe("#89 colours", () => {
  it("a colors map key beats a theme series slot token (bar)", () => {
    const p = renderParts(
      spec({
        type: "bar",
        x: "Quarter",
        y: "Sales",
        series: "Year",
        colors: { "2026": "#1E1E24", "2025": "#B4BDC9" },
        theme: { series1: "#1E1E24", series2: "#B4BDC9" },
        data: [
          { Quarter: "Q1", Year: "2025", Sales: 10 },
          { Quarter: "Q1", Year: "2026", Sales: 12 },
        ],
      }),
    );
    expect(p.svg).toMatch(/data-s="0"[^>]*data-series="2025"/);
    expect(last(p.vars, "--maya-series-1")).toBe("#B4BDC9");
    expect(last(p.vars, "--maya-series-2")).toBe("#1E1E24");
    // the standalone style attribute: the later declaration wins
    const style = render(
      spec({
        type: "bar",
        x: "Quarter",
        y: "Sales",
        series: "Year",
        colors: { "2025": "#B4BDC9" },
        theme: { series1: "#000000" },
        data: [{ Quarter: "Q1", Year: "2025", Sales: 10 }],
      }),
    ).match(/style="([^"]*)"/)![1]!;
    expect(style.lastIndexOf("--maya-series-1:#B4BDC9")).toBeGreaterThan(
      style.indexOf("--maya-series-1:#000000"),
    );
  });

  it("a colors map key beats a theme series slot token (scatter)", () => {
    const p = renderParts(
      spec({
        type: "scatter",
        x: "a",
        y: "b",
        series: "s",
        colors: { Outerwear: "#D1543A" },
        theme: { series1: "#000000", series2: "#111111" },
        data: [
          { a: 1, b: 2, s: "Tops" },
          { a: 2, b: 3, s: "Outerwear" },
        ],
      }),
    );
    expect(p.svg).toMatch(/data-s="1"[^>]*data-series="Outerwear"/);
    expect(last(p.vars, "--maya-series-2")).toBe("#D1543A");
    expect(last(p.vars, "--maya-series-1")).toBe("#000000");
  });

  it("a map with 15 keys and 5 colours is accepted; null options are unset", () => {
    const hues = ["#111", "#222", "#333", "#444", "#555"];
    const colors = Object.fromEntries([...Array(15)].map((_, i) => [`t${i}`, hues[i % 5]!]));
    const base = { type: "bar", x: "a", y: "b", data: [{ a: "x", b: 1 }] };
    expect(() => render(spec({ ...base, colors }))).not.toThrow();
    expect(render(spec({ ...base, colorBy: null, legend: null, title: null }))).toBe(
      render(spec(base)),
    );
  });
});

describe("#90.1 was in the value domain", () => {
  it("the axis reaches the largest ghost", () => {
    const svg = render(
      spec({
        type: "bar",
        x: "Month",
        y: "Sales",
        was: "A year earlier",
        data: [
          { Month: "2026-01", Sales: 13e6, "A year earlier": 24.7e6 },
          { Month: "2026-02", Sales: 14e6, "A year earlier": 15e6 },
        ],
      }),
    );
    const top = Math.max(...texts(group(svg, "axis-y")).map((t) => +t!.replace(/,/g, "")));
    expect(top).toBeGreaterThanOrEqual(24.7e6);
  });
});

describe("#91 labels", () => {
  it("rule labels stay inside the plot and off annotations", () => {
    const svg = render(
      spec({
        type: "bar",
        horizontal: true,
        x: "c",
        y: "v",
        format: "percent",
        rules: [-0.05],
        data: [
          { c: "North", v: -0.06 },
          { c: "South", v: 0.04 },
          { c: "East", v: 0.02 },
        ],
      }),
      { width: 300, height: 260 },
    );
    const [px] = svg
      .match(/data-plot="([\d.]+)/)!
      .slice(1)
      .map(Number);
    const t = /<g data-maya="rules">.*?<text x="([\d.]+)"[^>]*text-anchor="(\w+)"/.exec(svg)!;
    expect(t[2]).toBe("start");
    expect(+t[1]!).toBeGreaterThanOrEqual(px!);
  });

  it("a rule label whose spots are taken by an annotation moves or drops", () => {
    const data = [5, 9, 7, 10, 6].map((v, i) => ({ m: `M${i}`, v }));
    const svg = render(
      spec({
        type: "line",
        x: "m",
        y: "v",
        annotate: ["max"],
        rules: [{ y: 10, label: "Top" }],
        data,
      }),
      { width: 300, height: 260 },
    );
    const boxes = [...svg.matchAll(/<text x="([\d.]+)" y="([\d.]+)"[^>]*>([^<]*)<\/text>/g)];
    const rule = boxes.find((b) => b[3]!.startsWith("Top"));
    const ann = boxes.find((b) => /data-ann/.test(b[0]))!;
    expect(ann).toBeDefined();
    if (rule) expect(Math.abs(+rule[2]! - +ann[2]!) >= 14 || rule[1] !== ann[1]).toBe(true);
  });

  it("an annotation at the plot top still draws (#91.8)", () => {
    const data = [...Array(12)].map((_, i) => ({
      Month: `2025-${String(i + 1).padStart(2, "0")}-01`,
      Sales: i === 6 ? 24.8e6 : 10e6 + i * 5e5,
    }));
    for (const [width, height] of [
      [300, 260],
      [1400, 500],
    ])
      expect(
        render(
          spec({ type: "line", x: "Month", xType: "time", y: "Sales", annotate: ["max"], data }),
          {
            width: width!,
            height: height!,
          },
        ),
      ).toContain('data-ann="max"');
  });

  it("text.noData wraps to the box and honours \\n (#91.9)", () => {
    const svg = render(
      spec({
        type: "bar",
        x: "a",
        y: "b",
        data: [],
        text: {
          noData:
            "No rows yet. Bind the search [sales] [quantity purchased] [date].monthly\nThen retry",
        },
      }),
      { width: 300, height: 260 },
    );
    const lines = [...svg.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map((m) => m[1]!);
    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(lines.at(-1)).toBe("Then retry");
    for (const l of lines) expect(l.length * 7.2).toBeLessThanOrEqual(300 - 16);
  });
});

describe("#92 axes", () => {
  it("a short axis does not double the domain (51.6M at 300x260)", () => {
    const svg = render(
      spec({
        type: "bar",
        x: "q",
        y: "v",
        series: "y",
        format: { v: "compact" },
        data: [
          { q: "Q1", y: "a", v: 51.6e6 },
          { q: "Q1", y: "b", v: 40e6 },
          { q: "Q2", y: "a", v: 30e6 },
          { q: "Q2", y: "b", v: 20e6 },
        ],
      }),
      { width: 300, height: 260 },
    );
    expect(texts(group(svg, "axis-y")).at(-1)).toBe("60M");
    expect(niceTicks(0, 51.6e6, 3).domain[1]).toBeLessThan(100e6);
  });

  it("an off-step yDomain end tick is dropped when it would touch its neighbour", () => {
    const svg = render(
      spec({
        type: "bar",
        horizontal: true,
        x: "c",
        y: "v",
        format: { v: { style: "percent", signDisplay: "exceptZero" } },
        yDomain: [-0.06, 0.05],
        data: [
          { c: "North", v: -0.06 },
          { c: "South", v: 0.04 },
        ],
      }),
      { width: 300, height: 260 },
    );
    const t = texts(group(svg, "axis-x"));
    expect(t).toContain("+4%");
    expect(t).not.toContain("+5%");
  });

  it("wide band slots are cut, not thinned (#92.3)", () => {
    const data = [...Array(15)].map((_, i) => ({ c: `Category ${i}`, v: i + 1 }));
    const svg = render(spec({ type: "bar", x: "c", y: "v", data }), { width: 1400, height: 400 });
    expect(texts(group(svg, "axis-x"))).toHaveLength(15);
  });
});

describe("#93", () => {
  it("stack: false on radial is option-unsupported", () => {
    const s = { type: "radial", x: "m", y: "v", series: "y", data: [{ m: "a", y: "1", v: 1 }] };
    expect(() => render(spec({ ...s, stack: false }))).toThrow(/option-unsupported/);
    expect(() => render(spec(s))).not.toThrow();
  });
});
