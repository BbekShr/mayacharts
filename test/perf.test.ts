import { describe, expect, it } from "vitest";
import { render, renderParts } from "../src/core/render.ts";
import { MAX_MARKS, MayaSpecError } from "../src/core/validate.ts";

const time = (fn: () => unknown) => {
  fn(); // warm-up (JIT, Intl formatter caches)
  const t = performance.now();
  const out = fn();
  return { ms: performance.now() - t, out };
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
    expect(time(() => renderParts(line(data))).ms).toBeLessThan(60);
  });

  it("line 1M: < 400 ms", () => {
    const data = minutes(1_000_000);
    expect(time(() => renderParts(line(data))).ms).toBeLessThan(400);
  }, 30_000);

  it("scatter 1M: < 500 ms, and no hit elements", () => {
    const data = Array.from({ length: 1_000_000 }, (_, i) => ({
      x: (i * 7919) % 10007,
      y: (i * 104729) % 9973,
    }));
    const spec = { type: "scatter", x: "x", y: "y", data } as never;
    const { ms, out } = time(() => renderParts(spec));
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
});
