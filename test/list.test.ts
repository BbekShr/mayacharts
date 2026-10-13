import { describe, expect, it } from "vitest";
import { renderParts } from "../src/index.ts";
import type { ChartSpec } from "../src/core/types.ts";

const data = [
  {
    Move: "Lead with Jackets",
    Text: "Earns $86.81 a unit, 1.9x the average across every item type we sell today",
    Value: 86.81,
    Format: "currency",
  },
  { Move: "Lead with Jackets", Evidence: "Jackets", Value: 86.81, Format: "currency" },
  { Move: "Lead with Jackets", Evidence: "Vests", Value: 71.07, Format: "currency" },
  {
    Move: "Do not reallocate on trend",
    Text: "14 of 15 types down, none past 1.1%",
    Value: 1.2,
    Format: "{value} pts",
  },
  { Move: "Stock for Q3", Text: "Q3 is the peak quarter", Value: 59000000, Format: "currency" },
  {
    Move: "Protect the top three",
    Text: "Top three types hold 48% of sales",
    Value: 0.48,
    Format: "percent",
  },
];
const spec: ChartSpec = {
  type: "list",
  x: "Move",
  y: "Value",
  path: ["Move", "Evidence"],
  body: "Text",
  rowFormat: "Format",
  bars: true,
  data,
};
const draw = (s: Partial<ChartSpec> = {}, o = {}) =>
  renderParts({ ...spec, ...s } as ChartSpec, { width: 520, height: 360, ...o });
const keys = (svg: string) =>
  [...svg.matchAll(/data-maya="mark" data-key="([^"]+)"/g)].map((m) => m[1]);

describe("list #79", () => {
  it("one mark per move, each value in its own format, never summed", () => {
    const { svg } = draw();
    expect(keys(svg).filter((k) => k!.startsWith("m~"))).toHaveLength(4);
    for (const f of ["$86.81", "1.2 pts", "$59,000,000.00", "48%"]) expect(svg).toContain(f);
    expect(svg).not.toContain("157.88");
    expect(svg).toContain('data-x="Lead with Jackets"');
    expect(svg).toContain('data-f="$86.81"');
  });
  it("evidence bars on a local scale, only for the open move", () => {
    const { svg } = draw();
    expect(keys(svg).filter((k) => k!.startsWith("e~"))).toEqual([
      "e~Lead%20with%20Jackets~Jackets",
      "e~Lead%20with%20Jackets~Vests",
    ]);
    const w = [...svg.matchAll(/data-key="e~[^"]+"[^>]* width="([\d.]+)"/g)].map((m) => +m[1]!);
    expect(w[1]! / w[0]!).toBeCloseTo(71.07 / 86.81, 1);
    expect(draw({ expand: "none" }).svg).not.toContain('data-key="e~');
    expect(draw({ bars: false }).svg).not.toContain('data-key="e~');
    expect(draw({ expand: "all" }, { view: { expanded: "Stock for Q3" } }).svg).not.toContain(
      'data-key="e~',
    );
  });
  it("body clamps to two lines (one on a 300 px tile) with an ellipsis", () => {
    const lines = (svg: string) =>
      (svg.match(/data-key="mb~Lead%20with%20Jackets"[^>]*>(.*?)<\/text>/)?.[1] ?? "").split(
        "<tspan",
      ).length - 1;
    const long = { Text: "x ".repeat(200) };
    const s = (w: number) =>
      draw({ data: [{ ...data[0]!, ...long }, ...data.slice(1)] }, { width: w, height: 400 }).svg;
    expect(lines(s(520))).toBe(2);
    expect(lines(s(300))).toBe(1);
    expect(s(520)).toContain("…</tspan>");
  });
  it("rows carry aria-expanded and the data table lists the evidence", () => {
    const p = draw({ data: [...data, { Move: "Stock for Q3", Evidence: "Q3", Value: 5 }] });
    expect(p.svg).toContain('aria-expanded="true"');
    expect(p.svg).toContain('aria-expanded="false"');
    expect(p.table).toContain("Lead with Jackets: Vests");
    expect(p.table).toContain("$71.07");
  });
  it("what does not fit the height is not drawn", () => {
    const { svg } = draw({}, { height: 120 });
    expect(keys(svg).filter((k) => k!.startsWith("m~")).length).toBeLessThan(4);
  });
});
