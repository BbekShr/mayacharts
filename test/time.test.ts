import { describe, expect, it } from "vitest";
import { render, renderParts } from "../src/core/render.ts";
import { timeScale } from "../src/core/scale.ts";
import { shape } from "../src/core/shape.ts";
import { timeTicks, toTime } from "../src/core/ticks.ts";
import { MayaSpecError, resolve } from "../src/core/validate.ts";
import type { ChartSpec } from "../src/core/types.ts";

const rows = (xs: unknown[]) => xs.map((x, i) => ({ x: x as string | number | null, v: i + 1 }));
const sh = (spec: Partial<ChartSpec> & { data: readonly object[] }) =>
  shape(resolve({ type: "line", x: "x", y: "v", ...spec } as ChartSpec));
const isTime = (xs: unknown[], extra: Partial<ChartSpec> = {}) =>
  sh({ data: rows(xs), ...extra }).time !== null;

describe("time detection", () => {
  const day = ["2024-01-01", "2024-01-02"];
  it("ISO day, month, datetime", () => {
    expect(isTime(day)).toBe(true);
    expect(isTime(["2024-01", "2024-02"])).toBe(true);
    expect(isTime(["2024-01-01T10:00Z", "2024-01-01T11:00Z"])).toBe(true);
    expect(isTime(["2024-01-01T10:00+02:00", "2024-01-01T11:00:00.5-05:00"])).toBe(true);
    expect(isTime(["2024-01-01T10:00", "2024-01-01T11:00"])).toBe(true);
  });
  it("falls back to categories", () => {
    expect(isTime(["2024-01-01", "soon"])).toBe(false);
    expect(isTime([1, 2, 3])).toBe(false);
    expect(isTime(day, { sort: "asc" })).toBe(false);
    expect(isTime(day, { limit: 5 })).toBe(false);
    expect(isTime(day, { type: "bar", horizontal: true })).toBe(false);
    expect(isTime(day, { type: "waterfall" })).toBe(false);
    expect(isTime(day, { xType: "category" })).toBe(false);
    expect(isTime(day, { type: "heatmap" })).toBe(false);
  });
  it("vertical bar is time", () => expect(isTime(day, { type: "bar" })).toBe(true));
  it("numbers under xType time are epoch ms", () => {
    const s = sh({ data: rows([5000, 1000]), xType: "time" });
    expect(s.time).toEqual([1000, 5000]);
  });
  it("sorts out-of-order rows by time", () => {
    const s = sh({ data: rows(["2024-03-01", "2024-01-01", "2024-02-01"]) });
    expect(s.categories).toEqual(["2024-01-01", "2024-02-01", "2024-03-01"]);
    expect(s.cells.map((c) => c.value)).toEqual([2, 3, 1]);
  });
  it("drops null x under xType time", () => {
    const s = sh({ data: rows(["2024-01-01", null, "2024-01-03"]), xType: "time" });
    expect(s.categories).toHaveLength(2);
  });
  it("rejects a non-date under xType time", () => {
    try {
      render({ type: "line", x: "x", y: "v", xType: "time", data: rows(["yesterday"]) } as never);
      expect.unreachable();
    } catch (e) {
      expect((e as MayaSpecError).code).toBe("invalid-date");
    }
  });
});

describe("time scale", () => {
  it("places bars proportionally to the gaps", () => {
    const svg = render({
      type: "bar",
      x: "x",
      y: "v",
      data: rows(["2024-01-01", "2024-01-02", "2024-01-05"]),
    } as never);
    const xs = [
      ...svg.matchAll(/<rect data-maya="mark"[^>]* x="([\d.]+)" y=[^>]* width="([\d.]+)"/g),
    ].map((m) => +m[1]! + +m[2]! / 2);
    expect(xs).toHaveLength(3);
    expect((xs[2]! - xs[1]!) / (xs[1]! - xs[0]!)).toBeCloseTo(3, 1);
  });
  it("one category sits in the centre", () => {
    const s = timeScale(["a"], [0], [0, 100]);
    expect(s.at(0) + s.bandwidth / 2).toBeCloseTo(50);
  });
  it("of() spans the inset range", () => {
    const s = timeScale(["a", "b"], [0, 10], [0, 100]);
    expect(s.of(0)).toBeCloseTo(s.bandwidth / 2);
    expect(s.of(10)).toBeCloseTo(100 - s.bandwidth / 2);
    expect(s.step).toBeCloseTo(s.bandwidth / 0.8);
  });
});

