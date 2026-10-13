import { describe, expect, it } from "vitest";
import { render } from "../src/core/render.ts";
import type { ChartSpec } from "../src/core/types.ts";

describe("rule labels carrying their value", () => {
  const base = { type: "bar", x: "c", y: "v", y2: "u", format: { u: "percent" } };
  const data = [
    { c: "a", v: 3, u: 0.5 },
    { c: "b", v: 5, u: 0.7 },
  ];
  it("shows the value once when the label already holds it", () => {
    const svg = render({ ...base, data, rules: [{ y2: 0.8, label: "80%" }] } as ChartSpec);
    expect(svg).toContain(">80%</text>");
    expect(svg).not.toContain("80% 80%");
    expect(render({ ...base, data, rules: [{ y2: 0.8, label: "Cap" }] } as ChartSpec)).toContain(
      "Cap 80%",
    );
  });
  it("y rules do the same", () => {
    const svg = render({ ...base, data, rules: [{ y: 4, label: "Goal 4" }] } as ChartSpec);
    expect(svg).not.toContain("Goal 4 4");
  });
});

describe("heatmap was.by = series (calendar form)", () => {
  const data = [
    { d: "Mon", year: "2023", v: 4 },
    { d: "Tue", year: "2023", v: 6 },
    { d: "Mon", year: "2024", v: 10 },
    { d: "Tue", year: "2024", v: 3 },
  ];
  const svg = render({
    type: "heatmap",
    x: "d",
    y: "v",
    series: "year",
    was: { by: "year" },
    data,
  } as ChartSpec);
  it("keeps year rows and gives each cell the same x in the previous year", () => {
    expect(svg).not.toContain("undefined");
    const m = (s: string) =>
      svg.match(
        new RegExp(
          `data-key="[^"]*"[^>]*data-x="${s}"[^>]*data-series="2024"[^>]*data-was="([^"]*)"`,
        ),
      );
    expect(m("Mon")?.[1]).toMatch(/4/);
    expect(m("Tue")?.[1]).toMatch(/6/);
  });
});

describe("band labels that a cut would make identical", () => {
  it("are thinned, not truncated to the same stub", () => {
    const data = Array.from({ length: 8 }, (_, i) => ({ c: `2024-0${i + 1}-15 sales`, v: i + 1 }));
    const svg = render({ type: "bar", x: "c", y: "v", data } as ChartSpec, {
      width: 360,
      height: 240,
    });
    const axis = svg.match(/<g data-maya="axis-x">.*?<\/g>/)![0];
    const texts = [...axis.matchAll(/<text[^>]*>([^<]*)/g)].map((m) => m[1]!);
    expect(new Set(texts).size).toBe(texts.length);
    expect(texts.length).toBeLessThan(8);
  });
});

describe("documented theme example", () => {
  it("theme: [name, overrides] with a registered name renders", async () => {
    await import("../src/themes.ts");
    const svg = render({
      type: "bar",
      x: "c",
      y: "v",
      theme: ["ocean", { accent: "#6A7891" }],
      data: [{ c: "a", v: 1 }],
    } as ChartSpec);
    expect(svg).toContain("<svg");
  });
});
