import { describe, expect, it } from "vitest";
import { MayaSpecError } from "../src/core/validate.ts";
import { render, renderShell } from "../src/index.ts";
import "../src/geo.ts";
import type { ChartSpec } from "../src/core/types.ts";

const spec = (rows: { s: string; v: number }[]): ChartSpec => ({
  type: "hexmap",
  x: "s",
  y: "v",
  data: rows,
});
const base = spec([
  { s: "CA", v: 10 },
  { s: "Texas", v: 50 },
  { s: " ny ", v: 30 },
]);
const marks = (svg: string) =>
  [...svg.matchAll(/<path data-maya="mark"[^>]*\/>/g)].map((m) => m[0]);
const attr = (s: string, a: string) => new RegExp(` ${a}="([^"]*)"`).exec(s)?.[1];

describe("hexmap", () => {
  it("draws a dashed empty hex for each missing state and a mark per state present", () => {
    const svg = render(base);
    const g = /<g data-maya="grid">(.*?)<\/g>/.exec(svg)![1]!;
    expect(g.match(/<path /g)).toHaveLength(49);
    expect(g).toContain("data-none");
    expect(marks(svg).map((m) => attr(m, "data-key"))).toEqual(["g~CA", "g~TX", "g~NY"]);
  });
  it("labels each hex with code and value, and flips dark steps", () => {
    const svg = render(base);
    const l = /<g data-maya="labels">(.*?)<\/g>/.exec(svg)![1]!;
    expect(l).toMatch(/>TX<\/text>/);
    expect(l).toMatch(/>50<\/text>/);
    expect(l).toMatch(/data-dark=""[^>]*>TX</);
  });
  it("drops values then codes on a tiny map", () => {
    const big = spec([
      { s: "CA", v: 3_900_000 },
      { s: "TX", v: 4_300_000 },
    ]);
    const l = (w: number) =>
      /<g data-maya="labels">(.*?)<\/g>/.exec(
        render({ ...big, format: "compact" }, { width: w, height: w / 2 }),
      )![1]!;
    expect(l(900)).toMatch(/>4.3M<\/text>/);
    expect(l(300)).not.toMatch(/>[0-9.]+M<\/text>/);
    expect(l(100)).not.toMatch(/>TX<\/text>/);
  });
  it("shows a ramp legend by default, off with legend:false", () => {
    expect(render(base)).not.toContain('data-maya="ramp"');
    expect(renderShell(base)).toMatch(
      /data-maya="ramp"[^>]*><b>v<\/b><span>10<\/span><i><\/i><span>50<\/span>/,
    );
    expect(renderShell({ ...base, legend: false })).not.toContain('data-maya="ramp"');
  });
  it("merges code and full-name duplicates by summing", () => {
    const m = marks(
      render(
        spec([
          { s: "CA", v: 1 },
          { s: "california", v: 2 },
          { s: "TX", v: 9 },
        ]),
      ),
    );
    expect(m).toHaveLength(2);
    expect(attr(m[0]!, "data-y")).toBe("3");
    expect(attr(m[0]!, "data-x")).toBe("California");
  });
  it("buckets data-q over the value extent", () => {
    const q = marks(render(base)).map((m) => attr(m, "data-q"));
    expect(q).toEqual(["0", "9", "5"]);
  });
  it("rejects unknown states with a suggestion", () => {
    try {
      render(
        spec([
          { s: "CA", v: 1 },
          { s: "Texs", v: 2 },
        ]),
      );
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(MayaSpecError);
      const err = e as MayaSpecError;
      expect(err.code).toBe("unknown-state");
      expect(err.path).toBe("data[1].s");
      expect(err.message).toContain('Did you mean "Texas"?');
    }
  });
  it.each([
    [300, 200],
    [800, 500],
  ])("keeps hexes inside the plot at %ix%i", (width, height) => {
    const svg = render(base, { width, height });
    const g = /<g data-maya="grid">(.*?)<\/g>/.exec(svg)![1]!;
    for (const d of g.matchAll(/ d="([^"]*)"/g))
      for (const [x, y] of [...d[1]!.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map(
        (p) => [+p[1]!, +p[2]!] as const,
      )) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(width);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(height);
      }
  });
  it("snapshot", () =>
    expect(marks(render(base)).join("\n")).toMatchInlineSnapshot(`
      "<path data-maya="mark" data-key="g~CA" data-c="0" data-s="0" data-x="California" data-series="" data-f="10" data-y="10" data-q="0" d="M129.87 149.77L129.87 170.23L112.15 180.46L94.44 170.23L94.44 149.77L112.15 139.54Z"/>
      <path data-maya="mark" data-key="g~TX" data-c="1" data-s="0" data-x="Texas" data-series="" data-f="50" data-y="50" data-q="9" d="M268.43 252.63L268.43 273.09L250.72 283.31L233 273.09L233 252.63L250.72 242.4Z"/>
      <path data-maya="mark" data-key="g~NY" data-c="2" data-s="0" data-x="New York" data-series="" data-f="30" data-y="30" data-q="5" d="M446.59 81.2L446.59 101.66L428.87 111.89L411.16 101.66L411.16 81.2L428.87 70.97Z"/>"
    `));
  it("marks state labels on dark ramp steps with data-dark", () => {
    const t = (render(base).match(/<text [^>]*data-in[^>]*>[A-Z]{2}</g) ?? []).filter(
      (x) => !x.includes("opacity"),
    );
    expect(t).toHaveLength(3);
    expect(t.map((x) => x.includes("data-dark"))).toEqual([false, true, false]);
  });
});
