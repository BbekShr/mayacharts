import { describe, expect, it } from "vitest";
import { render, renderParts, renderShell } from "../src/index.ts";
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

describe("snapshots", () => {
  it("simple", () =>
    expect(renderParts(simple).svg).toMatchInlineSnapshot(
      `"<svg class="maya-svg" viewBox="0 0 640 320" width="640" height="320" role="img" aria-labelledby="maya-t" aria-describedby="maya-d" tabindex="0" data-plot="32.4 10 595.6 286" data-n="3"><title id="maya-t">v by m</title><desc id="maya-d">Bar chart of v by m. 3 values from 10 to 30.</desc><g data-maya="grid"><line x1="32.4" x2="628" y1="296" y2="296"/><line x1="32.4" x2="628" y1="200.67" y2="200.67"/><line x1="32.4" x2="628" y1="105.33" y2="105.33"/><line x1="32.4" x2="628" y1="10" y2="10"/></g><g data-maya="axis-y"><text x="26.4" y="296" text-anchor="end" dominant-baseline="middle">0</text><text x="26.4" y="200.67" text-anchor="end" dominant-baseline="middle">10</text><text x="26.4" y="105.33" text-anchor="end" dominant-baseline="middle">20</text><text x="26.4" y="10" text-anchor="end" dominant-baseline="middle">30</text></g><g data-maya="axis-x"><text x="131.67" y="312" text-anchor="middle">Jan</text><text x="330.2" y="312" text-anchor="middle">Feb</text><text x="528.73" y="312" text-anchor="middle">Mar</text></g><g data-maya="marks"><rect data-maya="mark" data-key="~Jan" data-c="0" data-s="0" data-x="Jan" data-series="" data-f="10" data-y="10" x="52.25" y="200.67" width="158.83" height="95.33"/><rect data-maya="mark" data-key="~Feb" data-c="1" data-s="0" data-x="Feb" data-series="" data-f="20" data-y="20" x="250.79" y="105.33" width="158.83" height="190.67"/><rect data-maya="mark" data-key="~Mar" data-c="2" data-s="0" data-x="Mar" data-series="" data-f="30" data-y="30" x="449.32" y="10" width="158.83" height="286"/></g><g data-maya="labels"></g><g data-maya="cross"></g><g data-maya="hits"></g></svg>"`,
    ));
  it("grouped", () =>
    expect(renderParts(grouped).svg).toMatchInlineSnapshot(
      `"<svg class="maya-svg" viewBox="0 0 640 320" width="640" height="320" role="img" aria-labelledby="maya-t" aria-describedby="maya-d" tabindex="0" data-plot="39.6 10 588.4 286" data-n="3"><title id="maya-t">Revenue</title><desc id="maya-d">Bar chart of v by m, grouped by r (N, S). 6 values from 2 to 9.</desc><g data-maya="grid"><line x1="39.6" x2="628" y1="296" y2="296"/><line x1="39.6" x2="628" y1="224.5" y2="224.5"/><line x1="39.6" x2="628" y1="153" y2="153"/><line x1="39.6" x2="628" y1="81.5" y2="81.5"/><line x1="39.6" x2="628" y1="10" y2="10"/></g><g data-maya="axis-y"><text x="33.6" y="296" text-anchor="end" dominant-baseline="middle">0</text><text x="33.6" y="224.5" text-anchor="end" dominant-baseline="middle">2.5</text><text x="33.6" y="153" text-anchor="end" dominant-baseline="middle">5</text><text x="33.6" y="81.5" text-anchor="end" dominant-baseline="middle">7.5</text><text x="33.6" y="10" text-anchor="end" dominant-baseline="middle">10</text></g><g data-maya="axis-x"><text x="137.67" y="312" text-anchor="middle">Jan</text><text x="333.8" y="312" text-anchor="middle">Feb</text><text x="529.93" y="312" text-anchor="middle">Mar</text></g><g data-maya="marks"><rect data-maya="mark" data-key="N~Jan" data-c="0" data-s="0" data-x="Jan" data-series="N" data-f="2" data-y="2" x="59.21" y="238.8" width="74.32" height="57.2"/><rect data-maya="mark" data-key="S~Jan" data-c="0" data-s="1" data-x="Jan" data-series="S" data-f="3" data-y="3" x="141.8" y="210.2" width="74.32" height="85.8"/><rect data-maya="mark" data-key="N~Feb" data-c="1" data-s="0" data-x="Feb" data-series="N" data-f="4" data-y="4" x="255.35" y="181.6" width="74.32" height="114.4"/><rect data-maya="mark" data-key="S~Feb" data-c="1" data-s="1" data-x="Feb" data-series="S" data-f="6" data-y="6" x="337.93" y="124.4" width="74.32" height="171.6"/><rect data-maya="mark" data-key="N~Mar" data-c="2" data-s="0" data-x="Mar" data-series="N" data-f="6" data-y="6" x="451.48" y="124.4" width="74.32" height="171.6"/><rect data-maya="mark" data-key="S~Mar" data-c="2" data-s="1" data-x="Mar" data-series="S" data-f="9" data-y="9" x="534.06" y="38.6" width="74.32" height="257.4"/></g><g data-maya="labels"></g><g data-maya="cross"></g><g data-maya="hits"></g></svg>"`,
    ));
  it("stacked", () =>
    expect(renderParts(stacked).svg).toMatchInlineSnapshot(
      `"<svg class="maya-svg" viewBox="0 0 640 320" width="640" height="320" role="img" aria-labelledby="maya-t" aria-describedby="maya-d" tabindex="0" data-plot="32.4 10 595.6 286" data-n="3"><title id="maya-t">Revenue</title><desc id="maya-d">Bar chart of v by m, stacked by r (N, S). 6 values from 2 to 9.</desc><g data-maya="grid"><line x1="32.4" x2="628" y1="296" y2="296"/><line x1="32.4" x2="628" y1="200.67" y2="200.67"/><line x1="32.4" x2="628" y1="105.33" y2="105.33"/><line x1="32.4" x2="628" y1="10" y2="10"/></g><g data-maya="axis-y"><text x="26.4" y="296" text-anchor="end" dominant-baseline="middle">0</text><text x="26.4" y="200.67" text-anchor="end" dominant-baseline="middle">5</text><text x="26.4" y="105.33" text-anchor="end" dominant-baseline="middle">10</text><text x="26.4" y="10" text-anchor="end" dominant-baseline="middle">15</text></g><g data-maya="axis-x"><text x="131.67" y="312" text-anchor="middle">Jan</text><text x="330.2" y="312" text-anchor="middle">Feb</text><text x="528.73" y="312" text-anchor="middle">Mar</text></g><g data-maya="marks"><rect data-maya="mark" data-key="N~Jan" data-c="0" data-s="0" data-x="Jan" data-series="N" data-f="2" data-y="2" x="52.25" y="257.87" width="158.83" height="38.13"/><rect data-maya="mark" data-key="S~Jan" data-c="0" data-s="1" data-x="Jan" data-series="S" data-f="3" data-y="3" x="52.25" y="200.67" width="158.83" height="57.2"/><rect data-maya="mark" data-key="N~Feb" data-c="1" data-s="0" data-x="Feb" data-series="N" data-f="4" data-y="4" x="250.79" y="219.73" width="158.83" height="76.27"/><rect data-maya="mark" data-key="S~Feb" data-c="1" data-s="1" data-x="Feb" data-series="S" data-f="6" data-y="6" x="250.79" y="105.33" width="158.83" height="114.4"/><rect data-maya="mark" data-key="N~Mar" data-c="2" data-s="0" data-x="Mar" data-series="N" data-f="6" data-y="6" x="449.32" y="181.6" width="158.83" height="114.4"/><rect data-maya="mark" data-key="S~Mar" data-c="2" data-s="1" data-x="Mar" data-series="S" data-f="9" data-y="9" x="449.32" y="10" width="158.83" height="171.6"/></g><g data-maya="labels"></g><g data-maya="cross"></g><g data-maya="hits"></g></svg>"`,
    ));
  it("negative", () =>
    expect(renderParts(negative).svg).toMatchInlineSnapshot(
      `"<svg class="maya-svg" viewBox="0 0 640 320" width="640" height="320" role="img" aria-labelledby="maya-t" aria-describedby="maya-d" tabindex="0" data-plot="46.8 10 581.2 286" data-n="2"><title id="maya-t">v by m</title><desc id="maya-d">Bar chart of v by m. 2 values from -3 to 5.</desc><g data-maya="grid"><line x1="46.8" x2="628" y1="296" y2="296"/><line x1="46.8" x2="628" y1="224.5" y2="224.5"/><line x1="46.8" x2="628" y1="153" y2="153"/><line x1="46.8" x2="628" y1="81.5" y2="81.5"/><line x1="46.8" x2="628" y1="10" y2="10"/></g><g data-maya="axis-y"><text x="40.8" y="296" text-anchor="end" dominant-baseline="middle">-5</text><text x="40.8" y="224.5" text-anchor="end" dominant-baseline="middle">-2.5</text><text x="40.8" y="153" text-anchor="end" dominant-baseline="middle">0</text><text x="40.8" y="81.5" text-anchor="end" dominant-baseline="middle">2.5</text><text x="40.8" y="10" text-anchor="end" dominant-baseline="middle">5</text></g><g data-maya="axis-x"><text x="192.1" y="312" text-anchor="middle">a</text><text x="482.7" y="312" text-anchor="middle">b</text></g><g data-maya="marks"><rect data-maya="mark" data-key="~a" data-c="0" data-s="0" data-x="a" data-series="" data-f="5" data-y="5" x="75.86" y="10" width="232.48" height="143"/><rect data-maya="mark" data-key="~b" data-c="1" data-s="0" data-x="b" data-series="" data-f="-3" data-y="-3" data-neg="" x="366.46" y="153" width="232.48" height="85.8"/></g><g data-maya="labels"></g><g data-maya="cross"></g><g data-maya="hits"></g></svg>"`,
    ));
  it("empty", () =>
    expect(renderParts(empty).svg).toMatchInlineSnapshot(
      `"<svg class="maya-svg" viewBox="0 0 640 320" width="640" height="320" role="img" aria-labelledby="maya-t" aria-describedby="maya-d" tabindex="0" data-plot="46.8 10 581.2 286" data-n="0"><title id="maya-t">v by m</title><desc id="maya-d">Bar chart of v by m. No data.</desc><text data-maya="empty" x="320" y="160" text-anchor="middle" dominant-baseline="middle">No data</text></svg>"`,
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
  it("line/area not implemented", () => {
    expect(() => render({ ...simple, type: "line" })).toThrow(
      '"line" charts are not implemented yet',
    );
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
    expect(p.legend).toContain('data-si="0" data-s="0" aria-pressed="true"');
    expect(p.legend).toContain('data-si="1" data-s="1" aria-pressed="false"');
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
