import { describe, expect, it } from "vitest";
import { registerTheme, render, renderParts, renderShell } from "../src/index.ts";
import "../src/radial.ts";
import "../src/weave.ts";
import "../src/geo.ts";
import { tw } from "../src/core/layout.ts";
import { shape } from "../src/core/shape.ts";
import { MayaSpecError, resolve, validateSpec } from "../src/core/validate.ts";
import type { ChartSpec } from "../src/core/types.ts";

const months = ["Jan", "Feb", "Mar"];
const simple: ChartSpec = {
  type: "bar",
  x: "m",
  y: "v",
  data: months.map((m, i) => ({ m, v: (i + 1) * 10 })),
};
const grouped: ChartSpec = {
  type: "bar",
  x: "m",
  y: "v",
  series: "r",
  title: "Revenue",
  data: months.flatMap((m, i) => ["N", "S"].map((r, j) => ({ m, r, v: (i + 1) * (j + 2) }))),
};
const stacked: ChartSpec = { ...grouped, stack: true };
const negative: ChartSpec = {
  type: "bar",
  x: "m",
  y: "v",
  data: [
    { m: "a", v: 5 },
    { m: "b", v: -3 },
  ],
};
const empty: ChartSpec = { type: "bar", x: "m", y: "v", data: [] };

// Snapshot gate: strip what T1a added, the milestone-1 bytes must be unchanged.
const strip = (s: string) =>
  s
    .replace(/ data-(y|x|plot|n|dir)="[^"]*"/g, "")
    .replace(/<g data-maya="(labels|cross)"><\/g>/g, "")
    .replace(/(<desc[^>]*>)[^<]*/, "$1");
const attr = (s: string, a: string) =>
  [...s.matchAll(new RegExp(` ${a}="([^"]*)"`, "g"))].map((m) => m[1]!);
const marks = (svg: string) =>
  [...svg.matchAll(/<rect data-maya="mark"[^>]*\/>/g)].map((m) => m[0]);

describe("snapshots", () => {
  it("simple", () =>
    expect(strip(renderParts(simple).svg)).toMatchInlineSnapshot(
      `"<svg class="maya-svg" viewBox="0 0 640 320" width="640" height="320" role="img" aria-label="v by m" aria-describedby="maya-d" tabindex="0"><desc id="maya-d"></desc><g data-maya="grid"><line x1="32.4" x2="628" y1="296" y2="296"/><line x1="32.4" x2="628" y1="200.67" y2="200.67"/><line x1="32.4" x2="628" y1="105.33" y2="105.33"/><line x1="32.4" x2="628" y1="10" y2="10"/></g><g data-maya="axis-y"><text x="26.4" y="296" text-anchor="end" dominant-baseline="middle">0</text><text x="26.4" y="200.67" text-anchor="end" dominant-baseline="middle">10</text><text x="26.4" y="105.33" text-anchor="end" dominant-baseline="middle">20</text><text x="26.4" y="10" text-anchor="end" dominant-baseline="middle">30</text></g><g data-maya="axis-x"><text x="131.67" y="312" text-anchor="middle" data-key="Jan">Jan</text><text x="330.2" y="312" text-anchor="middle" data-key="Feb">Feb</text><text x="528.73" y="312" text-anchor="middle" data-key="Mar">Mar</text></g><g data-maya="marks"><rect data-maya="mark" data-key="~Jan" data-c="0" data-s="0" data-series="" data-f="10" x="95.67" y="200.67" width="72" height="95.33"/><rect data-maya="mark" data-key="~Feb" data-c="1" data-s="0" data-series="" data-f="20" x="294.2" y="105.33" width="72" height="190.67"/><rect data-maya="mark" data-key="~Mar" data-c="2" data-s="0" data-series="" data-f="30" x="492.73" y="10" width="72" height="286"/></g><g data-maya="hits"></g></svg>"`,
    ));
  it("grouped", () =>
    expect(strip(renderParts(grouped).svg)).toMatchInlineSnapshot(
      `"<svg class="maya-svg" viewBox="0 0 640 320" width="640" height="320" role="img" aria-label="Revenue" aria-describedby="maya-d" tabindex="0"><desc id="maya-d"></desc><g data-maya="grid"><line x1="39.6" x2="628" y1="296" y2="296"/><line x1="39.6" x2="628" y1="224.5" y2="224.5"/><line x1="39.6" x2="628" y1="153" y2="153"/><line x1="39.6" x2="628" y1="81.5" y2="81.5"/><line x1="39.6" x2="628" y1="10" y2="10"/></g><g data-maya="axis-y"><text x="33.6" y="296" text-anchor="end" dominant-baseline="middle">0</text><text x="33.6" y="224.5" text-anchor="end" dominant-baseline="middle">2.5</text><text x="33.6" y="153" text-anchor="end" dominant-baseline="middle">5</text><text x="33.6" y="81.5" text-anchor="end" dominant-baseline="middle">7.5</text><text x="33.6" y="10" text-anchor="end" dominant-baseline="middle">10</text></g><g data-maya="axis-x"><text x="137.67" y="312" text-anchor="middle" data-key="Jan">Jan</text><text x="333.8" y="312" text-anchor="middle" data-key="Feb">Feb</text><text x="529.93" y="312" text-anchor="middle" data-key="Mar">Mar</text></g><g data-maya="marks"><rect data-maya="mark" data-key="N~Jan" data-c="0" data-s="0" data-series="N" data-f="2" x="60.38" y="238.8" width="72" height="57.2"/><rect data-maya="mark" data-key="S~Jan" data-c="0" data-s="1" data-series="S" data-f="3" x="142.96" y="210.2" width="72" height="85.8"/><rect data-maya="mark" data-key="N~Feb" data-c="1" data-s="0" data-series="N" data-f="4" x="256.51" y="181.6" width="72" height="114.4"/><rect data-maya="mark" data-key="S~Feb" data-c="1" data-s="1" data-series="S" data-f="6" x="339.09" y="124.4" width="72" height="171.6"/><rect data-maya="mark" data-key="N~Mar" data-c="2" data-s="0" data-series="N" data-f="6" x="452.64" y="124.4" width="72" height="171.6"/><rect data-maya="mark" data-key="S~Mar" data-c="2" data-s="1" data-series="S" data-f="9" x="535.22" y="38.6" width="72" height="257.4"/></g><g data-maya="hits"></g></svg>"`,
    ));
  it("stacked", () =>
    expect(strip(renderParts(stacked).svg)).toMatchInlineSnapshot(
      `"<svg class="maya-svg" viewBox="0 0 640 320" width="640" height="320" role="img" aria-label="Revenue" aria-describedby="maya-d" tabindex="0" data-stack=""><desc id="maya-d"></desc><g data-maya="grid"><line x1="32.4" x2="628" y1="296" y2="296"/><line x1="32.4" x2="628" y1="200.67" y2="200.67"/><line x1="32.4" x2="628" y1="105.33" y2="105.33"/><line x1="32.4" x2="628" y1="10" y2="10"/></g><g data-maya="axis-y"><text x="26.4" y="296" text-anchor="end" dominant-baseline="middle">0</text><text x="26.4" y="200.67" text-anchor="end" dominant-baseline="middle">5</text><text x="26.4" y="105.33" text-anchor="end" dominant-baseline="middle">10</text><text x="26.4" y="10" text-anchor="end" dominant-baseline="middle">15</text></g><g data-maya="axis-x"><text x="131.67" y="312" text-anchor="middle" data-key="Jan">Jan</text><text x="330.2" y="312" text-anchor="middle" data-key="Feb">Feb</text><text x="528.73" y="312" text-anchor="middle" data-key="Mar">Mar</text></g><g data-maya="marks"><rect data-maya="mark" data-key="N~Jan" data-c="0" data-s="0" data-series="N" data-f="2" x="95.67" y="257.87" width="72" height="38.13"/><rect data-maya="mark" data-key="S~Jan" data-c="0" data-s="1" data-series="S" data-f="3" x="95.67" y="200.67" width="72" height="57.2"/><rect data-maya="mark" data-key="N~Feb" data-c="1" data-s="0" data-series="N" data-f="4" x="294.2" y="219.73" width="72" height="76.27"/><rect data-maya="mark" data-key="S~Feb" data-c="1" data-s="1" data-series="S" data-f="6" x="294.2" y="105.33" width="72" height="114.4"/><rect data-maya="mark" data-key="N~Mar" data-c="2" data-s="0" data-series="N" data-f="6" x="492.73" y="181.6" width="72" height="114.4"/><rect data-maya="mark" data-key="S~Mar" data-c="2" data-s="1" data-series="S" data-f="9" x="492.73" y="10" width="72" height="171.6"/></g><g data-maya="hits"></g></svg>"`,
    ));
  it("negative", () =>
    expect(strip(renderParts(negative).svg)).toMatchInlineSnapshot(
      `"<svg class="maya-svg" viewBox="0 0 640 320" width="640" height="320" role="img" aria-label="v by m" aria-describedby="maya-d" tabindex="0"><desc id="maya-d"></desc><g data-maya="grid"><line x1="46.8" x2="628" y1="296" y2="296"/><line x1="46.8" x2="628" y1="224.5" y2="224.5"/><line x1="46.8" x2="628" y1="153" y2="153"/><line x1="46.8" x2="628" y1="81.5" y2="81.5"/><line x1="46.8" x2="628" y1="10" y2="10"/></g><g data-maya="axis-y"><text x="40.8" y="296" text-anchor="end" dominant-baseline="middle">-5</text><text x="40.8" y="224.5" text-anchor="end" dominant-baseline="middle">-2.5</text><text x="40.8" y="153" text-anchor="end" dominant-baseline="middle">0</text><text x="40.8" y="81.5" text-anchor="end" dominant-baseline="middle">2.5</text><text x="40.8" y="10" text-anchor="end" dominant-baseline="middle">5</text></g><g data-maya="axis-x"><text x="192.1" y="312" text-anchor="middle" data-key="a">a</text><text x="482.7" y="312" text-anchor="middle" data-key="b">b</text></g><g data-maya="marks"><rect data-maya="mark" data-key="~a" data-c="0" data-s="0" data-series="" data-f="5" x="156.1" y="10" width="72" height="143"/><rect data-maya="mark" data-key="~b" data-c="1" data-s="0" data-series="" data-f="-3" data-neg="" x="446.7" y="153" width="72" height="85.8"/></g><g data-maya="hits"></g></svg>"`,
    ));
  it("empty", () =>
    expect(strip(renderParts(empty).svg)).toMatchInlineSnapshot(
      `"<svg class="maya-svg" viewBox="0 0 640 320" width="640" height="320" role="img" aria-label="v by m" aria-describedby="maya-d" tabindex="0"><desc id="maya-d"></desc><text data-maya="empty" x="320" y="160" text-anchor="middle" dominant-baseline="middle">No data</text></svg>"`,
    ));
});

