import { describe, expect, it } from "vitest";
import { render, renderParts } from "../src/core/render.ts";
import { shape } from "../src/core/shape.ts";
import { MAX_POINTS, MayaSpecError, resolve } from "../src/core/validate.ts";
import type { ChartSpec } from "../src/core/types.ts";

const T0 = Date.UTC(2020, 0, 1);
const stamp = (i: number) => new Date(T0 + i * 60e3 + ((i * 7919) % 50) * 1000).toISOString();
const wave = (i: number) => Math.sin(i / 37) * 50 + ((i * 104729) % 17);
const spec = (n: number, extra: Partial<ChartSpec> = {}, f = wave) =>
  ({
    type: "line",
    x: "x",
    y: "v",
    data: Array.from({ length: n }, (_, i) => ({ x: stamp(i), v: f(i) })),
    ...extra,
  }) as ChartSpec;
const sh = (s: ChartSpec) => shape(resolve(s));

describe("time downsampling", () => {
  it("keeps endpoints and the global extrema", () => {
    const f = (i: number) => (i === 1234 ? 999 : i === 4321 ? -999 : wave(i));
    const s = sh(spec(6000, {}, f));
    expect(s.reduced).not.toBeNull();
    expect(s.categories.length).toBeLessThanOrEqual(MAX_POINTS);
    expect(s.categories[0]).toBe(stamp(0));
    expect(s.categories.at(-1)).toBe(stamp(5999));
    const vals = s.cells.map((c) => c.value);
    expect(vals).toContain(999);
    expect(vals).toContain(-999);
    expect(s.reduced).toEqual([s.categories.length, 6000]);
    expect(s.time).toHaveLength(s.categories.length);
  });
  it("does nothing under the target", () => {
    expect(sh(spec(1000)).reduced).toBeNull();
  });
  it("nulls stay gaps", () => {
    const s = sh(spec(5000, {}, (i) => (i >= 2000 && i < 2600 ? (null as never) : wave(i))));
    const idx = s.cells.map((c) => c.value);
    expect(idx).toContain(null);
    const first = idx.indexOf(null);
    expect(idx[first - 1]).not.toBeNull();
    // the gap is not bridged: every kept category inside it is null
    const t = s.time!;
    const inGap = s.cells.filter(
      (c) => t[c.ci]! >= T0 + 2000 * 60e3 && t[c.ci]! < T0 + 2600 * 60e3,
    );
    expect(inGap.every((c) => c.value === null)).toBe(true);
  });
  it("two series share the union and stay under the target", () => {
    const data = Array.from({ length: 5000 }, (_, i) => [
      { x: stamp(i), s: "a", v: wave(i) },
      { x: stamp(i), s: "b", v: wave(i + 500) * 2 },
    ]).flat();
    const s = sh({ type: "area", x: "x", y: "v", series: "s", data } as ChartSpec);
    expect(s.reduced![0]).toBeLessThanOrEqual(2000);
    expect(s.cells).toHaveLength(s.categories.length * 2);
    const max = (k: number) => Math.max(...s.cells.filter((c) => c.si === k).map((c) => c.value!));
    expect(max(0)).toBeCloseTo(Math.max(...Array.from({ length: 5000 }, (_, i) => wave(i))));
  });
  it("describes the reduction", () => {
    const p = renderParts(spec(3000));
    expect(p.svg).toMatch(/Showing \d+ of 3,?000 points\./);
  });
  it("100k rows render fast with <= 1000 point marks", () => {
    const s = spec(100_000);
    let svg = render(s);
    // Best of three: a parallel test run can stall one render.
    let ms = Infinity;
    for (let i = 0; i < 3; i++) {
      const t = performance.now();
      svg = render(s);
      ms = Math.min(ms, performance.now() - t);
    }
    expect(ms).toBeLessThan(400);
    expect(svg.split('<circle data-maya="mark"').length - 1).toBeLessThanOrEqual(1000);
  });
  it("categorical x is never reduced", () => {
    const data = Array.from({ length: 6000 }, (_, i) => ({ x: "c" + i, v: i }));
    expect(sh({ type: "line", x: "x", y: "v", data } as ChartSpec).reduced).toBeNull();
    try {
      render({ type: "line", x: "x", y: "v", data } as never);
      expect.unreachable();
    } catch (e) {
      expect((e as MayaSpecError).code).toBe("too-many-marks");
    }
  });
});

