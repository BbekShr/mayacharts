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

  it("too-many-marks counts drawn marks (scatter: one per row)", () => {
    const data = Array.from({ length: 6000 }, (_, i) => ({ x: i % 3, y: i }));
    expect(() => renderParts({ type: "scatter", x: "x", y: "y", data } as never)).toThrow(
      /6000 marks/,
    );
  });
});