describe("render", () => {
  it("standalone", () => {
    const s = render(simple);
    expect(s.startsWith("<svg")).toBe(true);
    expect(s).toContain('class="maya-root');
    expect(s).not.toContain("tabindex");
    expect(renderParts(simple).svg).toContain('tabindex="0"');
  });
  it("deterministic", () => {
    expect(render(grouped)).toBe(render(grouped));
    expect(renderShell(grouped)).toBe(renderShell(grouped));
  });
  it("escapes hostile labels", () => {
    const bad = `<img src=x onerror=alert(1)>`;
    const q = `"quotes" & 'apos'`;
    const spec: ChartSpec = {
      type: "bar",
      x: "m",
      y: "v",
      series: "s",
      title: bad,
      data: [
        { m: bad, s: q, v: 1 },
        { m: q, s: bad, v: 2 },
      ],
    };
    const p = renderParts(spec);
    for (const html of [p.svg, p.legend, p.table, p.title, renderShell(spec)]) {
      expect(html).not.toContain("<img");
      expect(html).not.toContain(`"quotes"`);
    }
    expect(p.svg).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });
  it("data-key format and neg", () => {
    const svg = renderParts({
      ...negative,
      series: "s",
      data: [{ m: "a b", s: "x/y", v: -1 }],
    }).svg;
    expect(svg).toContain('data-key="x%2Fy~a%20b"');
    expect(svg).toContain("data-neg");
    expect(renderParts(negative).svg.match(/data-neg/g)).toHaveLength(1);
  });
  it("hit targets only for narrow/short bars", () => {
    const many: ChartSpec = {
      type: "bar",
      x: "m",
      y: "v",
      data: Array.from({ length: 60 }, (_, i) => ({ m: "c" + i, v: 100 + i })),
    };
    expect(renderParts(many).svg).toContain('data-maya="hit"');
    expect(renderParts(simple).svg).not.toContain('data-maya="hit"');
  });
  it("legend and hidden", () => {
    const p = renderParts(grouped, { view: { hidden: ["S"] } });
    expect(p.legend).toContain('data-si="0" data-s="0" data-key="N" aria-pressed="true"');
    expect(p.legend).toContain('data-si="1" data-s="1" data-key="S" aria-pressed="false"');
    expect(p.svg).not.toContain('data-series="S"');
    expect(renderParts(simple).legend).toBe("");
  });
  it("empty state, title, style", () => {
    expect(renderParts(empty).svg).toContain("No data");
    expect(renderParts(simple).title).toBe("");
    expect(renderParts(grouped).title).toBe('<div class="maya-title">Revenue</div>');
    const st = renderParts({
      ...simple,
      colors: ["red"],
      theme: { fontSize: "14px", tooltipBg: "#000" },
    }).style;
    expect(st).toBe("--maya-series-1:red;--maya-font-size:14px;--maya-tooltip-bg:#000;");
  });
  it("describe and table", () => {
    const p = renderParts(grouped);
    expect(p.svg).toContain("Bar chart of v by m, grouped by r (N, S). 6 values from 2 to 9.");
    expect(p.table).toContain("<caption>Revenue</caption>");
    expect(renderParts(stacked).svg).toContain("stacked by r");
  });
  it("shell", () => {
    const s = renderShell({ ...simple, title: "</script><b>" });
    expect(s).toContain('shadowrootmode="open"');
    const json = s.slice(s.indexOf('<script type="application/json">') + 32);
    expect(json.indexOf("</script")).toBe(json.length - "</script></maya-chart>".length);
    expect(JSON.parse(json.replace("</script></maya-chart>", "")).title).toBe("</script><b>");
  });
});

