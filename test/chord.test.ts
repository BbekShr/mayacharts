import { describe, expect, it } from "vitest";
import { renderParts } from "../src/index.ts";
import "../src/flow.ts";
import type { ChartSpec } from "../src/core/types.ts";

const regions = ["East", "West", "North"];
const fams = ["Food", "Tools"];
const data = regions.flatMap((region, i) =>
  fams.map((fam, j) => ({ region, fam, v: 10 + i * 3 + j })),
);
const spec: ChartSpec = { type: "chord", path: ["region", "fam"], y: "v", data };
const svg = (s: ChartSpec) => renderParts(s).svg;
const tags = (s: string, re: string) =>
  [...s.matchAll(new RegExp(`<${re}[^>]*>`, "g"))].map((m) => m[0]);

describe("chord", () => {
  it("one arc per node and one ribbon per pair", () => {
    const s = svg(spec);
    const arcs = tags(s, 'path data-maya="mark"');
    expect(arcs).toHaveLength(5);
    expect(tags(s, 'path data-maya="link"')).toHaveLength(6);
    expect(arcs.some((a) => a.includes('data-key="n~0~East"'))).toBe(true);
    expect(arcs.some((a) => a.includes('data-key="n~1~Food"'))).toBe(true);
    expect(tags(s, 'path data-maya="link"')[0]).toContain('data-key="k~0~East~Food"');
    expect(tags(s, 'path data-maya="link"')[0]).toContain('data-x="East -&gt; Food"');
  });
  it("node totals and aggregation of duplicate rows", () => {
    const s = svg({ ...spec, data: [...data, { region: "East", fam: "Food", v: 5 }] });
    expect(s).toMatch(/data-key="k~0~East~Food"[^>]*data-y="15"/);
    expect(s).toMatch(/data-key="n~0~East"[^>]*data-y="26"/);
    const m = svg({
      ...spec,
      aggregate: "max",
      data: [...data, { region: "East", fam: "Food", v: 5 }],
    });
    expect(m).toMatch(/data-key="k~0~East~Food"[^>]*data-y="10"/);
  });
  it("same name on both levels stays distinct", () => {
    const s = svg({ ...spec, data: [{ region: "A", fam: "A", v: 1 }] });
    expect(s).toContain('data-key="n~0~A"');
    expect(s).toContain('data-key="n~1~A"');
  });
  it("empty and single row", () => {
    expect(() => svg({ ...spec, data: [] })).not.toThrow();
    const s = svg({ ...spec, data: [{ region: "A", fam: "B", v: 3 }] });
    expect(tags(s, 'path data-maya="link"')).toHaveLength(1);
    expect(s).not.toContain("NaN");
  });
  it("hostile strings are escaped and no NaN", () => {
    const s = svg({ ...spec, data: [{ region: '"><script>x</script>', fam: "__proto__", v: 2 }] });
    expect(s).not.toContain("<script>");
    expect(s).not.toContain("NaN");
    expect(s).toContain("n~1~__proto__");
  });
  it("is deterministic", () => {
    expect(svg(spec)).toBe(svg(spec));
  });
  it("rejects a path that is not two levels", () => {
    expect(() => svg({ ...spec, path: ["region"] })).toThrow();
    expect(() => svg({ ...spec, path: ["region", "fam", "v"] })).toThrow();
  });
  it("zero values are rejected", () => {
    expect(() => svg({ ...spec, data: [{ region: "A", fam: "B", v: 0 }] })).toThrow();
  });
  it("ribbon keys are unique and marks are keyed", () => {
    const g = svg(spec).match(/<g data-maya="marks">(.*?)<\/g>/s)![1]!;
    const keys = [...g.matchAll(/data-key="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...g.matchAll(/<\w+ /g)]).toHaveLength(keys.length);
  });
  it("grows the ring in a narrow tile and keeps long labels readable", () => {
    const names = ["Tops and dresses", "A very long label name indeed"];
    const rows = names.flatMap((to, i) =>
      ["Online", "Store"].map((from, j) => ({ from, to, v: 5 + i + j })),
    );
    const s = renderParts(
      { type: "chord", path: ["from", "to"], y: "v", data: rows },
      { width: 390, height: 420 },
    ).svg;
    expect(s).toContain(">Tops and dresses<");
    expect(s).toContain(">A very long label\u2026<"); // clipped to 18 characters
    const arc = tags(s, 'path data-maya="mark"')[0]!;
    const ys = [...arc.matchAll(/([ML])(-?[\d.]+) (-?[\d.]+)/g)].map((m) => +m[3]!);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(10);
  });
});
