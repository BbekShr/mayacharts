import { describe, expect, it } from "vitest";
import { renderParts } from "../src/index.ts";
import type { ChartSpec } from "../src/core/types.ts";

const cats = ["A", "B", "C"];
const data = cats.flatMap((c, i) => [
  { c, p: "2020", v: 10 + i },
  { c, p: "2024", v: i === 1 ? 5 : 30 + i },
]);
const spec: ChartSpec = { type: "dumbbell", x: "c", y: "v", series: "p", data };
const svg = (s: ChartSpec, view?: { hidden: string[] }) =>
  renderParts(s, view ? { view: { hidden: view.hidden } } : {}).svg;
const tags = (s: string, re: string) =>
  [...s.matchAll(new RegExp(`<${re}[^>]*>`, "g"))].map((m) => m[0]);
const dots = (s: string) => tags(s, 'circle data-maya="mark"');
const links = (s: string) => tags(s, 'line data-maya="link"');

describe("dumbbell", () => {
  it("two dots and one connector per category", () => {
    const s = svg(spec);
    expect(dots(s)).toHaveLength(6);
    expect(links(s)).toHaveLength(3);
    expect(links(s)[0]).toContain('data-key="k~A"');
    expect(dots(s)[0]).toContain('data-key="2020~A"');
    expect(dots(s)[1]).toContain('data-s="1"');
  });
  it("marks group holds only keyed children, connectors first", () => {
    const g = svg(spec).match(/<g data-maya="marks">(.*?)<\/g>/s)![1]!;
    const all = [...g.matchAll(/<(\w+) /g)].map((m) => m[1]);
    expect(all.indexOf("circle")).toBeGreaterThan(all.lastIndexOf("line"));
    expect(g.match(/<\w+ /g)!.length).toBe(g.match(/data-key=/g)!.length);
  });
  it("a category with one value draws one dot and no connector", () => {
    const s = svg({ ...spec, data: data.filter((r) => !(r.c === "C" && r.p === "2024")) });
    expect(dots(s)).toHaveLength(5);
    expect(links(s)).toHaveLength(2);
  });
  it("horizontal puts categories on the left", () => {
    const v = links(svg(spec))[0]!;
    const h = links(svg({ ...spec, horizontal: true }))[0]!;
    expect(v.match(/x1="([^"]*)" y1="[^"]*" x2="([^"]*)"/)!.slice(1)[0]).toBe(
      v.match(/x2="([^"]*)"/)![1],
    );
    expect(h.match(/y1="([^"]*)"/)![1]).toBe(h.match(/y2="([^"]*)"/)![1]);
    expect(svg({ ...spec, horizontal: true })).toContain('data-dir="h"');
  });
  it("hidden series hides its dots and the connectors", () => {
    const s = svg(spec, { hidden: ["2024"] });
    expect(dots(s)).toHaveLength(3);
    expect(links(s)).toHaveLength(0);
  });
  it("labels both dots", () => {
    const s = svg({ ...spec, labels: true });
    expect(
      s.match(/<g data-maya="labels">(.*?)<\/g>/s)![1]!.match(/<text/g)!.length,
    ).toBeGreaterThanOrEqual(3);
  });
  it("colorBy sign tones the connector by to minus from", () => {
    const s = svg({ ...spec, colorBy: "sign" });
    expect(links(s).map((l) => l.match(/data-tone="(\w+)"/)![1])).toEqual(["good", "bad", "good"]);
    expect(dots(s).join("")).not.toContain("data-tone");
  });
  it("validates series", () => {
    const { series: _s, ...rest } = spec;
    expect(() => renderParts(rest as ChartSpec)).toThrowError(/series/);
    const three = [...data, { c: "A", p: "2030", v: 1 }];
    expect(() => renderParts({ ...spec, data: three })).toThrowError(/exactly 2/);
  });
  it("is deterministic and escapes hostile strings", () => {
    expect(svg(spec)).toBe(svg(spec));
    const evil = '"><script>x</script>';
    const s = svg({
      ...spec,
      data: data.map((r) => ({
        ...r,
        c: r.c === "A" ? evil : r.c,
        p: r.p === "2020" ? evil + "2" : r.p,
      })),
    });
    expect(s).not.toContain("<script>");
  });
});

describe("dumbbell drill", () => {
  const data = [
    { region: "West", state: "CA", year: "2024", v: 5 },
    { region: "West", state: "OR", year: "2024", v: 2 },
    { region: "West", state: "CA", year: "2025", v: 3 },
    { region: "West", state: "OR", year: "2025", v: 4 },
    { region: "East", state: "NY", year: "2024", v: 6 },
    { region: "East", state: "NY", year: "2025", v: 7 },
  ];
  const spec = {
    type: "dumbbell",
    data,
    path: ["region", "state"],
    drill: true,
    y: "v",
    series: "year",
  } as const;
  it("draws the outer level, then the drilled branch", () => {
    const top = renderParts(spec as never).svg;
    expect(top).toContain('data-x="West"');
    expect(top).not.toContain('data-x="CA"');
    const down = renderParts(spec as never, { view: { drill: ["West"] } });
    expect(down.svg).toContain('data-x="CA"');
    expect(down.svg).not.toContain('data-x="NY"');
    expect(down.crumbs).toContain("West");
  });
});

