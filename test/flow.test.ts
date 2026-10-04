import { describe, expect, it } from "vitest";
import { render } from "../src/index.ts";
import "../src/flow.ts";
import type { ChartSpec } from "../src/core/types.ts";

const spec = (data: Record<string, string | number>[], extra: object = {}): ChartSpec =>
  ({ type: "sankey", path: ["a", "b", "c"], y: "v", data, ...extra }) as ChartSpec;
const rows = [
  { a: "X", b: "M", c: "P", v: 6 },
  { a: "X", b: "M", c: "Q", v: 2 },
  { a: "Y", b: "M", c: "Q", v: 4 },
  { a: "Y", b: "N", c: "Q", v: 3 },
];
const tags = (svg: string, maya: string) =>
  [...svg.matchAll(/<(?:path|rect) [^>]*>/g)]
    .map((m) => m[0])
    .filter((t) => t.includes(`data-maya="${maya}"`));
const at = (t: string, a: string) => new RegExp(` ${a}="([^"]*)"`).exec(t)?.[1];

describe("sankey", () => {
  const svg = render(spec(rows));
  const links = tags(svg, "link");
  const nodes = tags(svg, "mark");

  it("conserves value through middle nodes", () => {
    for (const n of nodes.filter((t) => at(t, "data-depth") === "1")) {
      const name = at(n, "data-x")!;
      const sum = (f: (x: string) => boolean) =>
        links.filter((l) => f(at(l, "data-x")!)).reduce((a, l) => a + Number(at(l, "data-y")), 0);
      const inn = sum((x) => x.endsWith(" → " + name));
      expect(inn).toBe(Number(at(n, "data-y")));
    }
    expect(nodes.find((t) => at(t, "data-x") === "M")).toContain('data-y="12"');
  });

  it("sizes node heights proportionally", () => {
    const h = (name: string) =>
      Number(
        at(
          nodes.find((t) => at(t, "data-x") === name && at(t, "data-depth") === "1")!,
          "height",
        ),
      );
    expect(h("M") / h("N")).toBeCloseTo(12 / 3, 1);
  });

  it("draws links before nodes with unique keys", () => {
    expect(svg.indexOf('data-maya="link"')).toBeLessThan(svg.indexOf('data-maya="mark"'));
    const keys = [...links, ...nodes].map((t) => at(t, "data-key")!);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain("k~0~X~M");
    expect(keys).toContain("n~2~Q");
  });

  it("rejects fewer than 2 path levels", () => {
    expect(() => render(spec(rows, { path: ["a"] }))).toThrowError(
      expect.objectContaining({ code: "invalid-option" }),
    );
  });

  it("rejects non-positive values", () => {
    expect(() => render(spec([{ a: "X", b: "Y", c: "Z", v: 0 }]))).toThrowError(
      expect.objectContaining({ code: "non-positive-value" }),
    );
  });

  it("accepts __proto__ as a node name", () => {
    const s = render(spec([{ a: "__proto__", b: "constructor", c: "toString", v: 1 }]));
    expect(tags(s, "mark")).toHaveLength(3);
    expect(s).toContain("n~0~__proto__");
  });

  it("matches the 3-level snapshot", () => {
    const s = render(
      spec(
        [
          { a: "A", b: "B", c: "C", v: 2 },
          { a: "A", b: "D", c: "C", v: 1 },
        ],
        {},
      ),
      { width: 200, height: 100 },
    );
    expect([...tags(s, "link"), ...tags(s, "mark")]).toMatchInlineSnapshot(`
      [
        "<path data-maya="link" data-key="k~0~A~B" data-c="0" data-s="0" data-x="A → B" data-series="" data-y="2" data-f="2" d="M12 8C53 8 53 8 94 8L94 58.67C53 58.67 53 58.67 12 58.67Z"/>",
        "<path data-maya="link" data-key="k~1~B~C" data-c="1" data-s="1" data-x="B → C" data-series="" data-y="2" data-f="2" d="M106 8C147 8 147 8 188 8L188 58.67C147 58.67 147 58.67 106 58.67Z"/>",
        "<path data-maya="link" data-key="k~0~A~D" data-c="2" data-s="0" data-x="A → D" data-series="" data-y="1" data-f="1" d="M12 58.67C53 58.67 53 66.67 94 66.67L94 92C53 92 53 84 12 84Z"/>",
        "<path data-maya="link" data-key="k~1~D~C" data-c="3" data-s="3" data-x="D → C" data-series="" data-y="1" data-f="1" d="M106 66.67C147 66.67 147 58.67 188 58.67L188 84C147 84 147 92 106 92Z"/>",
        "<rect data-maya="mark" data-key="n~0~A" data-c="4" data-s="0" data-x="A" data-series="" data-y="3" data-f="3" data-depth="0" x="0" y="8" width="12" height="76"/>",
        "<rect data-maya="mark" data-key="n~1~B" data-c="5" data-s="1" data-x="B" data-series="" data-y="2" data-f="2" data-depth="1" x="94" y="8" width="12" height="50.67"/>",
        "<rect data-maya="mark" data-key="n~2~C" data-c="6" data-s="2" data-x="C" data-series="" data-y="3" data-f="3" data-depth="2" x="188" y="8" width="12" height="76"/>",
        "<rect data-maya="mark" data-key="n~1~D" data-c="7" data-s="3" data-x="D" data-series="" data-y="1" data-f="1" data-depth="1" x="94" y="66.67" width="12" height="25.33"/>",
      ]
    `);
  });
  it("keeps every node inside the plot with 15 nodes in 300 px", () => {
    const types = Array.from({ length: 15 }, (_, i) => `T${i}`);
    const data = ["N", "S", "E", "W", "C"].flatMap((a, j) =>
      types.map((b, i) => ({ a, b, v: 1 + ((i * 7 + j * 3) % 11) })),
    );
    const s = render(spec(data, { path: ["a", "b"] }), { width: 780, height: 300 });
    const ns = tags(s, "mark");
    expect(ns).toHaveLength(20);
    for (const n of ns) {
      const [y, h] = [+at(n, "y")!, +at(n, "height")!];
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y + h).toBeLessThanOrEqual(300);
    }
  });
  it("shrinks padding instead of collapsing with 60 nodes in 200 px", () => {
    const data = Array.from({ length: 60 }, (_, i) => ({ a: "X", b: `T${i}`, v: 1 }));
    const ns = tags(render(spec(data, { path: ["a", "b"] }), { width: 600, height: 200 }), "mark");
    for (const n of ns) {
      expect(+at(n, "height")!).toBeGreaterThan(0);
      expect(+at(n, "y")! + +at(n, "height")!).toBeLessThanOrEqual(200);
    }
  });
});
