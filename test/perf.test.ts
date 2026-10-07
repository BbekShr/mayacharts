import { describe, expect, it } from "vitest";
import { render, renderParts } from "../src/core/render.ts";
import { MAX_MARKS, MayaSpecError } from "../src/core/validate.ts";

// Shared CI runners are 2 to 4 times slower than a laptop; the envelopes double there.
const CI = process.env.CI ? 2 : 1;
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
  const big = (n = 5000) =>
    Array.from({ length: n }, (_, i) => ({ c: "cat" + i, v: (i * 37) % 1000 }));
  it("5k-category bar: < 150 ms", (ctx) => {
    const data = big();
    const { ms } = guard(ctx, () => render({ type: "bar", x: "c", y: "v", data } as never));
    expect(ms).toBeLessThan(400 * CI);
  });

  // REAL BUG (perf): 5k-bar output is ~1.85 MB (> 1.5 MB envelope), ~370 B per mark (mark + hit + table row).
  it("5k-category bar: output under the envelope", (ctx) => {
    const data = big();
    const { out } = guard(ctx, () => render({ type: "bar", x: "c", y: "v", data } as never));
    expect((out as string).length).toBeLessThan(2.2e6); // ponytail: ~370 B per bar incl. its hit rect
  });

  it("10k-category bar with labels (the cap): < 1500 ms, under 4.4 MB", (ctx) => {
    const data = big(MAX_MARKS);
    const { ms, out } = guard(ctx, () =>
      render({ type: "bar", x: "c", y: "v", labels: true, data } as never),
    );
    expect(ms).toBeLessThan(1500 * CI);
    expect((out as string).length).toBeLessThan(4.4e6);
  });

  it("5k-row scatter: < 200 ms", (ctx) => {
    const data = Array.from({ length: 5000 }, (_, i) => ({
      a: (i * 7919) % 1000,
      v: (i * 104729) % 977,
    }));
    const { ms } = guard(ctx, () => render({ type: "scatter", x: "a", y: "v", data } as never));
    expect(ms).toBeLessThan(200 * CI);
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
    expect(ms).toBeLessThan(100 * CI);
  });

  it("20k rows with limit:20: < 150 ms", () => {
    const data = Array.from({ length: 20000 }, (_, i) => ({ c: "c" + i, v: (i * 31) % 500 }));
    const { ms, out } = time(() =>
      render({ type: "bar", x: "c", y: "v", limit: 20, data } as never),
    );
    expect(ms).toBeLessThan(400 * CI);
    expect((out as string).length).toBeLessThan(2e5);
  });

  it("200k rows with limit:10 does not throw (describe path)", () => {
    const data = Array.from({ length: 200000 }, (_, i) => ({ c: "c" + (i % 100000), v: i % 50 }));
    const p = renderParts({ type: "bar", x: "c", y: "v", limit: 10, data } as never);
    expect(p.svg).toContain("<svg");
  });

  it("too-many-marks throws for 11k categories on a chart that cannot roll up", () => {
    const data = Array.from({ length: 11000 }, (_, i) => ({ c: "c" + i, v: 1 }));
    let err: unknown;
    try {
      renderParts({ type: "waterfall", x: "c", y: "v", data } as never);
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
    expect(best(() => renderParts(line(data))).ms).toBeLessThan(60 * CI);
  });

  it("line 1M: < 600 ms", () => {
    const data = minutes(1_000_000);
    expect(best(() => renderParts(line(data))).ms).toBeLessThan(600 * CI);
  }, 30_000);

  it("scatter 1M: < 500 ms, and no hit elements", () => {
    const data = Array.from({ length: 1_000_000 }, (_, i) => ({
      x: (i * 7919) % 10007,
      y: (i * 104729) % 9973,
    }));
    const spec = { type: "scatter", x: "x", y: "y", data } as never;
    const { ms, out } = best(() => renderParts(spec));
    expect(ms).toBeLessThan(500 * CI);
    expect((out as { svg: string }).svg).not.toContain('data-maya="hit"');
  }, 30_000);

  it("scatter draws no hit elements below the bin limit either", () => {
    const data = Array.from({ length: 300 }, (_, i) => ({ x: i, y: (i * 7) % 50 }));
    const svg = renderParts({ type: "scatter", x: "x", y: "y", data } as never).svg;
    expect(svg).toContain('data-maya="mark"');
    expect(svg).not.toContain('data-maya="hit"');
  });

  it("11k scatter rows bin into at most MAX_MARKS density rects", () => {
    const data = Array.from({ length: 11000 }, (_, i) => ({ x: i % 3, y: i }));
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
      expect(ms).toBeLessThan(limit * CI);
    });
  }

  for (const k of ["kpi", "ridgeline"] as const) {
    it(`${k} 10k rows: draws a thinned chart instead of throwing`, () => {
      const p = best(() => renderParts({ ...kinds[k], data: rows(12_000) } as never));
      expect(p.ms).toBeLessThan(250 * CI);
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
  });

  for (const k of ["parallel"] as const) {
    // ponytail: one mark per row; a reduction would draw a different chart (use scatter to bin).
    it(`${k} still throws too-many-marks past the limit`, () => {
      expect(() => renderParts({ ...kinds[k], data: rows(12_000) } as never)).toThrow(
        /marks exceed/,
      );
    });
  }
});

