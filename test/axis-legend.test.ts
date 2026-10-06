import { describe, expect, it } from "vitest";
import { render, renderParts } from "../src/core/render.ts";
import type { ChartSpec } from "../src/core/types.ts";

const axisX = (spec: ChartSpec, width = 360) =>
  (render(spec, { width, height: 240 }) as string).match(/data-maya="axis-x"[^]*?<\/g>/)![0];
const texts = (g: string) => [...g.matchAll(/<text[^>]*>([^<]*)/g)].map((m) => m[1]);

describe("bubble legend", () => {
  it("scatter with size and colorBy renders the colour ramp and the size key", () => {
    const spec = {
      type: "scatter",
      x: "a",
      y: "b",
      size: "z",
      colorBy: "m",
      data: [
        { a: 1, b: 1, z: 10, m: 1 },
        { a: 2, b: 2, z: 1000, m: 9 },
      ],
    } as ChartSpec;
    const { legend } = renderParts(spec);
    expect(legend.match(/class="maya-legend"/g)).toHaveLength(2);
    expect(legend).toContain("<i></i>");
    expect(legend).toContain("<circle");
    expect(renderParts({ ...spec, legend: false } as ChartSpec).legend).toBe("");
  });
});

describe("narrow axes", () => {
  const names = ["Alpha long name", "Bravo long name", "Charlie long name", "Delta long name"];
  it("never thins 8 or fewer categories, it clips each label", () => {
    const g = axisX({ type: "bar", x: "x", y: "y", data: names.map((x) => ({ x, y: 1 })) });
    const t = texts(g);
    expect(t).toHaveLength(4);
    expect(t.some((s) => s!.endsWith("…"))).toBe(true);
    expect(g).toContain("<title>Alpha long name</title>");
  });
  it("still thins more than 8 categories", () => {
    const data = Array.from({ length: 20 }, (_, i) => ({ x: "Category " + i, y: i }));
    expect(texts(axisX({ type: "bar", x: "x", y: "y", data }))!.length).toBeLessThan(20);
  });
  it("a time axis keeps its first and last tick when narrow", () => {
    const data = [0, 11].map((d) => ({
      x: new Date(Date.UTC(2025, 0, 1 + d)).toISOString(),
      y: d,
    }));
    expect(texts(axisX({ type: "line", x: "x", y: "y", data }))).toEqual(["Jan 1", "Jan 12"]);
  });
});
