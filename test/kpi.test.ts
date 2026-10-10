import { describe, expect, it } from "vitest";
import { render, renderParts } from "../src/index.ts";
import type { ChartSpec } from "../src/core/types.ts";

const months = ["Jan", "Feb", "Mar", "Apr"];
const base: ChartSpec = {
  type: "kpi",
  x: "m",
  y: "v",
  data: months.map((m, i) => ({ m, v: [100, 80, 90, 110][i]! })),
};
const svg = (s: ChartSpec, o = {}) => renderParts(s, { width: 300, height: 220, ...o }).svg;
const headline = (s: string) =>
  s.match(/<text data-maya="mark" data-key="v"[^>]*>([^<]*)<\/text>/)!;
const delta = (s: string) => s.match(/<text [^>]*data-kpi="delta"[^>]*>([^<]*)<\/text>/);

describe("kpi", () => {
  it("headline is the last category", () => {
    const h = headline(svg(base));
    expect(h[0]).toContain('data-y="110"');
    expect(h[0]).not.toContain("data-c");
    expect(h[0]).toContain('data-x="Apr"');
  });
  it("without x it aggregates all rows", () => {
    const s = svg({ type: "kpi", y: "v", data: base.data });
    expect(headline(s)[0]).toContain('data-y="380"');
    expect(s).not.toContain('data-maya="line"');
    expect(svg({ type: "kpi", y: "v", aggregate: "mean", data: base.data })).toContain(
      'data-y="95"',
    );
  });
  it("delta text and tone", () => {
    const up = delta(svg(base))!;
    expect(up[0]).toContain('data-tone="good"');
    expect(up[1]).toBe("▲ +20 (+22.2%) vs Mar");
    const down = delta(svg({ ...base, data: base.data.slice(0, 2) }))!;
    expect(down[0]).toContain('data-tone="bad"');
    expect(down[1]).toBe("▼ \u221220 (\u221220%) vs Jan");
  });
  it("no delta for a single category or a zero previous", () => {
    expect(delta(svg({ ...base, data: base.data.slice(0, 1) }))).toBeNull();
    expect(
      delta(
        svg({
          ...base,
          data: [
            { m: "a", v: 0 },
            { m: "b", v: 5 },
          ],
        }),
      ),
    ).toBeNull();
  });
  it("the hit covers the sparkline band only and the dots come before the headline", () => {
    const s = svg(base);
    const hit = s.match(/<rect data-maya="hit"[^>]*y="([\d.]+)"[^>]*height="([\d.]+)"/)!;
    expect(+hit[1]!).toBeGreaterThan(40);
    expect(+hit[1]! + +hit[2]!).toBeLessThan(220);
    expect(s.indexOf("<circle")).toBeLessThan(s.indexOf('data-key="v"'));
  });
  it("sparkline only with 3 or more categories", () => {
    const s = svg(base);
    expect(s).toContain('data-maya="line"');
    expect(s.match(/<circle /g)).toHaveLength(4);
    expect(s.match(/data-maya="hit"/g)).toHaveLength(1); // one plot-wide hit
    expect(s.match(/data-last=""/g)).toHaveLength(1);
    const two = svg({ ...base, data: base.data.slice(0, 2) });
    expect(two).not.toContain('data-maya="line"');
    expect(two).not.toContain("<circle");
  });
  it("target: status word, headline tone and a comparison line", () => {
    const above = svg({ ...base, colorBy: { target: 100 } });
    expect(above).toContain('data-kpi="fill"');
    expect(above).toMatch(/data-kpi="fill"[^>]*data-tone="good"/);
    expect(above).toMatch(/<text [^>]*data-key="v"[^>]*data-tone="good"/);
    expect(above).toContain(">On track<");
    expect(above).toContain("vs target 100");
    const below = svg({ ...base, colorBy: { target: 200 } });
    expect(below).toMatch(/data-kpi="fill"[^>]*data-tone="bad"/);
    expect(below).toContain(">Off track<");
    expect(below).toContain("(\u221245%) vs target 200");
  });
  it("warn tone and word, bands and the bullet scale", () => {
    const s = svg({ ...base, colorBy: { target: 120, warn: 100 } });
    expect(s).toMatch(/data-kpi="fill"[^>]*data-tone="warn"/);
    expect(s).toContain(">At risk<");
    expect(s.match(/data-kpi="band"/g)).toHaveLength(3);
    expect(svg({ ...base, colorBy: { target: 100 } })).not.toContain('data-kpi="band"');
    // yDomain sets the scale: 110 of 0..220 fills half the 276 px track.
    const w = svg({ ...base, yDomain: [0, 220], colorBy: { target: 100 } }).match(
      /data-kpi="fill"[^>]*width="([\d.]+)"/,
    )!;
    expect(+w[1]!).toBe(138);
  });
  it("lower is better flips the change tone and the status", () => {
    const up = delta(svg({ ...base, colorBy: { better: "lower" } }))!;
    expect(up[0]).toContain('data-tone="bad"'); // 90 -> 110 is a rise
    const spec: ChartSpec = { ...base, colorBy: { target: 100, warn: 120, better: "lower" } };
    expect(svg(spec)).toContain(">At risk<"); // 110: past target, inside warn
    expect(svg({ ...spec, colorBy: { target: 120, better: "lower" } })).toContain(">On track<");
    expect(svg({ ...spec, colorBy: { target: 90, warn: 100, better: "lower" } })).toContain(
      ">Off track<",
    );
  });
  it("a tiny previous value keeps the percent short", () => {
    const s = svg({
      ...base,
      data: [
        { m: "a", v: 1e-9 },
        { m: "b", v: 500 },
      ],
    });
    const t = delta(s)![1]!;
    expect(t.length).toBeLessThan(40);
    expect(t).toMatch(/[KMBT]%/);
  });
  it("was: with x it is the value at the headline's period, without x it aggregates", () => {
    const data = base.data.map((r, i) => ({ ...r, ly: [50, 50, 50, 88][i]! }));
    const withX = svg({ ...base, was: "ly", titles: { ly: "Last year" }, data });
    expect(withX).toContain("+22 (+25%) vs Last year");
    const noX = svg({ type: "kpi", y: "v", was: "ly", data });
    expect(noX).toContain("(+59.7%) vs ly"); // 380 against 238
  });
  it("comparisons stack previous, was, target and drop from the bottom in a short box", () => {
    const data = base.data.map((r) => ({ ...r, ly: 70 }));
    const spec: ChartSpec = { ...base, was: "ly", colorBy: { target: 100 }, data };
    const tall = svg(spec, { height: 260 });
    const at = (t: string, s: string) => s.indexOf(t);
    expect(at("vs Mar", tall)).toBeLessThan(at("vs ly", tall));
    expect(at("vs ly", tall)).toBeLessThan(at("vs target", tall));
    const short = svg(spec, { height: 150 });
    expect(short).toContain('data-kpi="fill"');
    expect(short).not.toContain("vs target");
    expect(short).toContain('data-key="v"');
  });
  it("the bullet has no last-year tick; the comparison line states it", () => {
    const data = base.data.map((r) => ({ ...r, ly: 70 }));
    expect(svg({ ...base, was: "ly", colorBy: { target: 100 }, data })).not.toMatch(
      /<line stroke="var\(--maya-fg-muted\)" stroke-linecap/,
    );
  });
  it("bands are lightness steps, darkest at the bad zone, with a warn hairline", () => {
    const ops = (s: ChartSpec) =>
      [...svg(s).matchAll(/data-kpi="band"[^>]*fill-opacity="([\d.]+)"/g)].map((m) => +m[1]!);
    expect(ops({ ...base, colorBy: { target: 120, warn: 100 } })).toEqual([0.2, 0.12, 0.06]);
    expect(ops({ ...base, colorBy: { target: 100, warn: 120, better: "lower" } })).toEqual([
      0.06, 0.12, 0.2,
    ]);
    const s = svg({ ...base, colorBy: { target: 120, warn: 100 } });
    expect(s).toContain('fill="var(--maya-fg)"');
    expect(s).toMatch(/data-kpi="warn"/);
  });
  it("a percent measure states the move in points", () => {
    const p = svg({
      ...base,
      y: "w",
      format: "percent",
      data: base.data.map((r, i) => ({ ...r, w: [0.3, 0.32, 0.31, 0.34][i]! })),
    });
    expect(p).toContain("▲ +3 pts (+9.7%) vs Mar");
  });
  it("bullet wins in a short box", () => {
    const s = svg({ ...base, colorBy: { target: 100 } }, { height: 110 });
    expect(s).toContain('data-kpi="fill"');
    expect(s).not.toContain('data-maya="line"');
  });
  it("y array: one tile per measure with its own keys, format and goal", () => {
    const spec: ChartSpec = {
      ...base,
      y: ["v", "w"],
      format: { w: "percent" },
      titles: { w: "Churn" },
      colorBy: { v: { target: 100 }, w: { target: 0.05, better: "lower" } },
      data: base.data.map((r, i) => ({ ...r, w: [0.04, 0.05, 0.06, 0.07][i]! })),
    };
    const p = renderParts(spec, { width: 300, height: 220 });
    expect(p.controls).toBe("");
    expect(headline(p.svg)).toBeNull(); // no bare "v" key in a multi-measure tile
    const hv = p.svg.match(/<text [^>]*data-key="v~v"[^>]*>([^<]*)</)!;
    const hw = p.svg.match(/<text [^>]*data-key="v~w"[^>]*>([^<]*)</)!;
    expect(hv[0]).toContain('data-s="0"');
    expect(hw[0]).toContain('data-s="0"'); // one accent: colour means status
    expect(hw[0]).toContain('data-label="Churn"');
    expect(hv[0]).toContain('data-label="v"');
    expect(hv[1]).toBe("110");
    expect(hw[1]).toBe("7%");
    expect(p.svg).toContain('data-key="b~v"');
    expect(p.svg).toContain('data-key="l~w"');
    expect(p.svg).toContain('data-key="w~Apr"');
    expect(p.svg).toContain(">Churn<");
    // churn 7% against a 5% target where lower is better: off track; v is on track.
    expect(hw[0]).toContain('data-tone="bad"');
    expect(hv[0]).toContain('data-tone="good"');
    // Every mark of a tile names its measure, so the tooltip picks the right goal.
    const marks = p.svg.match(/<(?:circle|rect|text) [^>]*data-maya="mark"[^>]*>/g)!;
    expect(marks.length).toBeGreaterThan(8);
    for (const m of marks) expect(m).toMatch(/data-series="[vw]"/);
    expect(p.svg.match(/data-key="w~[A-Z]/g)).toHaveLength(4);
    for (const m of marks.filter((m) => /data-key="(?:w~|v~w|b~w)/.test(m)))
      expect(m).toContain('data-series="w"');
    // Contract: one table column per measure.
    expect(p.table).toContain("<th>v</th><th>Churn</th>");
  });
  it("tiles wrap into rows when narrow", () => {
    const spec: ChartSpec = {
      ...base,
      y: ["v", "w", "z", "u"],
      data: base.data.map((r) => ({ ...r, w: 1, z: 2, u: 3 })),
    };
    const ys = (s: string) =>
      [...s.matchAll(/data-key="v~\w"[^>]*font-size="[\d.]+" y="([\d.]+)"/g)].map((m) => m[1]);
    expect(new Set(ys(svg(spec, { width: 640 })))).toHaveProperty("size", 1); // one row of four
    expect(new Set(ys(svg(spec, { width: 300 })))).toHaveProperty("size", 2); // 2 x 2
  });
  it("multi tiles never overlap the status word with the headline, at any height", () => {
    const spec: ChartSpec = {
      ...base,
      y: ["v", "w", "z", "u"],
      colorBy: {
        v: { target: 100, warn: 90 },
        w: { target: 5 },
        z: { target: 5 },
        u: { target: 5 },
      },
      data: base.data.map((r) => ({ ...r, w: 1, z: 2, u: 3 })),
    };
    for (const height of [160, 200, 220]) {
      const s = svg(spec, { width: 360, height });
      const heads = [...s.matchAll(/data-key="v~\w"[^>]*font-size="([\d.]+)" y="([\d.]+)"/g)];
      expect(heads).toHaveLength(4);
      for (const h of heads) {
        expect(+h[1]!).toBeGreaterThanOrEqual(16);
        const y0 = +h[2]!;
        // the status word sharing this tile's column and row
        const st = [...s.matchAll(/data-kpi="status"[^>]*y="([\d.]+)"/g)].map((m) => +m[1]!);
        for (const y of st)
          if (y > y0 - 1 && y < y0 + 90) expect(y).toBeGreaterThanOrEqual(y0 + +h[1]!);
      }
    }
  });
  it("a one-row multi tile without a sparkline lifts the bullet under the comparisons", () => {
    const one: ChartSpec = {
      ...base,
      data: base.data.slice(0, 2),
      y: ["v", "w"],
      colorBy: { v: { target: 100 } },
    };
    const s = svg(
      { ...one, data: one.data.map((r) => ({ ...r, w: 1 })) },
      { width: 400, height: 220 },
    );
    const y = +s.match(/data-kpi="fill"[^>]*y="([\d.]+)"/)![1]!;
    expect(y).toBeLessThan(150);
  });
  it("the period caption clears the sparkline's last point", () => {
    const rising = svg({ ...base, data: base.data.map((r, i) => ({ ...r, v: i })) });
    const cap = +rising.match(/data-kpi="period"[^>]*y="([\d.]+)"/)![1]!;
    const dot = +rising.match(/data-last=""[^>]*cy="([\d.]+)"/)![1]!;
    expect(cap + 11).toBeLessThan(dot - 3);
  });
  it("all null shows no data", () => {
    const s = svg({ ...base, data: base.data.map((r) => ({ ...r, v: null })) });
    expect(s).toContain("No data");
  });
  it("is deterministic", () => {
    expect(svg(base)).toBe(svg(base));
    expect(render(base)).toBe(render(base));
  });
  it("escapes hostile strings in x", () => {
    const evil = '"><script>alert(1)</script>';
    const s = svg({ ...base, data: base.data.map((r, i) => (i === 3 ? { ...r, m: evil } : r)) });
    expect(s).not.toContain("<script>");
    expect(s).toContain("&lt;script&gt;");
  });
  it("validate: kpi without x passes, colorBy sign fails", () => {
    expect(() => renderParts({ type: "kpi", y: "v", data: base.data })).not.toThrow();
    expect(() => renderParts({ ...base, colorBy: "sign" })).toThrow(/option-unsupported|colorBy/);
  });
});

describe("kpi period caption", () => {
  it("is right-aligned over the sparkline's last point", () => {
    const t = svg(base).match(/<text[^>]*data-kpi="period"[^>]*>/)![0];
    expect(t).toContain('text-anchor="end"');
  });
});