const d = (s: string) => new Date(s);
describe("timeTicks", () => {
  it("months land on the 1st 00:00 UTC", () => {
    const k = timeTicks(Date.UTC(2024, 0, 10), Date.UTC(2024, 6, 20));
    expect(["month", "quarter"]).toContain(k.unit);
    for (const v of k.values) {
      const x = d(new Date(v).toISOString());
      expect([x.getUTCDate(), x.getUTCHours(), x.getUTCMinutes()]).toEqual([1, 0, 0]);
    }
    expect(k.values[0]).toBeGreaterThanOrEqual(Date.UTC(2024, 0, 10));
  });
  it("weeks land on Mondays", () => {
    const k = timeTicks(Date.UTC(2024, 0, 3), Date.UTC(2024, 1, 20));
    expect(k.unit).toBe("week");
    for (const v of k.values) expect(new Date(v).getUTCDay()).toBe(1);
  });
  it("years land on Jan 1", () => {
    const k = timeTicks(Date.UTC(2010, 5, 1), Date.UTC(2024, 5, 1));
    expect(k.unit).toBe("year");
    for (const v of k.values) {
      expect(new Date(v).getUTCMonth()).toBe(0);
      expect(new Date(v).getUTCDate()).toBe(1);
    }
  });
  it("covers a leap day", () => {
    const k = timeTicks(Date.UTC(2024, 1, 27), Date.UTC(2024, 2, 3));
    expect(k.unit).toBe("day");
    expect(k.values).toContain(Date.UTC(2024, 1, 29));
  });
  it("ticks stay inside the domain, in order", () => {
    for (const [a, b] of [
      [0, 1e3],
      [0, 3.6e6],
      [0, 1e12],
      [Date.UTC(2020, 0, 1), Date.UTC(2020, 0, 2)],
    ] as const) {
      const k = timeTicks(a, b);
      expect(k.values.length).toBeGreaterThanOrEqual(2);
      expect(k.values.length).toBeLessThanOrEqual(12);
      expect(k.values.every((v, i) => v >= a && v <= b && (!i || v > k.values[i - 1]!))).toBe(true);
    }
  });
  it("one-point domain: one tick", () => {
    expect(timeTicks(5, 5).values).toEqual([5]);
  });
  it("toTime parses offsets", () => {
    expect(toTime("2024-01-01T00:00+01:00", false)).toBe(Date.UTC(2023, 11, 31, 23));
  });
});

describe("time render", () => {
  const spec = (xs: unknown[], extra = {}) =>
    ({ type: "line", x: "x", y: "v", data: rows(xs), ...extra }) as never;
  it("renders 10 000 irregular timestamps", () => {
    const data = Array.from({ length: 10000 }, (_, i) => ({
      x: new Date(Date.UTC(2020, 0, 1) + i * 3600e3 + ((i * 7919) % 3000) * 1000).toISOString(),
      v: i % 97,
    }));
    expect(render({ type: "line", x: "x", y: "v", data } as never)).toContain("data-t");
  });
  it("is deterministic", () => {
    const s = spec(["2024-01-01", "2024-02-15", "2024-04-01"]);
    expect(render(s)).toBe(render(s));
  });
  it("data-t only on time axes", () => {
    const tag = (x: string) => /<svg[^>]*>/.exec(x)![0];
    expect(tag(render(spec(["2024-01-01", "2024-02-01"])))).toContain(' data-t=""');
    expect(tag(render(spec(["a", "b"])))).not.toContain(" data-t");
    expect(tag(render(spec(["2024-01-01", "2024-02-01"], { xType: "category" })))).not.toContain(
      " data-t",
    );
  });
  it("default tooltip x format follows the gap", () => {
    const x = (xs: string[]) => /data-x="([^"]*)"/.exec(render(spec(xs)))![1];
    expect(x(["2022-01-01", "2024-01-01"])).toBe("2022");
    expect(x(["2024-01-01", "2024-03-01"])).toBe("Jan 2024");
    expect(x(["2024-01-01", "2024-01-08"])).toBe("Jan 1, 2024");
    expect(x(["2024-01-01T10:00", "2024-01-01T11:00"])).toMatch(/Jan 1, 2024.*10:00/);
  });
  it("description names the range", () => {
    const p = renderParts(spec(["2024-01-01", "2024-03-01"]));
    expect(p.svg).toContain("from Jan 2024 to Mar 2024");
  });
  it("has no vertical grid on time axes", () => {
    const g = /data-maya="grid">(.*?)<\/g>/.exec(render(spec(["2024-01-01", "2024-03-01"])))![1]!;
    expect(g).not.toMatch(/x1="(\d+(\.\d+)?)" x2="\1"/);
  });
});

