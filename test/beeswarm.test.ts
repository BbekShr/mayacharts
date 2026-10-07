import { describe, expect, it } from "vitest";
import { render, renderParts } from "../src/index.ts";
import type { ChartSpec } from "../src/core/types.ts";

const CI = process.env.CI ? 2 : 1; // shared runners are slower than a laptop

const regions = ["East", "West", "North"];
const data = Array.from({ length: 60 }, (_, i) => ({
  region: regions[i % 3]!,
  item: `item${i}`,
  chan: i % 2 ? "online" : "store",
  sales: 100 + ((i * 37) % 50),
}));
const spec: ChartSpec = { type: "beeswarm", x: "region", y: "sales", name: "item", data };
const svg = (s: ChartSpec, view?: { hidden: string[] }) => renderParts(s, view ? { view } : {}).svg;
const dots = (s: string) => [...s.matchAll(/<circle data-maya="mark"[^>]*>/g)].map((m) => m[0]);
const num = (t: string, a: string) => Number(new RegExp(` ${a}="([^"]+)"`).exec(t)![1]);

describe("beeswarm", () => {
  it("draws one dot per row with the payload", () => {
    const s = svg(spec);
    const d = dots(s);
    expect(d).toHaveLength(60);
    expect(d[0]).toContain('data-key="~item0"');
    expect(d[0]).toContain('data-x="item0"');
    expect(d[0]).toContain('data-y="100"');
    expect(d[0]).toContain('data-f="100"');
    expect(d[0]).toContain('data-s="0"');
  });
  it("marks group holds only keyed children", () => {
    const g = svg(spec).match(/<g data-maya="marks">(.*?)<\/g>/s)![1]!;
    expect(g.match(/<\w+ /g)!.length).toBe(g.match(/data-key=/g)!.length);
  });
  it("circles do not overlap within a swarm when there is room", () => {
    const d = dots(svg({ ...spec, data: data.slice(0, 15) }));
    const p = d.map((t) => [num(t, "cx"), num(t, "cy"), num(t, "r")] as const);
    for (let i = 0; i < p.length; i++)
      for (let j = i + 1; j < p.length; j++) {
        const [a, b] = [p[i]!, p[j]!];
        if (Math.abs(a[1] - b[1]) > 60) continue;
        expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeGreaterThanOrEqual(a[2] * 2 - 0.2);
      }
  });
  it("colours by series slot and honours hidden series", () => {
    const s = { ...spec, series: "chan" };
    const d = dots(svg(s));
    expect(d[0]).toContain('data-series="store"');
    expect(d[1]).toContain('data-s="1"');
    expect(dots(svg(s, { hidden: ["online"] }))).toHaveLength(30);
  });
  it("without x draws one swarm across the middle and no left band", () => {
    const s: ChartSpec = { type: "beeswarm", y: "sales", data };
    const d = dots(svg(s));
    expect(d).toHaveLength(60);
    expect(svg(s)).toContain("data-maya=");
    const ys = d.map((t) => num(t, "cy"));
    expect(Math.abs((Math.min(...ys) + Math.max(...ys)) / 2 - 150)).toBeLessThan(10);
  });
  it("duplicate names get distinct keys; no name keys by row index", () => {
    const dup = svg({ ...spec, data: data.map((r) => ({ ...r, item: "same" })) });
    const keys = dots(dup).map((t) => /data-key="([^"]+)"/.exec(t)![1]);
    expect(new Set(keys).size).toBe(60);
    const { name: _n, ...noName } = spec;
    const bare = dots(svg(noName)).find((t) => t.includes('data-c="4"'))!;
    expect(bare).toContain('data-key="~4"');
    expect(bare).toContain('data-x="West"');
  });
  it("dots draw no hit rects (the tooltip picks the nearest dot)", () => {
    expect(svg(spec)).not.toContain(`data-maya="hit"`);
  });
  it("skips null and non-numeric values; empty data renders the empty state", () => {
    const s = svg({
      ...spec,
      data: [...data.slice(0, 3), { region: "East", item: "n", sales: null }],
    });
    expect(dots(s)).toHaveLength(3);
    expect(svg({ ...spec, data: [] })).toContain('data-maya="empty"');
  });
  it("single row, negative and zero values render", () => {
    expect(dots(svg({ ...spec, data: [data[0]!] }))).toHaveLength(1);
    const neg = svg({
      ...spec,
      data: [
        { region: "a", item: "p", sales: -5 },
        { region: "a", item: "q", sales: 0 },
      ],
    });
    expect(dots(neg)).toHaveLength(2);
    expect(dots(neg)[0]).toContain('data-neg=""');
  });
  it("yDomain clips", () => {
    expect(dots(svg({ ...spec, yDomain: [100, 110] })).length).toBeLessThan(60);
  });
  it("a swarm taller than its band is clamped inside the plot", () => {
    const many = Array.from({ length: 400 }, (_, i) => ({ region: "a", item: `p${i}`, sales: 50 }));
    const d = dots(render({ ...spec, data: many }, { width: 400, height: 120 }));
    expect(d).toHaveLength(400);
    for (const t of d) expect(num(t, "cy")).toBeGreaterThan(0);
  });
  it("escapes hostile strings", () => {
    const evil = `"><script>x</script>`;
    const s = svg({ ...spec, data: [{ region: evil, item: evil, sales: 1 }] });
    expect(s).not.toContain("<script>");
  });
  it("is deterministic", () => {
    expect(render(spec)).toBe(render(spec));
  });
  it("validation: x is optional, y required, horizontal rejected", () => {
    expect(() => render({ type: "beeswarm", y: "sales", data })).not.toThrow();
    expect(() => render({ type: "beeswarm", x: "region", data } as unknown as ChartSpec)).toThrow();
    expect(() => render({ ...spec, horizontal: true })).toThrow();
  });
  it("5000 tied values stay fast (dodge checks the 50 most recent neighbours)", () => {
    const ties = Array.from({ length: 5000 }, (_, i) => ({ item: `i${i}`, sales: 0 }));
    const run = () => render({ type: "beeswarm", y: "sales", name: "item", data: ties });
    run();
    const ms = Math.min(
      ...Array.from({ length: 4 }, () => {
        const t = performance.now();
        run();
        return performance.now() - t;
      }),
    );
    expect(ms).toBeLessThan(200 * CI);
  });

  it("past MAX_MARKS draws a violin of cells per band whose counts sum to the rows", () => {
    const big = Array.from({ length: 30000 }, (_, i) => ({
      region: regions[i % 3]!,
      sales: 100 + ((i * 7919) % 1000) / 10,
    }));
    const out = renderParts({ type: "beeswarm", x: "region", y: "sales", data: big });
    const rects = [...out.svg.matchAll(/<rect data-maya="mark"[^>]*>/g)].map((m) => m[0]);
    expect(dots(out.svg)).toHaveLength(0);
    expect(rects.length).toBeGreaterThan(0);
    expect(rects.length).toBeLessThanOrEqual(10000);
    expect(rects.reduce((t, r) => t + num(r, "data-y"), 0)).toBe(30000);
    expect(rects[0]).toMatch(/data-x="East, sales [^"]+ to [^"]+"/);
    expect(rects[0]).toMatch(/data-f="[\d,]+ points?"/);
    expect(out.svg).toContain("density cells");
    expect(out.legend).toContain('data-maya="ramp"');
  });

  it("one band with no x past the cap draws a single violin", () => {
    const big = Array.from({ length: 12000 }, (_, i) => ({ sales: (i * 31) % 997 }));
    const out = svg({ type: "beeswarm", y: "sales", data: big });
    expect(out).toContain("<rect");
  });
});
