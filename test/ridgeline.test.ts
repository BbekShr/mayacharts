import { describe, expect, it } from "vitest";
import { render, renderParts } from "../src/index.ts";
import type { ChartSpec } from "../src/core/types.ts";

const months = ["Jan", "Feb", "Mar"];
const data = ["East", "West"].flatMap((p, i) =>
  months.map((m, j) => ({ m, p, v: (i + 1) * 10 + j * 5 })),
);
const spec: ChartSpec = { type: "ridgeline", x: "m", y: "v", series: "p", data };
const svg = (s: ChartSpec, hidden: string[] = []) => renderParts(s, { view: { hidden } }).svg;
const tags = (s: string, re: string) =>
  [...s.matchAll(new RegExp(`<${re}[^>]*>`, "g"))].map((m) => m[0]);

describe("ridgeline", () => {
  it("one area, outline and dot per cell, keyed", () => {
    const s = svg(spec);
    expect(tags(s, 'path data-maya="area"')).toHaveLength(2);
    expect(tags(s, 'path data-maya="line"')[1]).toContain('data-key="l~West"');
    expect(tags(s, 'path data-maya="area"')[0]).toContain('data-key="a~East"');
    const dots = tags(s, 'circle data-maya="mark"');
    expect(dots).toHaveLength(6);
    expect(dots[0]).toContain('data-key="East~Jan"');
    expect(dots[3]).toContain('data-s="1"');
    expect(tags(s, 'rect data-maya="hit"')).toHaveLength(3);
  });
  it("marks group holds only keyed children, dots after outlines", () => {
    const g = svg(spec).match(/<g data-maya="marks">(.*?)<\/g>/s)![1]!;
    expect(g.match(/<\w+ /g)!.length).toBe(g.match(/data-key=/g)!.length);
    expect(g.indexOf("<circle")).toBeGreaterThan(g.lastIndexOf('data-maya="line"'));
  });
  it("first series is the top row", () => {
    const s = svg(spec);
    const base = (k: string) =>
      Number(
        /d="M[\d.]+ ([\d.]+)/.exec(tags(s, `path data-maya="line" data-key="l~${k}"`)[0]!)![1],
      );
    expect(base("East")).toBeLessThan(base("West"));
  });
  it("hidden series drops its row", () => {
    const s = svg(spec, ["East"]);
    expect(tags(s, 'path data-maya="area"')).toHaveLength(1);
    expect(tags(s, 'circle data-maya="mark"')).toHaveLength(3);
  });
  it("nulls break the outline, empty data renders", () => {
    const d = data.map((r) => (r.p === "East" && r.m === "Feb" ? { ...r, v: null } : r));
    const s = svg({ ...spec, data: d as never });
    expect(tags(s, 'path data-maya="line"')[0]!.match(/M/g)).toHaveLength(2);
    expect(() => render({ ...spec, data: [] })).not.toThrow();
  });
  it("single row and zero values", () => {
    const one = data.filter((r) => r.p === "East").map((r) => ({ ...r, v: 0 }));
    expect(tags(svg({ ...spec, data: one }), 'circle data-maya="mark"')).toHaveLength(3);
  });
  it("escapes hostile strings and is deterministic", () => {
    const bad = '"><script>x</script>';
    const d = data.map((r) => ({
      ...r,
      m: r.m === "Jan" ? bad : r.m,
      p: r.p === "East" ? bad : r.p,
    }));
    const s = svg({ ...spec, data: d });
    expect(s).not.toContain("<script>x");
    expect(svg({ ...spec, data: d })).toBe(s);
  });
  it("requires series", () => {
    const { series: _s, ...rest } = spec;
    expect(() => render(rest as ChartSpec)).toThrow();
  });
});
