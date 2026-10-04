import type { BandScale, LinearScale, TimeScale } from "./types.ts";

export function bandScale(
  domain: readonly string[],
  range: readonly [number, number],
  padInner = 0.2,
  padOuter = 0.1,
): BandScale {
  const n = domain.length;
  const span = range[1] - range[0];
  const step = span / (n - padInner + padOuter * 2) || 1;
  const start = range[0] + (span - step * (n - padInner)) / 2;
  return { domain, step, bandwidth: step * (1 - padInner), at: (i) => start + step * i };
}

export function linearScale(
  domain: readonly [number, number],
  range: readonly [number, number],
): LinearScale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  return { domain, range, of: (v) => (d1 === d0 ? (r0 + r1) / 2 : r0 + (v - d0) * k) };
}

/**
 * Time scale over UTC ms `t` (ascending, parallel to `domain`). Band centres sit at their time;
 * the range is inset by half a band so the first and last bands stay inside it. `bandwidth` is
 * 0.8 of the smallest gap in px, capped at 72 (bar width ceiling), at least 1.
 */
export function timeScale(
  domain: readonly string[],
  t: readonly number[],
  range: readonly [number, number],
): TimeScale {
  void domain;
  void t;
  void range;
  throw new Error("timeScale: not implemented");
}
