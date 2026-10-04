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
