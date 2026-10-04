import type { Ticks, TimeTicks, TimeUnit } from "./types.ts";

const clean = (n: number) => parseFloat(n.toPrecision(12));

export function niceTicks(min: number, max: number, target = 5): Ticks {
  if (max === min) {
    [min, max] = min === 0 ? [0, 1] : [min - 1, max + 1];
  }
  const base = 10 ** Math.floor(Math.log10((max - min) / target));
  let step = base;
  let best = Infinity;
  // Crossing zero, a coarse step pads the short side by a whole step (stacked negatives
  // reaching -200 for -40), so take the tightest domain with up to target + 3 ticks instead.
  const cross = min < 0 && max > 0;
  for (const m of [1, 2, 2.5, 5, 10]) {
    const s = base * m;
    const lo = Math.floor(min / s + 1e-9);
    const n = Math.ceil(max / s - 1e-9) - lo + 1;
    const score = cross
      ? n > target + 3
        ? Infinity
        : (n - 1 + Math.abs(n - target) / 1e3) * s
      : Math.abs(n - target);
    if (score < best - 1e-9 * Math.abs(score)) {
      best = score;
      step = s;
    }
  }
  const lo = Math.floor(min / step + 1e-9);
  const hi = Math.ceil(max / step - 1e-9);
  const values: number[] = [];
  for (let i = lo; i <= hi; i++) values.push(clean(i * step));
  return { domain: [clean(lo * step), clean(hi * step)], values, step: clean(step) };
}

const ISO =
  /^\d{4}-\d{2}(?:-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?)?$/;

/**
 * UTC ms of an ISO 8601 date ("2024-03", "2024-03-05", "2024-03-05T14:30[:00[.000]][Z|±hh:mm]");
 * a date-time without an offset is read as UTC. Finite numbers pass through as epoch ms only
 * when `ms` is true (xType "time"). Anything else: null.
 */
export function toTime(v: unknown, ms = true): number | null {
  if (typeof v === "number") return ms && Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const m = ISO.exec(v);
  if (!m) return null;
  const t = Date.parse(v.length > 10 && m[1] === undefined ? v + "Z" : v);
  return Number.isNaN(t) ? null : t;
}

/**
 * About `target` ticks over [min, max] (UTC ms), each on a calendar boundary of one unit:
 * year (1, 2, 5, 10…), quarter, month (1, 2, 6), week (Mondays), day (1, 2), hour (1, 3, 6, 12),
 * minute (1, 5, 15, 30), second (1, 5, 15, 30). Ticks lie inside [min, max]; one-point
 * domains get the single tick at min. Pure, UTC, no Date mutation leaks.
 */
export function timeTicks(min: number, max: number, target = 6): TimeTicks {
  const H = 3600e3;
  // [unit, every, approximate ms]; quarter is its own unit (3 months, Jan/Apr/Jul/Oct).
  const D = 864e5;
  const Y = 365.25 * D;
  const M = Y / 12;
  const cand: [TimeUnit, number, number][] = [
    ...[1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].map((e): [TimeUnit, number, number] => [
      "year",
      e,
      e * Y,
    ]),
    ["quarter", 1, 3 * M],
    ...[1, 2, 6].map((e): [TimeUnit, number, number] => ["month", e, e * M]),
    ["week", 1, 7 * D],
    ...[1, 2].map((e): [TimeUnit, number, number] => ["day", e, e * D]),
    ...[1, 3, 6, 12].map((e): [TimeUnit, number, number] => ["hour", e, e * H]),
    ...[1, 5, 15, 30].map((e): [TimeUnit, number, number] => ["minute", e, e * 6e4]),
    ...[1, 5, 15, 30].map((e): [TimeUnit, number, number] => ["second", e, e * 1e3]),
  ];
  const span = max - min;
  if (!(span > 0)) return { values: [min], unit: "day", every: 1 };
  const score = (c: (typeof cand)[number]) => Math.abs(span / c[2] - target);
  const at = (y: number, m: number) => {
    const d = new Date(0);
    d.setUTCFullYear(y, m, 1);
    return d.getTime();
  };
  const gen = (unit: TimeUnit, every: number, ms: number): number[] => {
    const out: number[] = [];
    if (unit === "year" || unit === "quarter" || unit === "month") {
      // Count months since year 0 so every N aligns the same way across years.
      const step = unit === "year" ? 12 * every : unit === "quarter" ? 3 : every;
      const d = new Date(min);
      let k = Math.ceil((d.getUTCFullYear() * 12 + d.getUTCMonth()) / step) * step;
      for (; ; k += step) {
        const t = at(Math.floor(k / 12), k % 12);
        if (t > max) break;
        if (t >= min) out.push(t);
      }
    } else {
      const step = unit === "week" ? 7 * D : ms;
      // Epoch day 4 (1970-01-05) is a Monday.
      const off = unit === "week" ? 4 * D : 0;
      for (let t = Math.ceil((min - off) / step) * step + off; t <= max; t += step) out.push(t);
    }
    return out;
  };
  const best = cand.sort((a, b) => score(a) - score(b)).slice(0, 4);
  for (const [unit, every, ms] of best) {
    const values = gen(unit, every, ms);
    if (values.length >= 2) return { values, unit, every };
  }
  const [unit, every] = best[0]!;
  return { values: [min], unit, every };
}
