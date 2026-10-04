import { describe, expect, it } from "vitest";
import { render, renderParts } from "../src/index.ts";
import "../src/hierarchy.ts";
import type { ChartSpec } from "../src/core/types.ts";

const data = [
  { c: "A", v: 1 },
  { c: "B", v: 1 },
  { c: "C", v: 1 },
];
const spec: ChartSpec = { type: "waffle", x: "c", y: "v", data };
const marks = (s: string) => [...s.matchAll(/<rect data-maya="mark"[^>]*>/g)].map((m) => m[0]);
const count = (s: string, c: string) => marks(s).filter((m) => m.includes(`data-x="${c}"`)).length;

describe("waffle", () => {
  it("always 100 cells, largest remainder allocation", () => {
    const s = renderParts(spec).svg;
    expect(marks(s)).toHaveLength(100);
    expect([count(s, "A"), count(s, "B"), count(s, "C")]).toEqual([34, 33, 33]);
    expect(marks(s)[0]).toContain('data-key="w~A~0"');
    expect(marks(s)[0]).toContain("(33%)");
  });
  it("cells fill row by row in category order", () => {
    const m = marks(renderParts(spec).svg);
    expect(m[33]).toContain('data-x="A"');
    expect(m[34]).toContain('data-x="B"');
  });
  it("hit rects cover the grid step and the legend lists shares", () => {
    const p = renderParts({ ...spec, legend: true });
    expect(p.svg.match(/data-maya="hit"/g)).toHaveLength(100);
    expect(p.legend).toContain("A 33%");
  });
  it("empty and zero data render nothing", () => {
    expect(marks(renderParts({ ...spec, data: [] }).svg)).toHaveLength(0);
    expect(marks(renderParts({ ...spec, data: [{ c: "A", v: 0 }] }).svg)).toHaveLength(0);
  });
  it("tiny shares may get no cells; single category fills all", () => {
    expect(marks(renderParts({ ...spec, data: [{ c: "A", v: 5 }] }).svg)).toHaveLength(100);
    const s = renderParts({
      ...spec,
      data: [
        { c: "A", v: 1000 },
        { c: "B", v: 1 },
      ],
    }).svg;
    expect(marks(s)).toHaveLength(100);
  });
  it("escapes hostile strings", () => {
    const h = render({ ...spec, data: [{ c: "<img onerror=x>", v: 1 }] });
    expect(h).not.toContain("<img");
  });
  it("is deterministic", () => {
    expect(render(spec)).toBe(render(spec));
  });
  it("colors keyed by category map to category slots", () => {
    const v = renderParts({ ...spec, colors: { B: "#123456" } } as unknown as ChartSpec).vars;
    expect(v).toEqual([["--maya-series-2", "#123456"]]);
  });
});