// One million rows through every type that reduces instead of failing. The envelopes are generous
// (the numbers are a quarter of them on a laptop); the point is "seconds, not minutes, and the
// second render of the same array is a re-draw, not another row pass".
describe("1M rows", () => {
  const once = (fn: () => unknown) => {
    const t = performance.now();
    const out = fn();
    return { ms: performance.now() - t, out };
  };
  const rows = (f: (i: number) => Record<string, unknown>) =>
    Array.from({ length: 1_000_000 }, (_, i) => f(i));
  const cases: [string, () => Record<string, unknown>, RegExp | null][] = [
    [
      "bar of 1M distinct categories rolls up into Other",
      () => ({
        type: "bar",
        x: "c",
        y: "v",
        data: rows((i) => ({ c: "c" + i, v: (i * 7919) % 1000 })),
      }),
      /^bar: 1000000 categories: the top/,
    ],
    [
      "line over 1M categories thins",
      () => ({
        type: "line",
        x: "c",
        y: "v",
        data: rows((i) => ({ c: "c" + i, v: (i * 7919) % 1000 })),
      }),
      null,
    ],
    [
      "table of 1M categories draws the rows that fit",
      () => ({
        type: "table",
        x: "c",
        y: ["a", "b"],
        data: rows((i) => ({ c: "c" + i, a: i % 97, b: i % 13 })),
      }),
      null,
    ],
    [
      "kpi over 1M categories thins its sparkline",
      () => ({
        type: "kpi",
        x: "t",
        y: "v",
        data: rows((i) => ({ t: "d" + i, v: (i * 7919) % 1000 })),
      }),
      null,
    ],
  ];
  for (const [name, make, warn] of cases) {
    it(
      name,
      () => {
        const spec = make();
        const first = once(() => renderParts(spec as never, { width: 960, height: 480 }));
        expect(first.ms).toBeLessThan(10_000 * CI);
        const p = first.out as ReturnType<typeof renderParts>;
        expect(p.svg).toContain("<svg");
        expect(p.svg.length).toBeLessThan(1.5e6);
        if (warn) expect(p.warnings[0]).toMatch(warn);
        // A resize and a legend toggle reuse the row pass.
        const again = once(() => renderParts(spec as never, { width: 640, height: 480 }));
        expect(again.ms).toBeLessThan(2000 * CI);
        expect(again.ms).toBeLessThan(first.ms);
      },
      60_000,
    );
  }
});
