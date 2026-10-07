import { describe, expect, it } from "vitest";
import { render, renderParts } from "../src/index.ts";
import "../src/weave.ts";
import type { ChartSpec } from "../src/core/types.ts";

const P = ["Q1", "Q2", "Q3"];
// A overtakes B between Q1 and Q2; C stays last.
const V: Record<string, number[]> = { A: [10, 30, 30], B: [20, 20, 25], C: [1, 2, 3] };
const rows = Object.entries(V).flatMap(([s, v]) => v.map((y, i) => ({ p: P[i]!, s, y })));
const spec = (extra: object = {}, data: object[] = rows): ChartSpec =>
  ({ type: "weave", x: "p", y: "y", series: "s", data, ...extra }) as ChartSpec;
const tags = (svg: string) => [...svg.matchAll(/<(?:path|circle) [^>]*>/g)].map((m) => m[0]);
const at = (t: string, a: string) => new RegExp(` ${a}="([^"]*)"`).exec(t)?.[1];
const threads = (svg: string) => tags(svg).filter((t) => t.includes("data-w="));

describe("weave", () => {
  const svg = render(spec());
  const keys = tags(svg).map((t) => at(t, "data-key")!);

  it("keys are unique and stable across renders", () => {
    expect(new Set(keys).size).toBe(keys.length);
    expect(render(spec())).toBe(svg);
    // Hiding C leaves A and B threads under the same keys.
    const hidden = render(spec(), { view: { hidden: ["C"] } });
    expect(keys).toContain("w~A~0");
    for (const t of threads(hidden)) expect(keys).toContain(at(t, "data-key"));
    expect(
      threads(hidden).some(
        (t) => at(t, "data-series") === "C" || at(t, "data-key")!.includes("~C~"),
      ),
    ).toBe(false);
  });

  it("ranks by value with ties in series order", () => {
    const f = (m: string) => tags(svg).find((t) => at(t, "data-key") === m)!;
    expect(at(f("A~Q1"), "data-f")).toContain("Rank 2");
    expect(at(f("A~Q2"), "data-f")).toContain("Rank 1");
    // 30 vs 30 elsewhere: tie goes to the earlier series.
    const tie = render(
      spec({}, [
        { p: "Q1", s: "A", y: 5 },
        { p: "Q1", s: "B", y: 5 },
      ]),
    );
    const dots = tags(tie).filter((t) => t.includes('data-maya="mark"'));
    expect(dots.map((t) => at(t, "data-series"))).toEqual(["A", "B"]);
    expect(at(dots[1]!, "data-f")).toContain("Rank 2");
  });

  it("draws the climbing thread after the falling one, halos first", () => {
    const seg0 = threads(svg).filter((t) => at(t, "data-c") === "0");
    const order = seg0.map((t) => at(t, "data-key")!);
    // Q1 to Q2: C flat (3 to 3), B falls (2 to 2... ) A climbs 3 to 1 and goes last.
    expect(order.at(-1)).toBe("w~A~0");
    expect(order.indexOf("w~A~0~h")).toBe(order.length - 2);
    expect(order.indexOf("w~B~0")).toBeLessThan(order.indexOf("w~A~0~h"));
    // Every segment has a halo, so keys stay stable when crossings change.
    expect(order).toContain("w~C~0~h");
  });

  it("every thread carries the series slot and period", () => {
    for (const t of threads(svg)) {
      expect(at(t, "data-s")).toMatch(/^[0-7]$/);
      expect(at(t, "data-c")).toMatch(/^[01]$/);
    }
  });

  it("is deterministic and escapes hostile strings", () => {
    const evil = `"><img src=x onerror=alert(1)>`;
    const d = [
      { p: evil, s: evil, y: 1 },
      { p: "b", s: evil, y: 2 },
      { p: evil, s: "<b>", y: 3 },
      { p: "b", s: "<b>", y: 1 },
    ];
    const out = render(spec({ title: evil }, d));
    expect(out).toBe(render(spec({ title: evil }, d)));
    expect(out).not.toContain("<img");
    expect(out).not.toContain("<b>");
  });

  it("handles empty data, one row, one series and one period", () => {
    expect(render(spec({}, []))).toContain("<svg");
    const one = render(spec({}, [{ p: "Q1", s: "A", y: 4 }]));
    expect(threads(one)).toHaveLength(0);
    expect(tags(one).filter((t) => t.includes('data-maya="mark"'))).toHaveLength(1);
    const solo = render(
      spec(
        {},
        rows.filter((r) => r.s === "A"),
      ),
    );
    expect(threads(solo).map((t) => at(t, "data-key"))).toEqual([
      "w~A~0~h",
      "w~A~0",
      "w~A~1~h",
      "w~A~1",
    ]);
  });

  it("breaks the thread at a missing period", () => {
    const gap = rows.filter((r) => !(r.s === "B" && r.p === "Q2"));
    const out = render(spec({}, gap));
    const b = threads(out).filter(
      (t) => at(t, "data-series") === "B" || at(t, "data-key")!.includes("~B~"),
    );
    expect(b).toHaveLength(0);
    expect(tags(out).filter((t) => at(t, "data-series") === "B")).toHaveLength(2);
    // The others rank among themselves: A is first at Q2.
    expect(
      at(
        tags(out).find((t) => at(t, "data-key") === "A~Q2")!,
        "data-f",
      ),
    ).toContain("Rank 1");
  });

  it("lists the ranks in the description and the table", () => {
    const p = renderParts(spec());
    expect(p.svg).toContain("Q1: B &gt; A &gt; C");
    expect(p.table).toContain("<th>A</th>");
  });

  it("lights a thread through data-n and data-a", () => {
    const dot = tags(svg).find((t) => at(t, "data-key") === "A~Q1")!;
    expect(at(dot, "data-n")).toBe("0");
    expect(threads(svg).filter((t) => at(t, "data-a") === "0").length).toBeGreaterThan(0);
  });

  it("mirrors like line in an RTL locale (same marks, same keys)", () => {
    const out = render(spec({ locale: "ar" }));
    expect(tags(out).map((t) => at(t, "data-key"))).toEqual(keys);
  });

  it("fails above 8 series", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ p: "Q1", s: `s${i}`, y: i }));
    expect(() => render(spec({}, many))).toThrow(/at most 8/);
    const ok = many.slice(0, 8);
    expect(render(spec({}, ok))).toContain("<svg");
  });
});

it("renders in core with no window or document", async () => {
  const w = globalThis as Record<string, unknown>;
  const saved = [w.window, w.document];
  delete w.window;
  delete w.document;
  try {
    const { render: r } = await import("../src/index.ts");
    await import("../src/weave.ts");
    expect(r(spec())).toContain("w~A~0");
  } finally {
    [w.window, w.document] = saved;
  }
});
