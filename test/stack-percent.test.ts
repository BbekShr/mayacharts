import { describe, expect, it } from "vitest";
import { render, renderParts, renderShell } from "../src/core/render.ts";
import { shape } from "../src/core/shape.ts";
import { resolve, validateSpec } from "../src/core/validate.ts";
import type { ChartSpec, Row } from "../src/core/types.ts";

const data: Row[] = [
  { m: "Jan", r: "N", v: 30 },
  { m: "Jan", r: "S", v: 10 },
  { m: "Feb", r: "N", v: 1 },
  { m: "Feb", r: "S", v: 2 },
  { m: "Feb", r: "E", v: 7 },
];
const pct = (o: Partial<ChartSpec> = {}): ChartSpec => ({
  type: "bar",
  data,
  x: "m",
  y: "v",
  series: "r",
  stack: "percent",
  ...o,
});
/** data-f of each mark, in draw order. */
const fs = (svg: string) =>
  [...svg.matchAll(/<rect data-maya="mark"[^>]*?data-f="([^"]*)"/g)].map((m) => m[1]);
const ticks = (svg: string) =>
  [...svg.match(/<g data-maya="axis-y">.*?<\/g>/)![0].matchAll(/>([^<]+)<\/text>/g)].map(
    (m) => m[1],
  );
const code = (spec: unknown) => {
  try {
    validateSpec(spec);
  } catch (e) {
    return (e as { code: string; path: string }).code + " " + (e as { path: string }).path;
  }
  return "ok";
};

describe('stack: "percent"', () => {
  it("shows each category's values as shares of its total on a 0 to 100% axis", () => {
    const svg = render(pct());
    expect(fs(svg)).toEqual(["75%", "25%", "10%", "20%", "70%"]);
    expect(ticks(svg)).toEqual(["0%", "25%", "50%", "75%", "100%"]);
    expect(svg).toContain('data-stack="percent"');
  });

  it("tops every all-positive stack out at exactly 1", () => {
    const rows = [0.1, 0.2, 0.7].map((v, i) => ({ m: "A", r: "s" + i, v }));
    const sh = shape(resolve(pct({ data: rows })));
    expect(sh.extent).toEqual([0, 1]);
    expect(sh.cells.at(-1)!.y1).toBe(1);
  });

  it("renormalises over the visible series when one is hidden", () => {
    const p = renderParts(pct(), { view: { hidden: ["N"] } });
    expect(fs(p.svg)).toEqual(["100%", "22.2%", "77.8%"]);
  });

  it("formats y as percent only when format leaves it unset", () => {
    expect(fs(render(pct({ format: { v: "decimal" } })))[0]).toBe("0.75");
    expect(fs(render(pct({ format: "{value:percent} share" })))[0]).toBe("75% share");
    expect(fs(render(pct({ format: { m: "year" } })))[0]).toBe("75%");
  });

  it("gives every measure of a y array the percent default", () => {
    const rows = data.map((r) => ({ ...r, w: 1 }));
    const svg = renderParts(pct({ data: rows, y: ["v", "w"] }), { view: { measure: 1 } }).svg;
    expect(fs(svg)).toEqual(["50%", "50%", "33.3%", "33.3%", "33.3%"]);
  });

  it("shows a category whose total is 0 as 0% shares", () => {
    const rows = [...data, { m: "Mar", r: "N", v: 0 }, { m: "Mar", r: "S", v: 0 }];
    expect(fs(render(pct({ data: rows }))).slice(-2)).toEqual(["0%", "0%"]);
  });

  it("stacks negatives below 0 as shares of the summed magnitudes", () => {
    const rows = [
      { m: "A", r: "agree", v: 60 },
      { m: "A", r: "disagree", v: -40 },
    ];
    const sh = shape(resolve(pct({ data: rows })));
    expect(sh.cells.map((c) => [c.value, c.y0, c.y1])).toEqual([
      [0.6, 0, 0.6],
      [-0.4, 0, -0.4],
    ]);
    expect(fs(render(pct({ data: rows })))).toEqual(["60%", "-40%"]);
  });

  it("works on area and horizontal bars", () => {
    const a = render(pct({ type: "area" }));
    expect(a).toContain('data-stack="percent"');
    expect(a).toMatch(/data-f="75%"/);
    expect(fs(render(pct({ horizontal: true })))[0]).toBe("75%");
  });

  it("puts numeric rules in share units and averages segment shares for mean", () => {
    const svg = render(pct({ rules: [0.5, "mean"] }));
    const g = svg.match(/<g data-maya="rules">.*?<\/g>/)![0];
    expect(g).toContain(">50%<");
    // (0.75 + 0.25 + 0.1 + 0.2 + 0.7) / 5 = 0.4
    expect(g).toContain(">Average 40%<");
  });

  it("describes, tables and labels shares", () => {
    const p = renderParts(pct({ labels: true }));
    expect(p.svg).toMatch(/<desc[^>]*>[^<]*values from 10% to 75%\./);
    expect(p.table).toContain("<td>75%</td>");
    expect(p.svg.match(/<g data-maya="labels">.*?<\/g>/)![0]).toContain(">75%<");
  });

  it("escapes hostile series and category names", () => {
    const rows = [
      { m: "<img src=x onerror=alert(1)>", r: '"><script>', v: 1 },
      { m: "<img src=x onerror=alert(1)>", r: "b", v: 3 },
    ];
    const s = renderShell(pct({ data: rows }));
    expect(s).not.toContain("<script>");
    expect(s).not.toContain("<img");
  });

  it("validates", () => {
    expect(code(pct())).toBe("ok");
    expect(code(pct({ stack: false }))).toBe("ok");
    expect(code(pct({ type: "line" }))).toBe("stack-unsupported stack");
    expect(code(pct({ type: "scatter" }))).toBe("option-unsupported stack");
    expect(code(pct({ stack: "yes" as never }))).toBe("invalid-option stack");
  });

  it("leaves stack: true and false unchanged", () => {
    const on = render(pct({ stack: true }));
    expect(fs(on)).toEqual(["30", "10", "1", "2", "7"]);
    expect(on).toContain('data-stack=""');
    expect(render(pct({ stack: false }))).toBe(render({ ...pct(), stack: undefined } as never));
  });
});

it("a total that overflows to Infinity still gives finite output", () => {
  const svg = render({
    type: "bar",
    stack: "percent",
    x: "k",
    y: ["a", "b"],
    data: [{ k: "x", a: 1e308, b: 1e308 }],
  });
  expect(svg).not.toMatch(/NaN|Infinity/);
});