describe("horizontal and waterfall", () => {
  const h: ChartSpec = { ...simple, horizontal: true };
  it("swaps geometry and sets data-dir", () => {
    const v = renderParts(simple).svg;
    const z = renderParts(h).svg;
    expect(attr(z, "data-dir")).toEqual(["h"]);
    expect(v).not.toContain("data-dir");
    const [m1, m2] = marks(z).map((m) => ({
      x: +attr(m, "x")[0]!,
      y: +attr(m, "y")[0]!,
      w: +attr(m, "width")[0]!,
      hh: +attr(m, "height")[0]!,
    }));
    // categories run top to bottom, equal thickness, bars grow right in proportion to the value
    expect(m2!.y).toBeGreaterThan(m1!.y);
    expect(m1!.hh).toBeCloseTo(m2!.hh, 1);
    expect(m2!.w / m1!.w).toBeCloseTo(2, 1);
    expect(m1!.x).toBeCloseTo(m2!.x, 1);
    // category labels sit in the left axis, value ticks along the bottom
    const left = z.slice(z.indexOf('data-maya="axis-y"'), z.indexOf('data-maya="axis-x"'));
    expect(left).toContain(">Jan<");
    expect(z.slice(z.indexOf('data-maya="axis-x"'))).toContain(">10<");
    // grid is vertical (perpendicular to the value axis)
    expect(z).toMatch(/<g data-maya="grid"><line x1="([\d.]+)" x2="\1"/);
  });
  it("horizontal negative bars extend left of zero", () => {
    const z = renderParts({ ...negative, horizontal: true }).svg;
    const [a, b] = marks(z).map((m) => +attr(m, "x")[0]!);
    const wa = +attr(marks(z)[0]!, "width")[0]!;
    expect(b!).toBeLessThan(a! + wa);
  });
  const wf: ChartSpec = {
    type: "waterfall",
    x: "m",
    y: "v",
    totals: ["Q1"],
    data: [
      { m: "Start", v: 100 },
      { m: "Up", v: 30 },
      { m: "Down", v: -50 },
      { m: "Q1", v: 0 },
    ],
  };
  it("draws deltas on the running total with tone slots", () => {
    const ms = marks(renderParts(wf).svg);
    expect(ms.map((m) => attr(m, "data-s")[0])).toEqual(["0", "0", "1", "2"]);
    expect(ms.map((m) => attr(m, "data-y")[0])).toEqual(["100", "30", "-50", "80"]);
    const y = (i: number) => +attr(ms[i]!, "y")[0]!;
    const h = (i: number) => +attr(ms[i]!, "height")[0]!;
    expect(y(1) + h(1)).toBeCloseTo(y(0), 1); // Up starts at the previous top
    expect(y(2)).toBeCloseTo(y(1), 1); // Down starts at the new top (130)
    expect(y(3) + h(3)).toBeCloseTo(y(0) + h(0), 1); // total rests on the zero line
  });
  it("extent covers the running total, not just the deltas", () => {
    const labels = [
      ...renderParts(wf).svg.matchAll(/text-anchor="end" dominant-baseline="middle">([^<]*)</g),
    ].map((m) => +m[1]!.replace(/,/g, ""));
    expect(Math.max(...labels)).toBeGreaterThanOrEqual(130);
  });
});

describe("titles, labels, tone", () => {
  it("axis titles only when set", () => {
    const plain = renderParts(simple).svg;
    expect(plain).not.toContain("rotate(-90");
    const s = renderParts({ ...simple, titles: { v: "Revenue ($)", m: "Month" } });
    expect(s.svg).toContain("rotate(-90");
    expect(s.svg).toContain(">Revenue ($)<");
    expect(s.svg).toContain(">Month<");
    expect(s.table).toContain("<th>Month</th>");
    expect(s.svg).toContain("Bar chart of Revenue ($) by Month");
  });
  it("labels sit inside bars that fit and outside the ones that do not", () => {
    const svg = renderParts({ ...simple, labels: true }).svg;
    const g = svg.slice(svg.indexOf('data-maya="labels"'), svg.indexOf('data-maya="cross"'));
    expect([...g.matchAll(/>(\d+)</g)].map((m) => m[1])).toEqual(["10", "20", "30"]);
    expect(g).toContain('dominant-baseline="middle"'); // inside (centre)
    const thin = renderParts({
      type: "bar",
      x: "m",
      y: "v",
      labels: true,
      data: [
        { m: "a", v: 1 },
        { m: "b", v: 100 },
      ],
      yDomain: [0, 100],
    }).svg;
    expect(thin).toMatch(
      /<text x="[\d.]+" y="[\d.]+" text-anchor="middle" data-key="~a">1<\/text>/,
    ); // small bar: above
  });
  it("a colliding label is dropped, the earlier one stays", () => {
    const dense: ChartSpec = {
      type: "bar",
      x: "m",
      y: "v",
      labels: true,
      yDomain: [0, 200000],
      data: Array.from({ length: 40 }, (_, i) => ({ m: "c" + i, v: 123456 + i })),
    };
    const svg = renderParts(dense, { width: 300 }).svg;
    const g = svg.slice(svg.indexOf('data-maya="labels"'), svg.indexOf('data-maya="cross"'));
    const n = (g.match(/<text/g) ?? []).length;
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(40);
    expect(g.indexOf(">123,456<")).toBeGreaterThan(-1); // first in data order survives
  });
  it("sign and target tone, with tone words in the table", () => {
    const p = renderParts({ ...negative, colorBy: "sign" });
    expect(attr(p.svg, "data-tone")).toEqual(["good", "bad"]);
    expect(p.table).toContain("(Positive)");
    expect(p.table).toContain("(Negative)");
    expect(p.legend).toContain('data-maya="tone"');
    const t = renderParts({ ...simple, colorBy: { target: 20 } });
    expect(attr(t.svg, "data-tone")).toEqual(["bad", "good", "good"]);
    expect(t.table).toContain("(below target)");
    expect(renderParts(simple).svg).not.toContain("data-tone");
  });
  it("better lower flips the target tone and its words", () => {
    const p = renderParts({ ...simple, colorBy: { target: 20, better: "lower" } });
    expect(attr(p.svg, "data-tone")).toEqual(["good", "good", "bad"]);
    expect(p.table).toContain("10 (below target)");
    expect(p.table).toContain("30 (above target)");
    expect(p.legend).toMatch(
      /data-tone="good"><i><\/i>below target.*data-tone="bad"><i><\/i>above target/,
    );
    expect(p.legend).not.toContain("warn");
    // better alone (no target) steers nothing here: no tone, no tone legend
    const b = renderParts({ ...simple, type: "kpi", colorBy: { better: "lower" } });
    expect(attr(b.svg.replace(/<text[^>]*>/g, ""), "data-tone")).toEqual(["bad"]); // the delta arrow is kpi.ts's
  });
  it("warn: a third tone between target and bad, named at risk", () => {
    const k: ChartSpec = { ...simple, type: "kpi", colorBy: { target: 25, warn: 15 } };
    const p = renderParts(k, { width: 300, height: 220 });
    expect(attr((p.svg.match(/<circle[^>]*>/g) ?? []).join(""), "data-tone").slice(0, 3)).toEqual([
      "bad",
      "warn",
      "good",
    ]);
    expect(p.table).toContain("20 (at risk)");
    const low = renderParts(
      { ...k, colorBy: { target: 15, warn: 25, better: "lower" } },
      { width: 300, height: 220 },
    );
    expect(attr((low.svg.match(/<circle[^>]*>/g) ?? []).join(""), "data-tone").slice(0, 3)).toEqual(
      ["good", "warn", "bad"],
    );
  });
  it("kpi with a y array tones each measure by its own thresholds", () => {
    const p = renderParts({
      type: "kpi",
      x: "m",
      y: ["v", "w"],
      colorBy: { v: { target: 20 }, w: { target: 2, better: "lower" } },
      data: months.map((m, i) => ({ m, v: (i + 1) * 10, w: i + 1 })),
    });
    expect(p.table).toContain("<td>10 (below target)</td><td>1 (below target)</td>");
    expect(p.table).toContain("<td>30 (above target)</td><td>3 (above target)</td>");
  });
  it("numeric colorBy buckets 0..9 over the field extent", () => {
    const rows = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => ({ m: "c" + i, v: 1, c: i }));
    const p = renderParts({ type: "bar", x: "m", y: "v", colorBy: "c", data: rows });
    const q = attr(p.svg, "data-q");
    expect(q[0]).toBe("0");
    expect(q[10]).toBe("9");
    expect(q.every((v, i) => i === 0 || +v >= +q[i - 1]!)).toBe(true);
    expect(p.legend).toContain('data-maya="ramp"');
  });
});

