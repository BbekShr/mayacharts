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
        "<path data-maya="link" data-key="k~0~A~B" data-c="0" data-s="0" data-a="0 1 2" data-x="A → B" data-series="" data-y="2" data-f="2" d="M14 8C53.5 8 53.5 8 93 8L93 57.33C53.5 57.33 53.5 57.33 14 57.33Z"/>",
        "<path data-maya="link" data-key="k~1~B~C" data-c="1" data-s="0" data-a="1 0 2" data-x="B → C" data-series="" data-y="2" data-f="2" d="M107 8C146.5 8 146.5 8 186 8L186 57.33C146.5 57.33 146.5 57.33 107 57.33Z"/>",
        "<path data-maya="link" data-key="k~0~A~D" data-c="2" data-s="1" data-a="0 3 2" data-x="A → D" data-series="" data-y="1" data-f="1" d="M14 57.33C53.5 57.33 53.5 67.33 93 67.33L93 92C53.5 92 53.5 82 14 82Z"/>",
        "<path data-maya="link" data-key="k~1~D~C" data-c="3" data-s="1" data-a="3 0 2" data-x="D → C" data-series="" data-y="1" data-f="1" d="M107 67.33C146.5 67.33 146.5 57.33 186 57.33L186 82C146.5 82 146.5 92 107 92Z"/>",
        "<rect data-maya="mark" data-key="n~0~A" data-c="4" data-neu="0" data-n="0" data-a="0 1 2 3" data-x="A" data-series="" data-y="3" data-f="3" data-depth="0" x="0" y="8" width="14" height="74"/>",
        "<rect data-maya="mark" data-key="n~1~B" data-c="5" data-s="0" data-n="1" data-a="1 0 2" data-x="B" data-series="" data-y="2" data-f="2" data-depth="1" x="93" y="8" width="14" height="49.33"/>",
        "<rect data-maya="mark" data-key="n~2~C" data-c="6" data-neu="2" data-n="2" data-a="2 1 0 3" data-x="C" data-series="" data-y="3" data-f="3" data-depth="2" x="186" y="8" width="14" height="74"/>",
        "<rect data-maya="mark" data-key="n~1~D" data-c="7" data-s="1" data-n="3" data-a="3 0 2" data-x="D" data-series="" data-y="1" data-f="1" data-depth="1" x="93" y="67.33" width="14" height="24.67"/>",
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

  it("colours: column 0 neutral, column 1 palette slots, links take the level-1 colour", () => {
    const node = (name: string) => nodes.find((t) => at(t, "data-x") === name)!;
    for (const n of ["X", "Y"]) {
      expect(at(node(n), "data-s")).toBeUndefined();
      expect(at(node(n), "data-neu")).toMatch(/^[0-3]$/);
    }
    expect(at(node("X"), "data-neu")).toBe("0"); // the larger one is darker
    expect(at(node("Y"), "data-neu")).not.toBe("0");
    expect(at(node("M"), "data-s")).toBe("0");
    expect(at(node("N"), "data-s")).toBe("1");
    expect(at(node("P"), "data-s")).toBe("0"); // single level-1 ancestor
    expect(at(node("Q"), "data-neu")).toBe("2"); // M and N both feed it
    const link = (x: string) => links.find((l) => at(l, "data-x") === x)!;
    expect(at(link("X → M"), "data-s")).toBe("0"); // 0 to 1: the target's colour
    expect(at(link("Y → N"), "data-s")).toBe("1");
    expect(at(link("M → P"), "data-s")).toBe("0"); // deeper: the source's colour
    expect(at(link("N → Q"), "data-s")).toBe("1");
    for (const l of links) expect(l).not.toContain("data-g");
    expect(svg).not.toContain("linearGradient");
  });

  it("data-a lists every node on a path through a node or link", () => {
    const idx = (name: string) =>
      at(
        nodes.find((t) => at(t, "data-x") === name)!,
        "data-n",
      )!;
    const a = (t: string) => new Set(at(t, "data-a")!.split(" "));
    const mp = a(links.find((l) => at(l, "data-x") === "M → P")!);
    expect([...mp].sort()).toEqual([idx("X"), idx("Y"), idx("M"), idx("P")].sort());
    const x = a(nodes.find((t) => at(t, "data-x") === "X")!);
    expect([...x].sort()).toEqual([idx("X"), idx("M"), idx("P"), idx("Q")].sort());
    for (const l of links)
      for (const n of at(l, "data-a")!.split(" ")) expect(+n).toBeLessThan(nodes.length);
  });

  it("labels carry the formatted value and sit beside the columns on a wide tile", () => {
    const labels = svg.match(/<g data-maya="labels">(.*?)<\/g>/s)![1]!;
    expect(labels).toContain(">M<");
    expect(labels).toMatch(/data-v=""[^>]*>12</);
    const w = render(spec(rows), { width: 700, height: 300 });
    const first = /<text x="([\d.-]+)"[^>]*text-anchor="end"[^>]*data-nm=""[^>]*>X</.exec(w)!;
    expect(+first[1]!).toBeGreaterThan(0); // first column labelled to the left, inside the svg
    const bar = tags(w, "mark").find((t) => at(t, "data-x") === "X")!;
    expect(+first[1]!).toBeLessThan(+at(bar, "x")!);
  });

  it("orders a column to follow its sources (no crossing for a straight two-level flow)", () => {
    const s = render(
      spec(
        [
          { a: "Big", b: "Z", v: 9 },
          { a: "Small", b: "A", v: 1 },
        ],
        { path: ["a", "b"] },
      ),
      { width: 400, height: 200 },
    );
    const y = (n: string) =>
      +at(
        tags(s, "mark").find((t) => at(t, "data-x") === n)!,
        "y",
      )!;
    expect(y("Z")).toBeLessThan(y("A")); // Z follows Big, not alphabet or insertion order
  });
});
