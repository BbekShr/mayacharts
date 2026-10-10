import { describe, expect, it } from "vitest";
import "../src/radial.ts";
import { render } from "../src/index.ts";
import type { ChartSpec } from "../src/core/types.ts";

const base = (o: Partial<ChartSpec> = {}, v = 62): ChartSpec =>
  ({ type: "gauge", y: "v", data: [{ v, w: 50 }], ...o }) as ChartSpec;
const svg = (s: ChartSpec, size = {}) => render(s, { width: 360, height: 220, ...size });
const arc = (s: string) => s.match(/<path data-maya="mark"[^>]*>/)![0];
const labels = (s: string) => s.match(/<g data-maya="labels"[\s\S]*?<\/g>/)?.[0] ?? "";

describe("gauge", () => {
  it("draws the value arc and a centre number", () => {
    const s = svg(base());
    expect(arc(s)).toContain('data-y="62"');
    expect(s).toMatch(/<text data-maya="mark" data-key="t"[^>]*>62<\/text>/);
  });
  it("uses yDomain for the end labels", () => {
    const l = labels(svg(base({ yDomain: [10, 90] })));
    expect(l).toContain(">10<");
    expect(l).toContain(">90<");
  });
  it("without yDomain the range is 0 to a nice max over value and target", () => {
    expect(labels(svg(base()))).toContain(">80<");
    expect(labels(svg(base({ colorBy: { target: 170 } })))).toContain(">200<");
    expect(labels(svg(base({ was: "w" }, 120)))).toContain(">125<");
  });
  it("tone and status word follow target, warn and better", () => {
    const g = (v: number, colorBy: NonNullable<ChartSpec["colorBy"]>) =>
      svg(base({ colorBy, yDomain: [0, 100] }, v));
    expect(arc(g(80, { target: 70, warn: 50 }))).toContain('data-tone="good"');
    expect(g(80, { target: 70, warn: 50 })).toContain("On track");
    expect(g(60, { target: 70, warn: 50 })).toContain("At risk");
    expect(g(40, { target: 70, warn: 50 })).toContain("Off track");
    expect(g(40, { target: 30, warn: 50, better: "lower" })).toContain("At risk");
    expect(arc(g(80, { target: 30, warn: 50, better: "lower" }))).toContain('data-tone="bad"');
    const plain = svg(base());
    expect(arc(plain)).not.toContain("data-tone");
    expect(plain).not.toContain("On track");
  });
  it("draws a target tick and warn bands only when set", () => {
    const s = svg(base({ colorBy: { target: 70, warn: 50 }, yDomain: [0, 100] }));
    expect(s).toContain('data-kpi="target"');
    expect(s).toContain("target 70");
    expect(
      [...s.matchAll(/fill="var\(--maya-fg\)" fill-opacity="([\d.]+)"/g)].map((m) => m[1]),
    ).toEqual(["0.2", "0.12", "0.06"]);
    expect(svg(base({ colorBy: { target: 70 } }))).not.toContain('fill-opacity="0.2"');
    expect(svg(base())).not.toContain('data-kpi="target"');
  });
  it("was adds a change line toned by better", () => {
    const s = svg(base({ was: "w", titles: { w: "last year" } }));
    expect(s).toContain("▲ +12 (+24%) vs last year");
    expect(svg(base({ was: "w" }, 40))).toContain("▼ −10 (−20%) vs w");
    expect(s).toContain('data-tone="good"');
    expect(svg(base({ was: "w", colorBy: { better: "lower" } }))).toContain('data-tone="bad"');
    expect(svg(base())).not.toContain(" vs ");
  });
  it("percent y states the change in points", () => {
    const s = svg({
      type: "gauge",
      y: "v",
      was: "w",
      format: "percent",
      data: [{ v: 0.353, w: 0.325 }],
    });
    expect(s).toContain("▲ +2.8 pts (+8.6%) vs w");
  });
  it("the status word never vanishes: it leads the row under a small dial", () => {
    const c = { target: 70, warn: 50 };
    const big = svg(base({ colorBy: c, was: "w" }, 80));
    expect(big).toMatch(/<text[^>]*>On track<\/text>/);
    const small = svg(base({ colorBy: c, was: "w" }, 80), { width: 120, height: 90 });
    expect(small).toContain(">On track, </tspan>");
    expect(svg(base({ colorBy: c }, 80), { width: 120, height: 90 })).toContain(
      ">On track</tspan>",
    );
  });
  it("the auto range reaches negatives and has no last-year tick", () => {
    expect(labels(svg(base({}, -30)))).toContain(">-30<");
    expect(svg(base({ was: "w" }))).not.toContain("<line");
  });
  it("combines rows by aggregate", () => {
    const s = svg({ type: "gauge", y: "v", aggregate: "mean", data: [{ v: 10 }, { v: 30 }] });
    expect(arc(s)).toContain('data-y="20"');
  });
  it("empty data shows the no-data text", () => {
    expect(svg({ type: "gauge", y: "v", data: [] })).toContain('data-maya="empty"');
  });
  it("survives tiny boxes without NaN", () => {
    for (const [width, height] of [
      [40, 30],
      [360, 60],
      [20, 300],
    ]) {
      const s = svg(base({ colorBy: { target: 70, warn: 50 }, was: "w" }), { width, height });
      expect(s).not.toMatch(/NaN|undefined/);
    }
  });
  it("escapes hostile strings", () => {
    const x = "<img src=x onerror=alert(1)>";
    const s = svg(base({ titles: { v: x, w: x }, was: "w" }));
    expect(s).not.toContain("<img");
  });
  it("keys stay the same when the value changes", () => {
    const keys = (s: string) => [...s.matchAll(/data-key="([^"]*)"/g)].map((m) => m[1]).sort();
    expect(keys(svg(base({}, 20)))).toEqual(keys(svg(base({}, 90))));
    expect(arc(svg(base({}, 20)))).not.toBe(arc(svg(base({}, 90))));
  });
});