describe("frame", () => {
  it("truncates long left labels at 40% of the width and keeps the full text in a title", () => {
    const long = "x".repeat(80);
    const z = renderParts(
      { type: "bar", x: "m", y: "v", horizontal: true, data: [{ m: long, v: 1 }] },
      { width: 400 },
    ).svg;
    const t = z.match(
      /text-anchor="end" dominant-baseline="middle" data-key="[^"]*">([^<]*)<title>/,
    );
    expect(t![1]!.endsWith("…")).toBe(true);
    expect(t![1]!.length * 7.2).toBeLessThanOrEqual(400 * 0.4);
    expect(z).toContain(`<title>${long}</title>`);
    const [px] = attr(z, "data-plot")[0]!.split(" ").map(Number);
    expect(px!).toBeLessThanOrEqual(400 * 0.4 + 12);
  });
  it("counts East-Asian wide characters as 1 em", () => {
    const wide = "漢".repeat(40);
    const z = renderParts(
      { type: "bar", x: "m", y: "v", horizontal: true, data: [{ m: wide, v: 1 }] },
      { width: 400 },
    ).svg;
    const t = z.match(/dominant-baseline="middle" data-key="[^"]*">([^<]*)<title>/)![1]!;
    expect([...t].length - 1).toBeLessThanOrEqual(Math.floor((400 * 0.4 - 8) / 12));
  });
  it("thins left labels at 14 px per step", () => {
    const many: ChartSpec = {
      type: "bar",
      x: "m",
      y: "v",
      horizontal: true,
      data: Array.from({ length: 60 }, (_, i) => ({ m: "c" + i, v: i + 1 })),
    };
    const z = renderParts(many).svg;
    const left = z.slice(z.indexOf('data-maya="axis-y"'), z.indexOf('data-maya="axis-x"'));
    const n = (left.match(/<text/g) ?? []).length;
    expect(n).toBeLessThan(60);
    expect(n).toBeGreaterThan(10);
  });
});

