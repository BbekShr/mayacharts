import { describe, expect, it } from "vitest";
import { renderParts } from "../src/index.ts";
import type { ChartSpec } from "../src/core/types.ts";

const labels = (svg: string) =>
  [...svg.slice(svg.indexOf('data-maya="labels"')).matchAll(/>([^<>]+)<\/text>/g)].map((m) => m[1]);
const num = (tag: string, re: RegExp) => Number(tag.match(re)![1]);

describe("bar", () => {
  it("keeps the Other roll-up out of the value domain and clips it at the plot edge", () => {
    const data = [10, 9, 8, ...Array.from({ length: 30 }, () => 5)].map((v, i) => ({
      c: `c${i}`,
      v,
    }));
    const svg = renderParts({
      type: "bar",
      x: "c",
      y: "v",
      sort: "desc",
      limit: 3,
      horizontal: true,
      data,
    }).svg;
    // The shown max is 10, so no tick reaches the roll-up's 150.
    expect(svg).not.toMatch(/>(100|150|200)</);
    const other = svg.match(/<rect[^>]*data-other=""[^>]*>/)![0];
    const top = svg.match(/<rect[^>]*data-key="[^"]*c0"[^>]*>/)![0];
    expect(num(other, /width="([\d.]+)"/)).toBeGreaterThanOrEqual(num(top, /width="([\d.]+)"/));
    expect(num(other, /data-y="([\d.]+)"/)).toBe(150); // the real value stays on the mark
  });

  it("waterfall labels the first bar and the Total, and drops a step label wider than its column", () => {
    const data = Array.from({ length: 14 }, (_, i) => ({
      s: `s${i}`,
      d: i ? (i % 2 ? 123456 : -98765) : 500000,
    }));
    const spec: ChartSpec = {
      type: "waterfall",
      x: "s",
      y: "d",
      totals: ["s13"],
      labels: true,
      data,
    };
    const l = labels(renderParts(spec).svg);
    expect(l.length).toBeGreaterThan(1);
    expect(l.length).toBeLessThan(data.length);
  });
});