describe("time axis review fixes", () => {
  const bad = (v: number) => () =>
    render({ type: "line", x: "x", y: "v", xType: "time", data: rows([0, v]) } as never);
  const labels = (svg: string) =>
    [
      ...(/data-maya="axis-x">(.*?)<\/g>/.exec(svg)?.[1] ?? "").matchAll(/<text[^>]*>([^<]*)</g),
    ].map((m) => m[1]!);
  const xsOf = (svg: string) =>
    [...svg.matchAll(/<rect data-maya="mark"[^>]* x="([\d.]+)" y=[^>]* width="([\d.]+)"/g)].map(
      (m) => +m[1]! + +m[2]! / 2,
    );

  it("out-of-range epoch ms are invalid-date, not a hang", () => {
    for (const v of [8.64e15 + 2000, 1e300, -1e300]) expect(bad(v)).toThrow(/invalid-date|xType/);
    expect(toTime(1e300)).toBeNull();
    const t = performance.now();
    const k = timeTicks(-8.64e15, 8.64e15);
    expect(performance.now() - t).toBeLessThan(500);
    expect(k.values.length).toBeGreaterThanOrEqual(2);
    expect(() => timeTicks(0, 8.64e15, 6, true)).not.toThrow();
    expect(
      render({ type: "line", x: "x", y: "v", xType: "time", data: rows([0, 8.64e15]) } as never),
    ).toContain("data-t");
  });

  it("a boundary just before the data labels the origin", () => {
    const svg = render({
      type: "line",
      x: "x",
      y: "v",
      data: rows(["2025-01-01T00:18Z", "2025-06-01T00:00Z", "2025-12-15T00:00Z"]),
    } as never);
    expect(labels(svg)[0]).toBe("Jan 2025");
  });

  it("month-start bars are evenly spaced; a missing month is one empty slot", () => {
    const months = Array.from(
      { length: 12 },
      (_, i) => `2025-${String(i + 1).padStart(2, "0")}-01`,
    );
    const xs = xsOf(
      render({
        type: "bar",
        x: "x",
        y: "v",
        data: rows(months.filter((m) => m !== "2025-05-01")),
      } as never),
    );
    expect(xs).toHaveLength(11);
    const gaps = xs.slice(1).map((v, i) => v - xs[i]!);
    const g = gaps[0]!;
    gaps.forEach((v, i) => expect(v).toBeCloseTo(i === 3 ? 2 * g : g, 1));
    const s = timeScale(["a", "b"], [Date.UTC(2025, 0, 1), Date.UTC(2025, 2, 1)], [0, 100]);
    expect(s.of(Date.UTC(2025, 2, 1))).toBeCloseTo(s.at(1) + s.bandwidth / 2);
  });

  it("tick count follows the width and stays evenly spaced", () => {
    const data = rows(
      Array.from({ length: 12 }, (_, i) => `2025-${String(i + 1).padStart(2, "0")}-01`),
    );
    const at = (width: number) =>
      render({ type: "line", x: "x", y: "v", data } as never, { width });
    const narrow = labels(at(360));
    expect(narrow.slice(0, 4)).toEqual(["Jan 2025", "Apr", "Jul", "Oct"]);
    expect(labels(at(1200)).length).toBeGreaterThan(narrow.length);
  });

  it("sub-day ticks show the date at midnight and on the first tick", () => {
    const data = rows(
      Array.from({ length: 49 }, (_, i) =>
        new Date(Date.UTC(2025, 2, 1, 6) + i * 3600e3).toISOString(),
      ),
    );
    const l = labels(render({ type: "line", x: "x", y: "v", data } as never));
    expect(l[0]).toMatch(/^Mar 1/);
    expect(l[0]).toMatch(/\d:\d\d/);
    expect(l.some((t) => t === "Mar 2")).toBe(true);
  });

  it("a 10-day hole in hourly data breaks the line", () => {
    const hrs = (from: number, n: number) =>
      Array.from({ length: n }, (_, i) =>
        new Date(Date.UTC(2025, 0, 1) + (from + i) * 3600e3).toISOString(),
      );
    const svg = render({
      type: "line",
      x: "x",
      y: "v",
      data: rows([...hrs(0, 48), ...hrs(48 + 240, 48)]),
    } as never);
    const d = /data-maya="line"[^>]* d="([^"]*)"/.exec(svg)![1]!;
    expect(d.match(/M/g)).toHaveLength(2);
  });
});
