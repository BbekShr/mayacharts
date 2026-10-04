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
        "<path data-maya="link" data-key="k~0~A~B" data-c="0" data-s="0" data-x="A → B" data-series="" data-y="2" data-f="2" d="M12 0C53 0 53 0 94 0L94 61.33C53 61.33 53 61.33 12 61.33Z"/>",
        "<path data-maya="link" data-key="k~1~B~C" data-c="1" data-s="1" data-x="B → C" data-series="" data-y="2" data-f="2" d="M106 0C147 0 147 0 188 0L188 61.33C147 61.33 147 61.33 106 61.33Z"/>",
        "<path data-maya="link" data-key="k~0~A~D" data-c="2" data-s="0" data-x="A → D" data-series="" data-y="1" data-f="1" d="M12 61.33C53 61.33 53 69.33 94 69.33L94 100C53 100 53 92 12 92Z"/>",
        "<path data-maya="link" data-key="k~1~D~C" data-c="3" data-s="3" data-x="D → C" data-series="" data-y="1" data-f="1" d="M106 69.33C147 69.33 147 61.33 188 61.33L188 92C147 92 147 100 106 100Z"/>",
        "<rect data-maya="mark" data-key="n~0~A" data-c="4" data-s="0" data-x="A" data-series="" data-y="3" data-f="3" data-depth="0" x="0" y="0" width="12" height="92"/>",
        "<rect data-maya="mark" data-key="n~1~B" data-c="5" data-s="1" data-x="B" data-series="" data-y="2" data-f="2" data-depth="1" x="94" y="0" width="12" height="61.33"/>",
        "<rect data-maya="mark" data-key="n~2~C" data-c="6" data-s="2" data-x="C" data-series="" data-y="3" data-f="3" data-depth="2" x="188" y="0" width="12" height="92"/>",
        "<rect data-maya="mark" data-key="n~1~D" data-c="7" data-s="3" data-x="D" data-series="" data-y="1" data-f="1" data-depth="1" x="94" y="69.33" width="12" height="30.67"/>",
      ]
    `);
  });
});
