import { describe, expect, it } from "vitest";
import { SPECS } from "../e2e/specs.ts";
import { render, renderParts } from "../src/core/render.ts";
import { validateSpec } from "../src/core/validate.ts";
import type { ChartSpec, Row } from "../src/core/types.ts";

const data: Row[] = ["A", "B", "C", "D"].map((k, i) => ({
  k,
  v: (i + 1) * 10,
  w: 100 - i * 10,
  g: i % 2 ? "x" : "y",
}));
const bar = (o: Partial<ChartSpec> = {}): ChartSpec => ({
  type: "bar",
  data,
  x: "k",
  y: "v",
  ...o,
});
const plot = (svg: string) =>
  svg
    .match(/data-plot="([^"]+)"/)![1]!
    .split(" ")
    .map(Number);
/** The rules group's markup. */
const group = (svg: string) => svg.match(/<g data-maya="rules">.*?<\/g>/)?.[0] ?? "";
const lines = (svg: string) =>
  [...group(svg).matchAll(/<line x1="([\d.]+)" x2="([\d.]+)" y1="([\d.]+)" y2="([\d.]+)"\/>/g)].map(
    (m) => ({ x1: +m[1]!, x2: +m[2]!, y1: +m[3]!, y2: +m[4]! }),
  );
const desc = (svg: string) => svg.match(/<desc[^>]*>([^<]*)<\/desc>/)![1]!;
const code = (spec: unknown) => {
  try {
    validateSpec(spec);
  } catch (e) {
    return (e as { code: string; path: string }).code + " " + (e as { path: string }).path;
  }
  return "ok";
};

describe("rules", () => {
  it("draws a horizontal line on a vertical bar, widening the domain to a target", () => {
    const svg = render(bar({ rules: [{ y: 60, label: "Target" }] }));
    const [px, py, pw] = plot(svg);
    // 60 is the top of the nice domain [0, 60]: the line sits on the plot's top edge.
    expect(lines(svg)).toEqual([{ x1: px, x2: px! + pw!, y1: py, y2: py }]);
    expect(svg).toContain(">Target 60</text>");
    expect(svg).toContain('<g data-maya="rules">');
    expect(group(svg)).toMatch(/<text [^>]*text-anchor="end">Target 60<\/text>/);
    expect(desc(svg)).toMatch(/ Target: 60\.$/);
  });

  it("draws a vertical line on a horizontal bar", () => {
    const svg = render(bar({ horizontal: true, rules: [25] }));
    const [px, py, pw, ph] = plot(svg);
    const [l] = lines(svg);
    expect(l!.x1).toBe(l!.x2);
    expect([l!.y1, l!.y2]).toEqual([py, py! + ph!]);
    expect(l!.x1).toBeCloseTo(px! + (pw! * 25) / 40, 1); // domain [0, 40]
    expect(group(svg)).toMatch(/<text [^>]*>25<\/text>/); // bare numbers show the value alone
    expect(desc(svg)).toMatch(/ Reference line: 25\.$/);
  });

  it('places "mean" on line, area and scatter', () => {
    for (const type of ["line", "area"] as const) {
      const svg = render(bar({ type, rules: ["mean"] }));
      const [, py, , ph] = plot(svg);
      expect(lines(svg)[0]!.y1).toBeCloseTo(py! + ph! * (1 - 25 / 40), 1);
      expect(svg).toContain(">Average 25</text>");
      expect(desc(svg)).toMatch(/ Average: 25\.$/);
    }
    const sc = render({ type: "scatter", data, x: "v", y: "w", rules: ["mean"] });
    expect(desc(sc)).toMatch(/ Average: 85\.$/);
    expect(lines(sc)).toHaveLength(1);
  });

  it('"mean" of a stacked chart averages the category totals', () => {
    const rows = data.flatMap((r) => [r, { ...r, g: "z", v: 1 }]);
    const svg = render(bar({ data: rows, series: "g", stack: true, rules: ["mean"] }));
    expect(desc(svg)).toMatch(/ Average: 26\.$/);
    const grouped = render(bar({ data: rows, series: "g", rules: ["mean"] }));
    expect(desc(grouped)).toMatch(/ Average: 13\.$/);
  });

  it('"mean" follows hidden series and the active measure', () => {
    const s = bar({ series: "g", y: ["v", "w"], rules: ["mean"] });
    expect(desc(renderParts(s).svg)).toMatch(/ Average: 25\.$/);
    expect(desc(renderParts(s, { view: { hidden: ["x"] } }).svg)).toMatch(/ Average: 20\.$/);
    expect(desc(renderParts(s, { view: { measure: 1 } }).svg)).toMatch(/ Average: 85\.$/);
  });

  it("a fixed yDomain wins: rules outside it are not drawn", () => {
    const svg = render(bar({ yDomain: [0, 30], rules: [50, { y: 20, label: "Floor" }] }));
    expect(lines(svg)).toHaveLength(1);
    expect(desc(svg)).not.toContain("50");
    expect(svg).toContain(">30</text>");
  });

  it("escapes hostile labels", () => {
    for (const label of ["<script>alert(1)</script>", `"'><img onerror=x>`, "‮טקסט عربي"]) {
      const svg = render(bar({ rules: [{ y: 20, label }] }));
      expect(svg).not.toContain("<script>");
      expect(svg).not.toContain("<img");
      expect(svg).not.toMatch(/"'>/);
    }
    expect(render(bar({ rules: [{ y: 20, label: "‮טקסט" }] }))).toContain("‮טקסט 20</text>");
  });

  it("text overrides the default label", () => {
    expect(render(bar({ rules: ["mean"], text: { mean: "Moyenne" } }))).toContain(
      ">Moyenne 25</text>",
    );
  });

  it("validates", () => {
    expect(code(bar({ rules: [1, 2, 3, 4] }))).toBe("ok");
    expect(code(bar({ rules: [1, 2, 3, 4, 5] }))).toBe("invalid-option rules");
    expect(code(bar({ rules: 100 as never }))).toBe("invalid-option rules");
    expect(code(bar({ rules: ["median" as never] }))).toBe("invalid-option rules[0]");
    expect(code(bar({ rules: [Infinity] }))).toBe("invalid-option rules[0]");
    expect(code(bar({ rules: [1e308] }))).toBe("invalid-option rules[0]");
    expect(code(bar({ rules: [1, { y: 2, label: "x".repeat(41) }] }))).toBe(
      "invalid-option rules[1]",
    );
    expect(code(bar({ rules: [{ y: 2, color: "red" } as never] }))).toBe("invalid-option rules[0]");
    expect(code(bar({ rules: [{ label: "x" } as never] }))).toBe("invalid-option rules[0]");
    expect(code(bar({ type: "waterfall", rules: [1] }))).toBe("option-unsupported rules");
    expect(code(bar({ type: "heatmap", rules: [1] }))).toBe("option-unsupported rules");
  });

  it("an empty rules list renders exactly like no rules", () => {
    for (const s of Object.values(SPECS) as ChartSpec[])
      if (["bar", "line", "area", "scatter"].includes(s.type)) {
        expect(render({ ...s, rules: [] })).toBe(render(s));
        expect(render(s)).not.toContain('data-maya="rules"');
      }
  });
});
