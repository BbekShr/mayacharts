// @vitest-environment happy-dom
import { beforeAll, afterEach, describe, expect, it } from "vitest";
import { MayaChart } from "../src/element/maya-chart.ts";
import { branchOf } from "../src/element/drill.ts";
import { renderParts } from "../src/index.ts";
import "../src/flow.ts";
import type { ChartSpec } from "../src/core/types.ts";

beforeAll(() => {
  if (!customElements.get("maya-chart")) customElements.define("maya-chart", MayaChart);
});
afterEach(() => (document.body.innerHTML = ""));
const frame = () => new Promise((r) => setTimeout(r, 20));
const click = (e: Element) =>
  e.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true, detail: 1 }));
async function mount(s: ChartSpec): Promise<MayaChart> {
  const el = document.createElement("maya-chart") as MayaChart;
  el.spec = s;
  document.body.append(el);
  await frame();
  return el;
}

const heat = {
  type: "heatmap",
  x: "c",
  series: "s",
  y: "v",
  totals: true,
  data: [
    { c: "A", s: "r1", v: 1 },
    { c: "B", s: "r1", v: 2 },
    { c: "A", s: "r2", v: 3 },
    { c: "B", s: "r2", v: 4 },
  ],
} as ChartSpec;

describe("heatmap Total band", () => {
  it("is labelled Total in axis text, data table and description, never the sentinel", () => {
    const p = renderParts(heat, { width: 400, height: 300 });
    for (const out of [p.svg, p.table ?? ""]) expect(out).not.toContain("total\0");
    expect(p.svg).not.toMatch(/\0|u0000/);
    expect(p.svg).toContain(">Total<");
  });
  it("never drills from a column header or a Total row cell", async () => {
    const el = await mount({
      ...heat,
      drill: true,
      path: ["s"],
      xPath: ["c"],
    } as ChartSpec);
    const root = el.shadowRoot!;
    const t = [...root.querySelectorAll<SVGElement>("[data-maya=axis-x] text[data-key]")].find(
      (x) => decodeURIComponent(x.getAttribute("data-key")!).startsWith("\0"),
    );
    const before = JSON.stringify(el.view);
    if (t) click(t);
    for (const m of root.querySelectorAll<SVGElement>("[data-maya=mark][data-key]"))
      if (decodeURIComponent(m.getAttribute("data-key")!).includes("\0")) click(m);
    await frame();
    expect(JSON.stringify(el.view)).toBe(before);
  });
});

const rows = [
  { a: "S1", b: "T1", c: "U1", v: 3 },
  { a: "S1", b: "T2", c: "U2", v: 2 },
  { a: "S2", b: "T1", c: "U3", v: 4 },
];
describe("chord levels", () => {
  const chord = (path: string[], drilled?: string[]) =>
    renderParts(
      { type: "chord", y: "v", path, drill: true, data: rows } as ChartSpec,
      { width: 500, height: 400, ...(drilled && { view: { drill: drilled } }) } as never,
    ).svg;
  const keys = (svg: string) => [...svg.matchAll(/data-key="(n~[^"]+)"/g)].map((m) => m[1]);
  const dr = (svg: string) =>
    [...svg.matchAll(/<path[^>]*data-maya="mark"[^>]*>/g)]
      .filter((m) => /data-dr=""/.test(m[0]))
      .map((m) => m[0].match(/data-key="([^"]+)"/)![1]);
  it("2 levels: keys do not change when drilled, sources drill", () => {
    const root = chord(["a", "b"]);
    const kept = keys(chord(["a", "b"], ["S1"]));
    expect(kept.length).toBeGreaterThan(0);
    for (const k of kept) expect(keys(root)).toContain(k); // the same keys, so targets morph
    expect(dr(root).every((k) => k!.startsWith("n~0~"))).toBe(true);
    expect(dr(root).length).toBe(2);
    expect(branchOf("n~0~S1", 0, "chord", 2)).toBe("S1");
  });
  it("3 levels: targets drill at the root and re-key at level 2 when drilled", () => {
    const root = chord(["a", "b", "c"]);
    expect(dr(root).every((k) => k!.startsWith("n~1~"))).toBe(true);
    expect(dr(root).length).toBe(2);
    expect(keys(chord(["a", "b", "c"], ["T1"])).some((k) => k!.startsWith("n~2~"))).toBe(true);
    expect(dr(chord(["a", "b", "c"], ["T1"]))).toEqual([]);
    expect(branchOf("n~1~T1", 0, "chord", 3)).toBe("T1");
    expect(branchOf("n~0~S1", 0, "chord", 3)).toBeUndefined();
  });
});

describe("table expand rule", () => {
  it("draws a rule at the top of the open row's box", () => {
    const data = [
      { p: "A", m: "Jan", ch: 4 },
      { p: "B", m: "Jan", ch: 1 },
    ];
    const s = {
      type: "table",
      x: "p",
      y: ["ch"],
      expand: { type: "bar", x: "m", y: "ch" },
      data,
    } as ChartSpec;
    const open = renderParts(s, { width: 400, height: 300, view: { expanded: "A" } }).svg;
    const shut = renderParts(s, { width: 400, height: 300 }).svg;
    expect(open).toContain("data-rule");
    expect(shut).not.toContain("data-rule");
  });
});
