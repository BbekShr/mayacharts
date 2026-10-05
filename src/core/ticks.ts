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

const num = (v: string, i: number, k: number) => {
  let x = 0;
  for (const e = i + k; i < e; i++) {
    const d = v.charCodeAt(i) - 48;
    x = d >>> 0 > 9 ? NaN : x * 10 + d;
  }
  return x;
};
let day = "?"; // the last "YYYY-MM-DD" and its UTC ms: a series shares one for many rows
let dayMs = 0;
/**
 * What Date#toISOString writes ("2024-03-05T14:30:00Z", with ".000" before the Z), by arithmetic,
 * about ten times faster than Date.parse. Day <= 28 only; NaN: use the slow path.
 */
function plainIso(v: string): number {
  const n = v.length;
  if ((n !== 20 && n !== 24) || v[n - 1] !== "Z" || v[10] !== "T" || v[13] !== ":" || v[16] !== ":")
    return NaN;
  if (!v.startsWith(day)) {
    const [Y, M, D] = [num(v, 0, 4), num(v, 5, 2), num(v, 8, 2)];
    if (v[4] !== "-" || v[7] !== "-" || !(M >= 1 && M <= 12 && D >= 1 && D <= 28)) return NaN;
    const y = Y - (M <= 2 ? 1 : 0);
    const era = Math.floor(y / 400);
    const yoe = y - era * 400;
    const doy = Math.floor((153 * (M + (M > 2 ? -3 : 9)) + 2) / 5) + D - 1;
    dayMs = (era * 146097 + yoe * 365 + (yoe >> 2) - Math.floor(yoe / 100) + doy - 719468) * 864e5;
    day = v.slice(0, 10);
  }
  const [h, mi, s] = [num(v, 11, 2), num(v, 14, 2), num(v, 17, 2)];
  const ms = n === 24 ? (v[19] === "." ? num(v, 20, 3) : NaN) : 0;
  return h < 24 && mi < 60 && s < 60 && ms === ms
    ? dayMs + h * 36e5 + mi * 6e4 + s * 1e3 + ms
    : NaN;
}

/**
 * UTC ms of an ISO 8601 date ("2024-03", "2024-03-05", "2024-03-05T14:30[:00[.000]][Z|±hh:mm]");
 * a date-time without an offset is read as UTC. Finite numbers pass through as epoch ms only
 * when `ms` is true (xType "time"). Anything else: null.
 */
export function toTime(v: unknown, ms = true): number | null {
  // 8.64e15 is the Date range; beyond it every calendar helper gives NaN.
  if (typeof v === "number") return ms && Math.abs(v) <= 8.64e15 ? v : null;
  if (typeof v !== "string") return null;
  const q = plainIso(v);
  if (q === q) return q;
  if (!ISO.test(v)) return null;
  // A date-time without an offset is UTC. ISO matched, so a sign six from the end is an offset.
  const c = v.charCodeAt(v.length - 6);
  const t = Date.parse(
    v.length > 10 && v.charCodeAt(v.length - 1) !== 90 && c !== 43 && c !== 45 ? v + "Z" : v,
  );
  return Number.isNaN(t) ? null : t;
}

/**
 * About `target` ticks over [min, max] (UTC ms), each on a calendar boundary of one unit:
 * year (1, 2, 5, 10…), quarter, month (1, 2, 6), week (Mondays), day (1, 2), hour (1, 3, 6, 12),
 * minute (1, 5, 15, 30), second (1, 5, 15, 30). Ticks lie inside [min, max]; one-point
 * domains get the single tick at min. With `pad`, a year, quarter or month boundary that lies
 * outside [min, max] by less than half a tick interval is kept too (the caller clamps it to
 * the plot edge). Pure, UTC, no Date mutation leaks.
 */
export function timeTicks(min: number, max: number, target = 6, pad = false): TimeTicks {
  const H = 3600e3;
  const D = 864e5;
  const Y = 365.25 * D;
  const M = Y / 12;
  // [unit, approximate ms, multiples]; quarter is its own unit (3 months, Jan/Apr/Jul/Oct).
  const cand = (
    [
      ["year", Y, [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]],
      ["quarter", 3 * M, [1]],
      ["month", M, [1, 2, 6]],
      ["week", 7 * D, [1]],
      ["day", D, [1, 2]],
      ["hour", H, [1, 3, 6, 12]],
      ["minute", 6e4, [1, 5, 15, 30]],
      ["second", 1e3, [1, 5, 15, 30]],
    ] as [TimeUnit, number, number[]][]
  ).flatMap(([u, ms, es]) => es.map((e): [TimeUnit, number, number] => [u, e, e * ms]));
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
      const slack = pad ? ms / 2 : 0;
      let k =
        Math.ceil((d.getUTCFullYear() * 12 + d.getUTCMonth()) / step) * step - (pad ? step : 0);
      // The cap and the negated test stop the loop where Date turns NaN (beyond +-8.64e15).
      for (let n = 0; n < 1e4; n++, k += step) {
        const t = at(Math.floor(k / 12), ((k % 12) + 12) % 12);
        if (!(t <= max + slack)) break;
        if (t >= min - slack) out.push(t);
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
    if (values.filter((v) => v >= min && v <= max).length >= 2) return { values, unit, every };
  }
  const [unit, every] = best[0]!;
  return { values: [min], unit, every };
}
