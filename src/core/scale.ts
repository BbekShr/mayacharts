import type { BandScale, LinearScale, TimeScale } from "./types.ts";

export const TAU = Math.PI * 2;
/** Degrees per radian. */
export const DEG = 180 / Math.PI;

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
  log = false,
): LinearScale {
  // Log: the domain stays in data units (positive); `of` maps log10, and a value at or below 0 sits on the low edge.
  const f = (v: number) => (log ? Math.log10(Math.max(v, domain[0])) : v);
  const [d0, d1] = domain.map(f) as [number, number];
  const [r0, r1] = range;
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  return {
    domain,
    range,
    ...(log ? { log } : {}),
    of: (v) => (d1 === d0 ? (r0 + r1) / 2 : r0 + (f(v) - d0) * k),
  };
}

const monthStart = (ms: number) => ms % 864e5 === 0 && new Date(ms).getUTCDate() === 1;

/** Fractional months since the epoch, piecewise linear inside each month. */
function monthIndex(ms: number): number {
  const a = new Date(ms);
  a.setUTCDate(1);
  a.setUTCHours(0, 0, 0, 0);
  const b = new Date(a);
  b.setUTCMonth(b.getUTCMonth() + 1);
  return a.getUTCFullYear() * 12 + a.getUTCMonth() + (ms - +a) / (+b - +a);
}

/**
 * Time scale over UTC ms `t` (ascending, parallel to `domain`). Band centres sit at their time,
 * except when every t is a UTC month start (so also quarter and year starts): then positions
 * follow the calendar month index, so months are evenly spaced and a missing one leaves one slot;
 * the range is inset by half a band so the first and last bands stay inside it. `bandwidth` is
 * 0.8 of the smallest gap in px, capped at 72 (bar width ceiling), at least 1.
 */
export function timeScale(
  domain: readonly string[],
  t: readonly number[],
  range: readonly [number, number],
): TimeScale {
  const [r0, r1] = range;
  const w = r1 - r0;
  const cal = t.length > 1 && t.every(monthStart);
  const pos = (ms: number) => (cal ? monthIndex(ms) : ms);
  t = t.map(pos);
  const n = t.length;
  const span = n > 1 ? t[n - 1]! - t[0]! : 0;
  let gap = Infinity;
  for (let i = 1; i < n; i++) {
    const g = t[i]! - t[i - 1]!;
    if (g > 0 && g < gap) gap = g;
  }
  // Band b = 0.8 * (smallest gap in px) once the range is inset by b / 2 per side.
  const b = Number.isFinite(gap) ? (0.8 * gap * w) / (span + 0.8 * gap) : 0.8 * w;
  const bandwidth = Math.max(1, Math.min(72, b));
  const k = span > 0 ? (w - bandwidth) / span : 0;
  const of = (ms: number) => (span > 0 ? r0 + bandwidth / 2 + (pos(ms) - t[0]!) * k : r0 + w / 2);
  return {
    kind: "time",
    domain,
    step: bandwidth / 0.8,
    bandwidth,
    at: (i) => (span > 0 ? r0 + bandwidth / 2 + (t[i]! - t[0]!) * k : r0 + w / 2) - bandwidth / 2,
    of,
  };
}

/**
 * spec.colorScale for a value ramp (heatmap, hexmap): q(v) is the data-q step 0..9, `breaks` the
 * legend's values ([lo, hi]; quantile with distinct class breaks: [lo, ...breaks, hi]), `labels` the
 * values to print along a gradient legend (rank: lowest, median, highest distinct value; else the
 * breaks) and `steps` the data-q of each quantile class swatch (null when the legend is a gradient).
 * linear: by value (with `mid`, diverging: mid at the centre, the farther end at its end, so equal
 * distances get equal steps); log: by log10 (values above 0); rank: by position among the distinct
 * values; quantile: up to up to five equal-count classes (ties merge), ties collapsed (so fewer classes when values
 * repeat), steps spread over the real class count. One distinct value: step 9.
 */
export function ramp(
  values: readonly number[],
  kind: "linear" | "rank" | "quantile" | "log" = "linear",
  mid: number | null = null,
): { q(v: number): number; breaks: number[]; labels: number[]; steps: number[] | null } {
  const all = [...values].sort((a, b) => a - b);
  const [lo, hi] = [all[0] ?? 0, all.at(-1) ?? 0];
  const step = (p: number) => (hi > lo ? Math.min(9, Math.max(0, Math.floor(p * 10))) : 9);
  if (kind === "rank") {
    const u = [...new Set(all)];
    const at = new Map(u.map((v, i) => [v, i / Math.max(1, u.length - 1)]));
    return {
      q: (v) => step(at.get(v) ?? 0),
      breaks: [lo, hi],
      labels: u.length > 2 ? [lo, u[Math.round((u.length - 1) / 2)]!, hi] : [lo, hi],
      steps: null,
    };
  }
  if (kind === "quantile") {
    // ponytail: at most five classes; more need a class count option.
    const d = [...new Set([1, 2, 3, 4].map((k) => all[Math.floor((k * all.length) / 5)]!))].filter(
      (x) => x > lo && x < hi,
    );
    const cut = d.length ? d : [hi];
    const breaks = d.length ? [lo, ...d, hi] : [lo, hi];
    return {
      q: (v) => (hi > lo ? Math.round((cut.filter((x) => v >= x).length * 9) / cut.length) : 9),
      breaks,
      labels: breaks,
      steps: d.length ? cut.concat(0).map((_, k) => Math.round((k * 9) / cut.length)) : null,
    };
  }
  const f = kind === "log" ? Math.log10 : (v: number) => v;
  const m = mid === null || kind === "log" ? null : Math.max(hi - mid, mid - lo) || 1;
  return {
    q: (v) => step(m === null ? (f(v) - f(lo)) / (f(hi) - f(lo)) : 0.5 + (v - mid!) / (2 * m)),
    breaks: [lo, hi],
    labels: [lo, hi],
    steps: null,
  };
}
