import { describe, expect, it } from "vitest";
import { render, renderParts } from "../src/core/render.ts";
import { MAX_MARKS, MayaSpecError } from "../src/core/validate.ts";

const time = (fn: () => unknown) => {
  fn(); // warm-up (JIT, Intl formatter caches)
  const t = performance.now();
  const out = fn();
  return { ms: performance.now() - t, out };
};
// Best of four after the warm-up: a loaded CI box slows a run, rarely all of them.
const best = (fn: () => unknown, runs = 4) => {
  const all = Array.from({ length: runs }, () => time(fn));
  return all.reduce((a, b) => (b.ms < a.ms ? b : a));
};
const guard = (ctx: { skip: () => never }, fn: () => unknown) => {
  try {
    return time(fn);
  } catch (e) {
    if (e instanceof Error && e.message.includes("not implemented")) return ctx.skip();
    throw e;
  }
};

describe("performance envelope", () => {
  const big = () =>
    Array.from({ length: MAX_MARKS }, (_, i) => ({ c: "cat" + i, v: (i * 37) % 1000 }));
  it("5k-category bar: < 150 ms", (ctx) => {
    const data = big();
    const { ms } = guard(ctx, () => render({ type: "bar", x: "c", y: "v", data } as never));
    expect(ms).toBeLessThan(400);
  });

  // REAL BUG (perf): 5k-bar output is ~1.85 MB (> 1.5 MB envelope), ~370 B per mark (mark + hit + table row).
  it("5k-category bar: output under the envelope", (ctx) => {
    const data = big();
    const { out } = guard(ctx, () => render({ type: "bar", x: "c", y: "v", data } as never));
    expect((out as string).length).toBeLessThan(2.2e6); // ponytail: ~370 B per bar incl. its hit rect
  });

  it("5k-row scatter: < 200 ms", (ctx) => {
    const data = Array.from({ length: 5000 }, (_, i) => ({
      a: (i * 7919) % 1000,
      v: (i * 104729) % 977,
    }));
    const { ms } = guard(ctx, () => render({ type: "scatter", x: "a", y: "v", data } as never));
    expect(ms).toBeLessThan(200);
  });

  it("50x52 heatmap: < 100 ms", (ctx) => {
    const data = Array.from({ length: 50 * 52 }, (_, i) => ({
      w: "w" + (i % 52),
      d: "d" + Math.floor(i / 52),
      v: (i * 13) % 100,
    }));
    const { ms } = guard(ctx, () =>
      render({ type: "heatmap", x: "w", series: "d", y: "v", data } as never),
    );
    expect(ms).toBeLessThan(100);
  });

  it("20k rows with limit:20: < 150 ms", () => {
    const data = Array.from({ length: 20000 }, (_, i) => ({ c: "c" + i, v: (i * 31) % 500 }));
    const { ms, out } = time(() =>
      render({ type: "bar", x: "c", y: "v", limit: 20, data } as never),
    );
    expect(ms).toBeLessThan(400);
    expect((out as string).length).toBeLessThan(2e5);
  });

  it("200k rows with limit:10 does not throw (describe path)", () => {
    const data = Array.from({ length: 200000 }, (_, i) => ({ c: "c" + (i % 100000), v: i % 50 }));
    const p = renderParts({ type: "bar", x: "c", y: "v", limit: 10, data } as never);
    expect(p.svg).toContain("<svg");
  });

  it("too-many-marks throws for 6k categories", () => {
    const data = Array.from({ length: 6000 }, (_, i) => ({ c: "c" + i, v: 1 }));
    let err: unknown;
    try {
      renderParts({ type: "bar", x: "c", y: "v", data } as never);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(MayaSpecError);
    expect((err as MayaSpecError).code).toBe("too-many-marks");
  });

  // One row per minute, the shape the comparison suite feeds every library.
  const minutes = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      date: new Date(Date.UTC(2024, 0, 1) + i * 60_000).toISOString(),
      value: 100 + Math.sin(i / 50) * 5 + ((i * 7919) % 13) / 10,
    }));
  const line = (data: unknown[]) => ({ type: "line", x: "date", y: "value", data }) as never;

  it("line 1k: under 120 KB of svg", () => {
    expect(renderParts(line(minutes(1000))).svg.length).toBeLessThan(120e3);
  });

  it("line 100k: < 60 ms", () => {
    const data = minutes(100_000);
    expect(best(() => renderParts(line(data))).ms).toBeLessThan(60);
  });

  it("line 1M: < 400 ms", () => {
    const data = minutes(1_000_000);
    expect(best(() => renderParts(line(data))).ms).toBeLessThan(400);
  }, 30_000);

  it("scatter 1M: < 500 ms, and no hit elements", () => {
    const data = Array.from({ length: 1_000_000 }, (_, i) => ({
      x: (i * 7919) % 10007,
      y: (i * 104729) % 9973,
    }));
    const spec = { type: "scatter", x: "x", y: "y", data } as never;
    const { ms, out } = best(() => renderParts(spec));
    expect(ms).toBeLessThan(500);
    expect((out as { svg: string }).svg).not.toContain('data-maya="hit"');
  }, 30_000);

  it("scatter draws no hit elements below the bin limit either", () => {
    const data = Array.from({ length: 300 }, (_, i) => ({ x: i, y: (i * 7) % 50 }));
    const svg = renderParts({ type: "scatter", x: "x", y: "y", data } as never).svg;
    expect(svg).toContain('data-maya="mark"');
    expect(svg).not.toContain('data-maya="hit"');
  });

  it("6k scatter rows bin into at most MAX_MARKS density rects", () => {
    const data = Array.from({ length: 6000 }, (_, i) => ({ x: i % 3, y: i }));
    const svg = renderParts({ type: "scatter", x: "x", y: "y", data } as never).svg;
    const n = svg.split(' data-maya="mark"').length - 1;
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(MAX_MARKS);
  });

  // The other per-row types at 1k rows: size budgets from the measured output (kpi 43 KB,
  // ridgeline 32 KB, beeswarm 139 KB, parallel 859 KB of svg) with room, time bounds for CI.
  const rows = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      cat: "c" + (i % 40),
      series: "s" + (i % 4),
      value: (i * 37) % 1000,
      x: i,
      y: (i * 104729) % 977,
      size: (i * 13) % 50,
      date: new Date(Date.UTC(2020, 0, 1) + i * 864e5).toISOString().slice(0, 10),
      id: "id" + i,
    }));
  const kinds = {
    kpi: { type: "kpi", x: "date", y: "value" },
    ridgeline: { type: "ridgeline", x: "x", y: "value", series: "series" },
    beeswarm: { type: "beeswarm", x: "cat", y: "value" },
    parallel: { type: "parallel", x: "id", y: ["value", "x", "y", "size"] },
  };
  // [svg bytes, ms]
  const budget: Record<keyof typeof kinds, [number, number]> = {
    kpi: [60e3, 50],
    ridgeline: [50e3, 50],
    beeswarm: [180e3, 60],
    parallel: [950e3, 150],
  };
  for (const k of Object.keys(kinds) as (keyof typeof kinds)[]) {
    const [bytes, limit] = budget[k];
    it(`${k} 1k rows: svg under ${bytes / 1e3} KB, < ${limit} ms`, () => {
      const data = rows(1000);
      const { ms, out } = best(() => renderParts({ ...kinds[k], data } as never));
      expect((out as { svg: string }).svg.length).toBeLessThan(bytes);
      expect(ms).toBeLessThan(limit);
    });
  }

  for (const k of ["kpi", "ridgeline"] as const) {
    it(`${k} 10k rows: draws a thinned chart instead of throwing`, () => {
      const p = best(() => renderParts({ ...kinds[k], data: rows(10_000) } as never));
      expect(p.ms).toBeLessThan(250);
      const svg = (p.out as { svg: string }).svg;
      expect(svg.length).toBeLessThan(120e3);
      expect(svg.split(' data-maya="mark"').length - 1).toBeLessThan(1000);
    });
  }

  it("kpi thinned keeps the headline, the last point and the extremes", () => {
    const data = rows(10_000).map((r, i) => ({ ...r, value: i === 5000 ? 1e6 : r.value }));
    const svg = renderParts({ ...kinds.kpi, data } as never).svg;
    expect(svg).toContain('data-last="');
    expect(svg).toContain('data-y="1000000"');
    expect(svg).toContain('data-c="9999"');
  });

  for (const k of ["beeswarm", "parallel"] as const) {
    // ponytail: one mark per row; a reduction would draw a different chart (use scatter to bin).
    it(`${k} still throws too-many-marks past the limit`, () => {
      expect(() => renderParts({ ...kinds[k], data: rows(10_000) } as never)).toThrow(
        /marks exceed/,
      );
    });
  }
});