describe("data-i on a time axis", () => {
  const ids = (svg: string) =>
    [...svg.matchAll(/<circle data-maya="mark"[^>]* data-i="(\d+)"/g)].map((m) => +m[1]!);
  it("points carry absolute indexes, windowed and reduced", () => {
    const s = spec(3000);
    const win = ids(render(s, { view: { window: [1000, 2000] } }));
    expect(win[0]).toBe(1000);
    expect(win.at(-1)).toBe(2000);
    expect(win.every((i) => i >= 1000 && i <= 2000)).toBe(true); // 1001 > 1000: reduced too
    const all = ids(render(s));
    expect(all.length).toBeLessThan(3000);
    expect(all.every((i, k) => i >= 0 && i < 3000 && (!k || i > all[k - 1]!))).toBe(true);
    expect(all[0]).toBe(0);
    expect(all.at(-1)).toBe(2999);
  });
  it("bar marks carry it; band axes do not", () => {
    const bar = (x: string[]) =>
      render({ type: "bar", x: "x", y: "v", data: x.map((v) => ({ x: v, v: 1 })) } as never);
    expect(bar(["2024-01-02", "2024-01-01"])).toMatch(/data-c="0" data-i="0"/);
    expect(bar(["a", "b"]).replace(/<style>.*<\/style>/, "")).not.toContain("data-i=");
  });
});

describe("downsampling bound", () => {
  it("20 000 daily points with alternate nulls render", () => {
    const data = Array.from({ length: 20000 }, (_, i) => ({
      x: new Date(Date.UTC(1970, 0, 1) + i * 864e5).toISOString().slice(0, 10),
      v: i % 2 ? null : i % 97,
    }));
    const s = sh({ type: "line", x: "x", y: "v", data } as ChartSpec);
    expect(s.categories.length).toBeLessThanOrEqual(MAX_POINTS);
    expect(render({ type: "line", x: "x", y: "v", data } as never)).toContain("<svg");
  });
});

describe("point budget", () => {
  it("one point per 2 px of plot, at most MAX_POINTS", () => {
    const s = spec(5000);
    const kept = (width: number) =>
      renderParts(s, { width, height: 360 }).svg.split('data-maya="mark"').length - 1;
    expect(kept(640)).toBeLessThanOrEqual(Math.floor((640 - 56) / 2));
    expect(kept(640)).toBeGreaterThan(100);
    expect(kept(1600)).toBeGreaterThan(kept(640));
    expect(kept(4000)).toBeLessThanOrEqual(MAX_POINTS);
  });
  it("shares 4000 points between series", () => {
    const data = Array.from({ length: 6000 }, (_, i) => ({
      x: stamp(i),
      v: wave(i),
      g: "s" + (i % 8),
    }));
    const s = sh({ type: "line", x: "x", y: "v", series: "g", data } as ChartSpec);
    expect(s.categories.length).toBeLessThanOrEqual(MAX_POINTS);
  });
});

describe("time fast path", () => {
  // The fast path (one series, sorted distinct dates) must equal the general path, which
  // shuffled rows take: same categories, same bytes.
  const shuffled = <T>(a: T[]) =>
    a
      .map((v, i) => [(i * 7919) % a.length, v] as const)
      .sort((p, q) => p[0] - q[0])
      .map((p) => p[1]);
  const cases: [string, (i: number) => unknown, Partial<ChartSpec>, object][] = [
    ["plain", wave, {}, {}],
    ["gaps", (i) => (i % 400 < 60 ? null : wave(i)), {}, {}],
    ["count", (i) => (i % 5 ? wave(i) : null), { aggregate: "count" }, {}],
    ["area", wave, { type: "area" }, {}],
    ["window", wave, {}, { view: { window: [500, 3500] } }],
    ["small", wave, {}, {}],
  ];
  for (const [name, f, extra, opts] of cases)
    for (const n of name === "small" ? [40] : [2000, 6000])
      it(`${name} ${n}`, () => {
        const s = spec(n, extra, f as never);
        const g = { ...s, data: shuffled(s.data as never[]) } as ChartSpec;
        expect(g.data).not.toEqual(s.data);
        expect(renderParts(s, opts)).toEqual(renderParts(g, opts));
      });
});