describe("limits and projection", () => {
  it("throws too-many-marks past MAX_MARKS, naming the rows and the limit", () => {
    // A waterfall keeps every step in order, so it cannot roll up or thin.
    const rows = Array.from({ length: 10001 }, (_, i) => ({ m: "c" + i, v: 1 }));
    const spec = { type: "waterfall", x: "m", y: "v", data: rows } as const;
    expect(() => render(spec)).toThrowError(/10001 marks exceed the limit of 10000 \(10001 rows\)/);
    try {
      render(spec);
    } catch (e) {
      expect((e as { code: string }).code).toBe("too-many-marks");
      expect((e as Error).message).toContain("spec.limit");
    }
    expect(() => render({ type: "bar", x: "m", y: "v", limit: 20, data: rows })).not.toThrow();
  });
  it("a bar past MAX_MARKS keeps the top N and rolls the rest into Other, with a warning", () => {
    const rows = Array.from({ length: 12000 }, (_, i) => ({ m: "c" + i, v: i === 777 ? 1e6 : 1 }));
    const p = renderParts({ type: "bar", x: "m", y: "v", data: rows }, { width: 640 });
    expect(p.warnings).toHaveLength(1);
    expect(p.warnings[0]).toMatch(/^bar: 12000 categories: the top 140 are drawn/);
    expect(p.svg).toContain('data-x="c777"');
    expect(p.svg).toContain('data-x="Other"');
    expect(p.svg.match(/data-maya="mark"/g)).toHaveLength(141);
    // Other is the sum of the rest: 11860 ones.
    expect(p.svg).toContain('data-y="11860"');
    // An explicit limit is the user's choice: no warning.
    expect(renderParts({ type: "bar", x: "m", y: "v", limit: 5, data: rows }).warnings).toEqual([]);
    expect(renderParts({ type: "bar", x: "m", y: "v", data: rows.slice(0, 50) }).warnings).toEqual(
      [],
    );
  });
  it("caps the a11y table at 1000 rows with a caption", () => {
    const rows = Array.from({ length: 1500 }, (_, i) => ({ m: "c" + i, v: i + 1 }));
    const p = renderParts({ type: "bar", x: "m", y: "v", limit: 1200, data: rows });
    expect((p.table.match(/<tr>/g) ?? []).length).toBe(1001);
    expect(p.table).toContain("<caption>First 1000 of 1201 rows</caption>");
    expect(renderParts(simple).table).toContain("<caption>v by m</caption>");
  });
  it("describe reduces over huge value sets", () => {
    const rows = Array.from({ length: 4000 }, (_, i) => ({ m: "c" + i, v: i }));
    expect(renderParts({ type: "bar", x: "m", y: "v", data: rows }).svg).toContain(
      "4000 values from 0 to 3,999",
    );
  });
  it("renderShell projects rows to referenced fields and keeps the nonce", () => {
    const spec: ChartSpec = {
      ...grouped,
      data: grouped.data.map((r) => ({ ...r, secret: "s3cr3t" })),
      titles: { v: "V" },
    };
    const sh = renderShell(spec, { nonce: "abc123" });
    expect(sh).not.toContain("s3cr3t");
    expect(sh).toContain('<style nonce="abc123">');
    expect(sh).toContain('"r":"N"');
    expect(
      renderParts({ ...simple, data: simple.data.map((r) => ({ ...r, secret: "s3cr3t" })) }).table,
    ).not.toContain("s3cr3t");
  });
  it("shell has the fixed slot order and a static live region", () => {
    const sh = renderShell(grouped);
    const at = (x: string) => sh.indexOf(x);
    const order = [
      'class="maya-title"',
      'class="maya-legend"',
      'class="maya-box"',
      'class="maya-sr" data-maya="live"',
      'class="maya-probe"',
      'class="maya-tip"',
    ].map(at);
    expect(order.every((n) => n > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(sh).toContain('data-maya="live" aria-live="polite"></div>');
  });
  it("object-form colors map to series slots via vars", () => {
    const p = renderParts({ ...grouped, colors: { S: "red" } });
    expect(p.vars).toEqual([["--maya-series-2", "red"]]);
  });
});

describe("axes attributes", () => {
  it("data-n for band types, data-plot always", () => {
    const svg = renderParts(simple).svg;
    expect(attr(svg, "data-n")).toEqual(["3"]);
    expect(attr(svg, "data-plot")[0]!.split(" ")).toHaveLength(4);
  });
});

describe("fixed yDomain ticks", () => {
  const yl = (d: [number, number]) => {
    const svg = renderParts({
      type: "line",
      x: "m",
      y: "v",
      yDomain: d,
      data: [
        { m: "a", v: 3 },
        { m: "b", v: 9 },
      ],
    } as ChartSpec).svg;
    return [...svg.match(/data-maya="axis-y"[\s\S]*?<\/g>/)![0].matchAll(/>(\d+)<\/text>/g)].map(
      (m) => m[1],
    );
  };
  it("labels the top end of a reversed domain", () => {
    expect(yl([15, 1])).toEqual(["1", "5", "10", "15"]);
  });
  it("does not duplicate an end that already has a tick", () => {
    expect(yl([0, 20])).toEqual(["0", "5", "10", "15", "20"]);
    expect(yl([20, 0])).toEqual(["0", "5", "10", "15", "20"]);
  });
});

describe("was (memory from a data column)", () => {
  const was: ChartSpec = {
    type: "bar",
    x: "m",
    y: "v",
    was: "last",
    titles: { last: "Last week" },
    data: months.map((m, i) => ({ m, v: (i + 1) * 10, last: 20 })),
  };
  const marks = (svg: string) => svg.match(/<g data-maya="marks">.*?<\/g>/)![0];

  it("draws a keyed ghost over each bar at the previous value, keyed in the legend", () => {
    const g = marks(render(was));
    const ghosts = [...g.matchAll(/<rect data-key="%00was~~(\w+)" data-past=""[^>]*>/g)];
    expect(ghosts.map((m) => m[1])).toEqual(months);
    // over: every ghost comes after the last bar, so a bar that grew cannot hide its ghost
    expect(g.indexOf("data-past")).toBeGreaterThan(g.lastIndexOf('data-maya="mark"'));
    expect(renderParts(was).legend).toBe(
      '<div class="maya-legend"><span data-past><i></i>Last week</span></div>',
    );
    expect(renderParts({ ...was, legend: false }).legend).toBe("");
    // same height for every ghost (all were 20), not hit-testable marks
    const h = ghosts.map((m) => /height="([\d.]+)"/.exec(m[0])![1]);
    expect(new Set(h).size).toBe(1);
    expect(g.match(/data-maya="mark"/g)).toHaveLength(3);
  });

  it("puts 'was' on the mark and its hit, a column in the table, the moves in the description", () => {
    const p = renderParts(was);
    expect(p.svg).toContain('data-was="was 20"');
    expect(p.table).toContain("<th>Last week</th>");
    expect(p.table).toMatch(/<td>10<\/td><td>20<\/td>/);
    // the 2 largest relative moves, ties in data order
    expect(p.svg).toContain("Since Last week: Jan -50%, Mar +50%.");
  });

  it("names the series in a move, skips null and zero baselines, and works horizontally", () => {
    const s: ChartSpec = {
      type: "bar",
      x: "m",
      y: "v",
      series: "r",
      was: "last",
      horizontal: true,
      data: [
        { m: "Jan", r: "N", v: 30, last: 10 },
        { m: "Jan", r: "S", v: 5, last: 0 },
        { m: "Feb", r: "N", v: 10, last: null },
        { m: "Feb", r: "S", v: 9, last: 10 },
      ],
    };
    const svg = render(s);
    expect(svg).toContain("Since last: Jan N +200%, Feb S -10%.");
    expect(marks(svg).match(/data-past/g)).toHaveLength(3); // the null baseline draws no ghost
    expect(svg).toContain('data-key="%00was~S~Jan"');
  });

  it("escapes the was title and stays deterministic", () => {
    const s = { ...was, titles: { last: '<img src=x onerror="1">' } };
    const a = render(s);
    expect(a).not.toContain("<img");
    expect(a).toBe(render(s));
  });

  it("is absent without was", () => {
    const svg = render(simple).replace(/<style>[^]*?<\/style>/, "");
    expect(svg).not.toContain("data-past");
    expect(svg).not.toContain("data-was");
  });

  it("keeps the was field in the shell's projected rows", () => {
    expect(renderShell(was)).toContain('"last":20');
  });
});

describe("units form control", () => {
  const u: ChartSpec = {
    type: "units",
    x: "g",
    y: "v",
    name: "id",
    data: [
      { id: "a", g: "X", v: 1 },
      { id: "b", g: "Y", v: 2 },
    ],
  };
  it("is a radiogroup of the forms, view.form checked", async () => {
    await import("../src/units.ts");
    const c = renderParts(u, { view: { form: 1 } }).controls;
    expect(c).toContain('data-maya="form"');
    expect(c).toContain('data-n="3" data-i="1"');
    expect([...c.matchAll(/aria-checked="(\w+)"[^>]*>(\w+)</g)].map((m) => m.slice(1))).toEqual([
      ["false", "Waffle"],
      ["true", "Bars"],
      ["false", "Swarm"],
    ]);
    expect(renderParts({ ...u, forms: ["swarm"] }).controls).toBe("");
    expect(renderParts({ ...u, text: { swarm: "Schwarm" } }).controls).toContain("Schwarm");
  });
});

describe("row-pass cache", () => {
  it("renders a shifted and pushed ring buffer and a replaced last row", () => {
    const d = [
      { c: "a", v: 1 },
      { c: "b", v: 2 },
      { c: "c", v: 3 },
    ];
    const spec = { type: "bar", x: "c", y: "v", data: d } as const;
    render(spec);
    d.shift();
    d.push({ c: "d", v: 9 });
    expect(render(spec)).toContain('data-x="d"');
    d[2] = { c: "e", v: 4 };
    expect(render(spec)).toContain('data-x="e"');
  });
});

describe("thinned x labels", () => {
  const long = "Northwest Territories and Greater Metropolitan Distribution Region ";
  const data = Array.from({ length: 40 }, (_, i) => ({ r: long + (i + 1), v: i + 1 }));
  it.each([600, 360])("stay inside the svg at width %i", (width) => {
    {
      const svg = render({ type: "bar", data, x: "r", y: "v" } as ChartSpec, {
        width,
        height: 300,
      }) as string;
      const g = svg.match(/data-maya="axis-x"[^]*?<\/g>/)![0];
      const ts = [...g.matchAll(/<text x="([\d.]+)"[^>]*>([^<]*)/g)];
      expect(ts.length).toBeGreaterThan(0);
      for (const [, x, t] of ts) {
        const half = tw(t!) / 2;
        expect(+x! - half).toBeGreaterThanOrEqual(0);
        expect(+x! + half).toBeLessThanOrEqual(width);
        expect(t!.endsWith("…")).toBe(true);
      }
    }
  });
});

describe("narrow bar labels", () => {
  const spec = (n: number, name = "Category"): ChartSpec => ({
    type: "bar",
    x: "m",
    y: "v",
    data: Array.from({ length: n }, (_, i) => ({ m: `${name}${i}`, v: i + 1 })),
  });
  const texts = (svg: string) =>
    [
      ...(/data-maya="axis-x">(.*?)<\/g>/.exec(svg)?.[1] ?? "").matchAll(/<text[^>]*>([^<]*)</g),
    ].map((m) => m[1]!);
  it("thins instead of cutting a label to a stub when a cut would keep under 3 characters", () => {
    const t = texts(render(spec(8), { width: 260 }));
    expect(t.length).toBeLessThan(8);
    for (const s of t) expect(s).not.toContain("…");
  });
  it("still cuts to the slot when 3 or more characters survive", () => {
    // (At 360 the thinned labels fit whole: the first is no longer clipped at the left edge.)
    expect(texts(render(spec(5, "Category number "), { width: 260 })).join()).toContain("…");
  });
  it("keeps the first thinned label whole on a stream with its value axis off", () => {
    const data = Array.from({ length: 36 }, (_, i) => ({
      m: Date.UTC(2025, Math.floor(i / 3), 1),
      v: 10 + i,
      f: "ABC"[i % 3],
    }));
    const svg = render(
      { type: "area", x: "m", y: "v", series: "f", stack: "stream", format: { m: "month" }, data },
      { width: 286, height: 300 },
    );
    expect(texts(svg)).toContain("Jan 2025");
  });
});

describe("constant huge values", () => {
  it("renders a scatter at x = y = 1e300 and a beeswarm with a 5e17 point", () => {
    const sc = [{ a: 1e300, b: 1e300 }];
    expect(render({ type: "scatter", x: "a", y: "b", data: sc })).toContain("<svg");
    const bs = [
      { r: "a", v: 1 },
      { r: "a", v: 5e17 },
    ];
    expect(render({ type: "beeswarm", x: "r", y: "v", data: bs })).toContain("<svg");
    expect(render({ type: "beeswarm", y: "v", data: [{ v: 5e17 }] })).toContain("<svg");
  });
});

describe("null category", () => {
  const data = [
    { m: "A", s: "u", v: 1 },
    { m: null, s: "u", v: 3 },
    { s: "u", v: 2 },
  ];
  it.each(["bar", "line", "ridgeline"] as const)("%s reads (blank), never null", (type) => {
    const p = renderParts({ type, x: "m", y: "v", series: "s", data } as ChartSpec);
    expect(p.svg).toContain('data-x="(blank)"');
    expect(p.table).toContain('<th scope="row">(blank)</th>');
    for (const h of [p.svg, p.table, p.legend]) expect(h).not.toMatch(/null|undefined/);
  });
  it("spec.text.blank overrides the label", () => {
    const svg = render({ type: "bar", x: "m", y: "v", data, text: { blank: "leer" } });
    expect(svg).toContain("leer");
    expect(svg).not.toContain("(blank)");
  });
  it("a time axis still drops null x rows", () => {
    const svg = render({
      type: "line",
      x: "d",
      y: "v",
      xType: "time",
      data: [
        { d: "2024-01-01", v: 1 },
        { d: null, v: 9 },
        { d: "2024-02-01", v: 2 },
      ],
    });
    expect(svg).not.toContain("(blank)");
  });
});

describe("#76 tokens, empty arrays, per-y aggregate", () => {
  const title = (spec: ChartSpec, view = {}) =>
    /<div class="maya-title">([^<]*)/.exec(renderParts(spec, { view }).title)?.[1];
  const two: ChartSpec = {
    type: "line",
    x: "m",
    y: "v",
    series: "yr",
    data: ["2024", "2025"].flatMap((yr, j) => months.map((m, i) => ({ m, yr, v: 10 + 5 * j + i }))),
  };

  it("no rows: a title or subtitle with a token is dropped, plain text stays", () => {
    const p = renderParts({
      type: "bar",
      x: "k",
      y: "v",
      title: "{max.x} leads with {max.y}",
      subtitle: "of {total:West}",
      data: [],
    });
    expect(p.title).toBe("");
    expect(p.svg).toContain('data-maya="empty"');
    expect(renderParts({ ...simple, title: "Sales {x}", data: [] }).title).toContain("Sales {x}");
  });

  it("scatter: max and min by y, first and last by x, .x the x value or the name", () => {
    const sc: ChartSpec = {
      type: "scatter",
      x: "u",
      y: "s",
      title: "{max.x}|{max.y}|{total}|{first.y}|{last.x}|{mean}",
      data: [
        { u: 3, s: 4 },
        { u: 1, s: 2 },
        { u: 2, s: 9 },
      ],
    };
    expect(title(sc)).toBe("2|9|15|2|3|5");
    const named = { ...sc, name: "n", title: "{max.x}", data: [{ u: 1, s: 2, n: "Ann" }] };
    expect(title(named)).toBe("Ann");
  });

  it("a series selector reads one series; without it max reads a point and total sums all", () => {
    expect(title({ ...two, title: "max {max.y} last {last.y} total {total}" })).toBe(
      "max 17 last 17 total 81",
    );
    expect(
      title({
        ...two,
        title: "{last.y:2024} {first.x:2025} {total:2025} {mean:2024} {max.y:1999}",
      }),
    ).toBe("12 Jan 48 11 {max.y:1999}");
    // A selector on a stack reads that series' segments, not the category totals.
    expect(title({ ...two, type: "bar", stack: true, title: "{max.y} {max.y:2024}" })).toBe(
      "29 12",
    );
  });

  it("[] is the same as unset for annotate, dash, rules and totals", () => {
    for (const k of ["annotate", "dash", "rules"])
      expect(() => render({ ...two, [k]: [] } as ChartSpec)).not.toThrow();
    expect(() => render({ ...simple, type: "heatmap", annotate: [], totals: [] })).not.toThrow();
    expect(() => render({ ...simple, dash: [] })).not.toThrow();
  });

  it("aggregate keyed by y field: the toggled measure uses its rule, others sum", () => {
    const rows = [
      { c: "A", gap: 1, s: 100, u: 4 },
      { c: "A", gap: 2, s: 50, u: 1 },
      { c: "B", gap: 3, s: 30, u: 3 },
    ];
    const spec: ChartSpec = {
      type: "bar",
      x: "c",
      y: ["gap", "price"],
      aggregate: { price: { ratio: ["s", "u"] } },
      title: "{max.x} {max.y}",
      data: rows,
    };
    expect(title(spec)).toBe("A 3");
    expect(title(spec, { measure: 1 })).toBe("A 30");
    expect(title({ ...spec, y: ["gap", "s"], aggregate: { gap: "mean" } })).toBe("B 3");
    // The issue's drill shape: a path with drill, measure toggled to the ratio.
    const { x: _x, ...rest } = spec;
    const drill: ChartSpec = { ...rest, path: ["c", "gap"], drill: true };
    expect(title(drill, { measure: 1, drill: ["A"] })).toBe("2 50");
    // The ratio fields reach the SSR JSON child.
    expect(renderShell(spec, { view: { measure: 1 } })).toContain('"u":4');
  });
});

describe("#86-#88 core contracts (M2)", () => {
  const d = ["Jan", "Feb", "Mar"].flatMap((m, i) =>
    ["A", "B"].map((s, j) => ({ m, s, g: j ? "G2" : "G1", v: (i + 1) * (j + 2), n: i + 1 })),
  );
  const vars = (spec: object) => new Map(renderParts(spec as ChartSpec).vars);

  it("a theme name and [name, overrides] become the same custom properties as tokens", () => {
    registerTheme("m2render", { accent: "#123456", numeric: "proportional", rampMidValue: 0 });
    const v = vars({ ...grouped, theme: ["m2render", { up: "#00aa00" }] });
    expect(v.get("--maya-accent")).toBe("#123456");
    expect(v.get("--maya-numeric")).toBe("proportional-nums");
    expect(v.get("--maya-ramp-mid-value")).toBe("0");
    expect(v.get("--maya-up")).toBe("#00aa00");
  });

  it('colorBy "sign" marks the svg and tone legend data-sign; a colors map key marks its slot data-mapped', () => {
    const p = renderParts({ ...negative, colorBy: "sign" });
    expect(p.svg).toMatch(/<svg[^>]* data-sign/);
    expect(p.legend).toContain('data-maya="tone" data-sign');
    const m = renderParts({ ...grouped, colors: { S: "#ff0000", Zed: "#000" } });
    expect(m.svg).toMatch(/<svg[^>]* data-mapped="1"/);
    expect(renderParts(grouped).svg).not.toContain("data-mapped");
  });

  it("emphasis series carry data-em on their legend button", () => {
    const p = renderParts({
      type: "line",
      x: "m",
      y: "v",
      series: "s",
      emphasis: ["B"],
      legend: true,
      data: d,
    } as ChartSpec);
    expect(p.legend).toMatch(/data-em[^>]*data-key="B"/);
    expect(p.legend).not.toMatch(/data-em[^>]*data-key="A"/);
  });

  it("a stream area draws no y title while its value axis is off; a plain stack keeps it", () => {
    const base: ChartSpec = {
      type: "area",
      x: "m",
      y: "v",
      series: "s",
      titles: { v: "Volume" },
      data: months.flatMap((m, i) => ["A", "B"].map((s, j) => ({ m, s, v: i + j + 1 }))),
    };
    expect(render({ ...base, stack: "stream" })).not.toContain(">Volume</text>");
    expect(render({ ...base, stack: "stream", yAxis: true })).toContain(">Volume</text>");
    expect(render({ ...base, stack: true })).toContain(">Volume</text>");
  });

  it("{ y2 } rules draw across the right axis and widen it", () => {
    const svg = render({
      ...simple,
      data: simple.data.map((r) => ({ ...r, u: 0.5 })),
      y2: "u",
      rules: [{ y2: 0.8, label: "Cap" }],
      format: { u: "percent" },
    });
    expect(svg).toMatch(/<line data-y2=""/);
    expect(svg).toContain("Cap 80%");
  });

  it("every new option validates and renders before the fan-out draws it", () => {
    const specs: object[] = [
      { type: "radial", x: "m", y: "v", series: "s", form: "line", dash: ["A"], data: d },
      { type: "area", x: "m", y: "v", series: "s", stack: "stream", data: d },
      {
        type: "weave",
        x: "m",
        y: "v",
        series: "s",
        colorBy: "g",
        tint: true,
        colors: { G1: "#f00" },
        data: d,
      },
      {
        type: "heatmap",
        x: "m",
        y: "v",
        series: "s",
        colorScale: "quantile",
        tooltip: { fields: ["n"] },
        was: "n",
        data: d,
      },
      { type: "parallel", x: "m", y: ["v", "n"], brush: true, data: d },
      { type: "line", x: "m", y: "v", series: "s", emphasis: ["B"], data: d },
      {
        type: "beeswarm",
        x: "s",
        y: "v",
        yScale: "log",
        size: "n",
        tooltip: { fields: ["g"] },
        rules: ["mean"],
        select: { peers: "g" },
        data: d,
      },
      {
        type: "dumbbell",
        x: "m",
        y: "v",
        series: "s",
        zero: false,
        sort: "change",
        tooltip: { fields: ["n"] },
        data: d,
      },
      { type: "ridgeline", x: "m", y: "v", series: "s", select: true, data: d },
      {
        type: "bar",
        path: ["g", "m"],
        y: "v",
        drill: true,
        tooltip: { fields: [{ field: "p", ratio: ["v", "n"] }] },
        data: d,
      },
    ];
    const view = { brush: [["v", 0, 4]] as const, peers: "G1" };
    for (const spec of specs) expect(() => renderShell(spec as ChartSpec, { view })).not.toThrow();
  });
});

describe("M1 design-critic follow-ups and SSR themes", () => {
  it("M3: an x-rule label that fits on neither side still draws (shorter, or clamped inside the plot)", () => {
    const data = [1e5, 3e5, 6e5, 1.2e6, 1.4e6].map((u, i) => ({ u, s: (i + 1) * 1e6 }));
    const spec = {
      type: "scatter",
      x: "u",
      y: "s",
      rules: [{ x: 1e6, label: "Median units" }],
      data,
    } as ChartSpec;
    const svg = render(spec, { width: 280, height: 300 });
    const g = /<g data-maya="rules">(.*?)<\/g>/.exec(svg)![1]!;
    expect(g).toMatch(/<text[^>]*>[^<]+<\/text>/);
    const x = +/<text x="([\d.]+)"/.exec(g)![1]!;
    const plot = /data-plot="([\d.]+) [\d.]+ ([\d.]+)/.exec(svg)!;
    expect(x).toBeGreaterThanOrEqual(+plot[1]! - 1);
  });

  it("M4: heatmap bands have no padding, cells sit 1 to 2 px apart", () => {
    const data = Array.from({ length: 15 * 5 }, (_, i) => ({
      c: `c${i % 15}`,
      r: `r${Math.floor(i / 15)}`,
      v: i,
    }));
    const svg = render({ type: "heatmap", x: "c", y: "v", series: "r", data } as ChartSpec, {
      width: 390,
      height: 360,
    });
    const xs = [...svg.matchAll(/data-hm="" [^>]*?x="([\d.]+)" y="[\d.]+" width="([\d.]+)"/g)]
      .slice(0, 2)
      .map((m) => [+m[1]!, +m[2]!] as const);
    expect(xs[1]![0] - (xs[0]![0] + xs[0]![1])).toBeLessThanOrEqual(2.01);
  });

  it("a theme name is resolved into the SSR JSON child", () => {
    registerTheme("m2ssr", { accent: "#abcdef" });
    const html = renderShell({ ...simple, theme: ["m2ssr", { radius: "0px" }] });
    expect(html).toContain('"theme":{"accent":"#abcdef","radius":"0px"}');
  });
});

describe("M3 contracts: measures, kpi and gauge (#82, #83)", () => {
  const rows = [
    { Scope: "YTD", Month: "2026-07", Sales: 1688, Units: 34, SalesLY: 1500, UnitsLY: 30 },
    { Scope: "YTD", Month: "2026-08", Sales: 1551, Units: 33, SalesLY: 1600, UnitsLY: 31 },
    { Scope: "All", Month: "2026-09", Sales: 1334, Units: 30, SalesLY: 1400, UnitsLY: 29 },
  ];
  const kpi: ChartSpec = {
    type: "kpi",
    x: "Month",
    y: ["Sales", "Units", "Price"],
    toggle: true,
    aggregate: { Price: { ratio: ["Sales", "Units"] } },
    yDomain: { Sales: [0, 2600] },
    colorBy: { Sales: { target: 2480, warn: 1520 } },
    data: rows,
  };
  const err = (spec: unknown): [string, string] => {
    try {
      validateSpec(spec);
    } catch (e) {
      if (e instanceof MayaSpecError) return [e.code, e.path];
      throw e;
    }
    return ["ok", ""];
  };

  it("#82.1 kpi toggle: one measure control, keyed yDomain and colorBy follow view.measure", () => {
    expect(err(kpi)).toEqual(["ok", ""]);
    const p = renderParts(kpi);
    expect(p.controls.match(/role="radio"/g)).toHaveLength(3);
    const s0 = resolve(kpi);
    expect([s0.toggle, s0.y, s0.yDomain, s0.colorBy]).toEqual([
      true,
      "Sales",
      [0, 2600],
      { target: 2480, warn: 1520, better: "higher" },
    ]);
    const s1 = resolve(kpi, { measure: 1 });
    expect([s1.y, s1.yDomain, s1.colorBy]).toEqual(["Units", null, null]);
    // Without toggle the tiles show together: no control, keyed aggregate refused.
    const { toggle: _, ...all } = kpi;
    expect(err(all)).toEqual(["option-unsupported", "aggregate"]);
    expect(
      err({ ...kpi, y: ["Sales", "Units"], toggle: undefined, aggregate: undefined }).at(0),
    ).toBe("ok");
    expect(err({ ...kpi, y: "Sales", aggregate: undefined, yDomain: undefined })).toEqual([
      "option-unsupported",
      "toggle",
    ]);
    expect(err({ ...kpi, yDomain: [0, 1] })).toEqual(["option-unsupported", "yDomain"]);
    expect(err({ ...kpi, yDomain: { Margin: [0, 1] } })).toEqual([
      "invalid-option",
      "yDomain.Margin",
    ]);
    expect(err({ ...kpi, yDomain: { Sales: [1, 1] } })).toEqual([
      "invalid-domain",
      "yDomain.Sales",
    ]);
    expect(err({ ...simple, yDomain: { v: [0, 1] } })).toEqual(["option-unsupported", "yDomain"]);
  });

  it("#82.2 kpi toggle: the ratio measure is sum(num) / sum(den) per category", () => {
    const s = resolve(kpi, { measure: 2 });
    expect(s.ratio).toEqual(["Sales", "Units"]);
    const v = shape(s).cells.map((c) => c.value);
    expect(v).toEqual(rows.map((r) => r.Sales / r.Units));
  });

  it("#82.1 gauge takes a y array only with toggle; colorBy and yDomain keyed by field", () => {
    const g: ChartSpec = { type: "gauge", y: ["Sales", "Units"], data: rows };
    expect(err(g)).toEqual(["invalid-option", "y"]);
    const t: ChartSpec = {
      ...g,
      toggle: true,
      yDomain: { Units: [0, 50] },
      colorBy: { Units: { target: 40 } },
    };
    expect(err(t)).toEqual(["ok", ""]);
    expect(renderParts(t).controls).toContain('role="radiogroup"');
    const s = resolve(t, { measure: 1 });
    expect([s.y, s.yDomain, s.colorBy]).toEqual([
      "Units",
      [0, 50],
      { target: 40, warn: null, better: "higher" },
    ]);
    expect(() => render(t, { view: { measure: 1 } })).not.toThrow();
  });

  it("#82.3 was keyed by y field follows the measure; was with series ghosts each bar", () => {
    const b: ChartSpec = {
      type: "bar",
      x: "Month",
      y: ["Sales", "Units"],
      was: { Sales: "SalesLY" },
      data: rows,
    };
    expect(err(b)).toEqual(["ok", ""]);
    expect(renderParts(b).svg).toContain("data-past");
    expect(renderParts(b, { view: { measure: 1 } }).svg).not.toContain("data-past");
    expect(resolve(b).wasOf).toEqual(new Map([["Sales", "SalesLY"]]));
    expect(err({ ...b, was: "SalesLY" })).toEqual(["option-unsupported", "was"]);
    expect(err({ ...b, y: "Sales" })).toEqual(["option-unsupported", "was"]);
    expect(err({ ...b, was: { Margin: "SalesLY" } })).toEqual(["invalid-option", "was.Margin"]);
    expect(err({ ...b, was: { Sales: "Nope" } })).toEqual(["unknown-field", "was.Sales"]);
    expect(err({ ...b, was: { Sales: "Scope" } })).toEqual(["non-numeric-field", "data[0].Scope"]);
    // A wide kpi: one was column per measure in the data table.
    const { toggle: _t, aggregate: _a, yDomain: _d, ...k } = kpi;
    const table = renderParts({ ...k, y: ["Sales", "Units"], was: { Units: "UnitsLY" } }).table;
    expect(table.match(/<th>[^<]*UnitsLY<\/th>/g)).toHaveLength(1);
    // Grouped bars: one ghost per bar.
    const g = render({
      type: "bar",
      x: "Region",
      series: "Family",
      y: "Share",
      was: "Average",
      data: [
        { Region: "South", Family: "Outerwear", Share: 0.383, Average: 0.374 },
        { Region: "South", Family: "Bottoms", Share: 0.21, Average: 0.22 },
      ],
    });
    expect(g.match(/<rect[^>]*data-past/g)).toHaveLength(2);
  });

  it("#82.4 kpi compare and frame", () => {
    expect(resolve(kpi).compare).toEqual(["previous", "was", "target"]);
    expect(resolve({ ...kpi, compare: [] }).compare).toEqual([]);
    expect(err({ ...kpi, compare: ["was", "was"] })).toEqual(["invalid-option", "compare"]);
    expect(err({ ...simple, compare: ["was"] })).toEqual(["option-unsupported", "compare"]);
    const f = renderParts({ ...kpi, frame: "Scope", title: "Sales" }, { view: { frame: 0 } });
    expect(f.title).toContain("Sales, YTD");
    expect(f.controls).toContain('data-maya="play"');
    expect(f.frame).toEqual([0, 2]);
  });

  it("#82.5 stack as an array of modes: a Layout control, view.stack picks one", () => {
    const st: ChartSpec = { ...stacked, stack: [true, "percent"] };
    expect(err(st)).toEqual(["ok", ""]);
    const p = renderParts(st);
    expect(p.controls).toContain('data-maya="stack"');
    expect(p.controls).toContain(">Stacked<");
    expect(p.controls).toContain(">Percent<");
    expect(p.svg).toContain('data-stack=""');
    const q = renderParts(st, { view: { stack: 1 } });
    expect(q.svg).toContain('data-stack="percent"');
    expect(q.controls).toContain('data-i="1"');
    expect(resolve(st, { stack: 1 }).format.get("v")).toBe("percent");
    expect(resolve(st).format.has("v")).toBe(false);
    expect(resolve({ ...st, stack: [] }).stack).toBe(false);
    expect(err({ ...st, stack: [true] })).toEqual(["invalid-option", "stack"]);
    expect(err({ ...st, stack: [true, true] })).toEqual(["invalid-option", "stack"]);
    expect(err({ ...st, stack: [true, "stream"] })).toEqual(["option-unsupported", "stack"]);
    expect(err({ ...st, was: "v" })).toEqual(["option-unsupported", "was"]);
  });

  it("#83.1 numberMotion and #83.4 select on kpi validate", () => {
    expect(err({ ...kpi, numberMotion: "roll", select: true })).toEqual(["ok", ""]);
    expect(err({ ...kpi, numberMotion: "spin" })).toEqual(["invalid-option", "numberMotion"]);
    expect(err({ ...simple, numberMotion: "roll" })).toEqual([
      "option-unsupported",
      "numberMotion",
    ]);
  });

  it("#83.2 kpi back: a flip button, view.face renders the back spec over the same rows", () => {
    const k: ChartSpec = {
      ...kpi,
      frame: "Scope",
      back: { type: "bar", x: "Month", y: "Units", horizontal: true, title: "Units" },
    };
    expect(err(k)).toEqual(["ok", ""]);
    const front = renderParts(k);
    expect(front.controls).toContain('data-maya="flip" aria-pressed="false">Details<');
    const back = renderParts(k, { view: { face: "back" } });
    expect(back.controls).toContain('aria-pressed="true"');
    expect(back.svg).toContain('data-dir="h"');
    // The frame applies: only the "All" frame's month is drawn.
    expect(back.svg.match(/<rect[^>]*data-maya="mark"/g)).toHaveLength(1);
    expect(renderShell(k)).toContain('"Units":34');
    expect(err({ ...k, back: { ...k.back!, data: [] } })).toEqual(["invalid-option", "back.data"]);
    expect(err({ ...k, back: { type: "kpi", y: "Sales" } })).toEqual([
      "invalid-option",
      "back.type",
    ]);
    expect(err({ ...k, back: { type: "bar", x: "Month", y: "Nope" } })).toEqual([
      "unknown-field",
      "back.y",
    ]);
    expect(() => render(k, { view: { face: "sideways" as "back" } })).toThrow(/view.face/);
  });

  it("#83.3 gauge arc and tooltip fields", () => {
    const g: ChartSpec = {
      type: "gauge",
      y: "Sales",
      arc: 360,
      tooltip: { fields: ["SalesLY"] },
      data: rows,
    };
    expect(err(g)).toEqual(["ok", ""]);
    const { arc: _arc, ...half } = g;
    expect([resolve(g).arc, resolve(half).arc]).toEqual([360, 180]);
    expect(err({ ...g, arc: 90 })).toEqual(["invalid-option", "arc"]);
    expect(err({ ...simple, arc: 360 })).toEqual(["option-unsupported", "arc"]);
    expect(err({ ...g, tooltip: { fields: ["Scope"] } })).toEqual([
      "non-numeric-field",
      "data[0].Scope",
    ]);
    expect(() => render(g)).not.toThrow();
  });
});
