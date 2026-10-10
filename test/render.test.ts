import { describe, expect, it } from "vitest";
import { render, renderParts, renderShell } from "../src/index.ts";
import { tw } from "../src/core/layout.ts";
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
    expect(attr(b.svg.replace(/<text[^>]*>/g, ""), "data-tone")).toEqual([]); // the delta text is kpi.ts's
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
    expect(texts(render(spec(5, "Category number "), { width: 360 })).join()).toContain("…");
  });
});