describe("dumbbell yDomain narrower than the data", () => {
  const d = [
    { c: "a", s: "p", v: 30 },
    { c: "a", s: "q", v: 2 },
    { c: "b", s: "p", v: -3 },
    { c: "b", s: "q", v: 4 },
  ];
  for (const horizontal of [false, true])
    it(`pins dots and connectors inside the plot (${horizontal ? "horizontal" : "vertical"})`, () => {
      const s = svg({
        type: "dumbbell",
        x: "c",
        y: "v",
        series: "s",
        yDomain: [0, 5],
        horizontal,
        data: d,
      });
      const [x, y, w, h] = s
        .match(/data-plot="([^"]+)"/)![1]!
        .split(" ")
        .map(Number) as [number, number, number, number];
      const [a, b] = horizontal ? [x, x + w] : [y, y + h];
      const attrs = horizontal ? ["cx", "x1", "x2"] : ["cy", "y1", "y2"];
      const vals = [...dots(s), ...links(s)].flatMap((t) =>
        attrs.flatMap((k) =>
          [...t.matchAll(new RegExp(` ${k}="([^"]+)"`, "g"))].map((m) => +m[1]!),
        ),
      );
      expect(vals.length).toBe(8);
      for (const v of vals) {
        expect(v).toBeGreaterThanOrEqual(a - 0.1);
        expect(v).toBeLessThanOrEqual(b + 0.1);
      }
      expect(s).toContain('data-y="30"');
    });
  it("series + colorBy sign tones the connector good when the second value is higher, bad when lower (#93.2)", () => {
    const rows = [
      { Store: "A", Year: "2025", Sales: 10 },
      { Store: "A", Year: "2026", Sales: 15 },
      { Store: "B", Year: "2025", Sales: 12 },
      { Store: "B", Year: "2026", Sales: 7 },
    ];
    const s = svg({
      type: "dumbbell",
      x: "Store",
      series: "Year",
      y: "Sales",
      colorBy: "sign",
      data: rows,
    });
    expect(links(s).map((l) => l.match(/data-tone="(\w+)"/)![1])).toEqual(["good", "bad"]);
  });
});

describe("dumbbell M2", () => {
  const big = cats.flatMap((c, i) => [
    { c, p: "2020", v: 1000 + i * 10 },
    { c, p: "2024", v: 1020 + i * 10 },
  ]);
  const ys = (s: string) => dots(s).map((d) => +/ cy="([\d.]+)"/.exec(d)![1]!);
  it("zero: false fits the axis to the values, so a small gap is visible", () => {
    const gap = (z: boolean) => {
      const [a, b] = ys(svg({ ...spec, data: big, zero: z }));
      return Math.abs(a! - b!);
    };
    expect(gap(false)).toBeGreaterThan(40);
    expect(gap(true)).toBeLessThan(5);
  });
  it("zero: false refits at each drill level", () => {
    const rows = [
      ...["N", "S"].flatMap((st) =>
        ["Q1", "Q2"].flatMap((q) => [
          { st, q, p: "2020", v: (st === "N" ? 1000 : 50) + (q === "Q1" ? 0 : 5) },
          { st, q, p: "2024", v: (st === "N" ? 1030 : 70) + (q === "Q1" ? 0 : 5) },
        ]),
      ),
    ];
    const s: ChartSpec = {
      type: "dumbbell",
      path: ["st", "q"],
      series: "p",
      y: "v",
      zero: false,
      drill: true,
      data: rows,
    };
    const top = ys(renderParts(s).svg);
    const drilled = ys(renderParts(s, { view: { drill: ["N"] } }).svg);
    expect(Math.max(...top) - Math.min(...top)).toBeGreaterThan(40);
    expect(Math.max(...drilled) - Math.min(...drilled)).toBeGreaterThan(40);
  });
  it("sort: change orders by to minus from, largest gain first", () => {
    const s = svg({ ...spec, sort: "change" });
    expect(links(s).map((l) => /data-key="k~(\w)"/.exec(l)![1])).toEqual(["A", "C", "B"]); // A and C gain 20, B loses 6;
  });
  it("tooltip.fields add data-more to the dots", () => {
    const rows = data.map((r) => ({ ...r, u: 7 }));
    const s = svg({ ...spec, data: rows, tooltip: { fields: ["u"] } });
    expect(dots(s)[0]).toContain('data-more="u\t7"');
  });
});

describe("colorBy sign (M2 M14)", () => {
  it("colour is direction only: from is a hollow neutral ring, to is ink", () => {
    const s = svg({ ...spec, colorBy: "sign" });
    const d = dots(s);
    expect(d.every((t) => !t.includes("data-s="))).toBe(true);
    expect(d.filter((t) => t.includes("data-hollow")).every((t) => t.includes("data-neu"))).toBe(
      true,
    );
    expect(d.filter((t) => t.includes("data-to="))).toHaveLength(3);
    expect(dots(svg(spec)).every((t) => t.includes("data-s="))).toBe(true);
  });
});
