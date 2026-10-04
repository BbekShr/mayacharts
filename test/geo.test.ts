import { describe, expect, it } from "vitest";
import { MayaSpecError } from "../src/core/validate.ts";
import { render } from "../src/index.ts";
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
  it("draws 52 backdrop hexes and a mark per state present", () => {
    const svg = render(base);
    const g = /<g data-maya="grid">(.*?)<\/g>/.exec(svg)![1]!;
    expect(g.match(/<path /g)).toHaveLength(52);
    expect(marks(svg).map((m) => attr(m, "data-key"))).toEqual(["g~CA", "g~TX", "g~NY"]);
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
    "<path data-maya="mark" data-key="g~CA" data-c="0" data-s="0" data-x="California" data-series="" data-f="10" data-y="10" data-q="0" d="M130.76 149.26L130.76 170.74L112.15 181.49L93.55 170.74L93.55 149.26L112.15 138.51Z"/>
    <path data-maya="mark" data-key="g~TX" data-c="1" data-s="0" data-x="Texas" data-series="" data-f="50" data-y="50" data-q="9" d="M269.33 252.11L269.33 273.6L250.72 284.34L232.11 273.6L232.11 252.11L250.72 241.37Z"/>
    <path data-maya="mark" data-key="g~NY" data-c="2" data-s="0" data-x="New York" data-series="" data-f="30" data-y="30" data-q="5" d="M447.48 80.69L447.48 102.17L428.87 112.91L410.26 102.17L410.26 80.69L428.87 69.94Z"/>"
  `));
  it("marks state labels on dark ramp steps with data-dark", () => {
    const t = render(base).match(/<text [^>]*data-in[^>]*>[A-Z]{2}</g) ?? [];
    expect(t).toHaveLength(3);
    expect(t.map((x) => x.includes("data-dark"))).toEqual([false, true, false]);
  });
});
