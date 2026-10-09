import { describe, expect, it } from "vitest";
import { render } from "../src/index.ts";
import type { ChartSpec } from "../src/core/types.ts";

const labels = (s: ChartSpec) =>
  render(s, { width: 600, height: 300 }).match(/<text[^>]*data-in[^>]*>/g) ?? [];

describe("bar value labels over the bar", () => {
  const base: ChartSpec = {
    type: "bar",
    x: "k",
    y: "v",
    labels: true,
    horizontal: true,
    data: [
      { k: "a", v: 100 },
      { k: "b", v: 80 },
    ],
  };
  it("carry the dark ink on a full-strength bar", () => {
    const l = labels(base);
    expect(l).toHaveLength(2);
    expect(l.every((t) => t.includes('data-ink=""'))).toBe(true);
  });
  it("use the page background ink on the grey roll-up bar and on tone fills", () => {
    const other = labels({ ...base, limit: 1, sort: "desc" });
    expect(other.some((t) => t.includes('data-ink="b"'))).toBe(true);
    expect(labels({ ...base, colorBy: "sign" }).every((t) => t.includes('data-ink="b"'))).toBe(
      true,
    );
  });
  it("follow the ramp's dark-step rule when coloured by a field", () => {
    const l = labels({
      ...base,
      colorBy: "v",
      data: [
        { k: "a", v: 100 },
        { k: "b", v: 60 },
      ],
    });
    expect(l.some((t) => t.includes('data-ink=""'))).toBe(true);
    expect(l.some((t) => !t.includes("data-ink"))).toBe(true);
  });
});

describe("bar breaks and waterfall start", () => {
  it("draws break marks only for a clipped Other bar", () => {
    const data = [..."abcdefg"].map((k, i) => ({ k, v: i < 3 ? 200 - i : 100 }));
    const s: ChartSpec = { type: "bar", x: "k", y: "v", limit: 3, data, horizontal: true };
    expect(render(s, { width: 600, height: 300 })).toContain("<path data-brk");
    expect(render({ ...s, limit: 99 }, { width: 600, height: 300 })).not.toContain(
      "<path data-brk",
    );
  });
  it("makes the waterfall start bar neutral like the total", () => {
    const s: ChartSpec = {
      type: "waterfall",
      x: "k",
      y: "v",
      totals: ["T"],
      data: [
        { k: "a", v: 5 },
        { k: "b", v: 2 },
        { k: "T", v: 0 },
      ],
    };
    const svg = render(s, { width: 600, height: 300 });
    expect(svg.match(/<rect data-maya="mark"[^>]*data-total/g)?.length).toBe(2);
  });
});

describe("stacked segment labels", () => {
  it("drop a value that does not fit inside its segment instead of landing on the neighbour", () => {
    const svg = render(
      {
        type: "bar",
        x: "k",
        y: "v",
        series: "s",
        stack: true,
        labels: true,
        data: [
          { k: "a", s: "big", v: 1000 },
          { k: "a", s: "tiny", v: 1 },
        ],
      } as ChartSpec,
      { width: 600, height: 300 },
    );
    expect(svg.slice(svg.indexOf('data-maya="labels"')).match(/<text/g)).toHaveLength(1);
  });
});
