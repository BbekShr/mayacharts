import { OTHER } from "./svg.ts";
import { toTime } from "./ticks.ts";
import { MAX_POINTS } from "./validate.ts";
import type { Aggregate, Cell, ResolvedSpec, Shaped, View } from "./types.ts";

/** Reducer for one aggregate; shared with hierarchy.ts. Empty: null (count: 0). */
export function agg(kind: Aggregate): { add(v: number): void; value(): number | null } {
  let n = 0;
  let acc = 0;
  return {
    add(v) {
      acc =
        n === 0 || kind === "sum" || kind === "mean"
          ? acc + v
          : kind === "min"
            ? Math.min(acc, v)
            : kind === "max"
              ? Math.max(acc, v)
              : acc;
      n++;
    },
    value: () => (kind === "count" ? n : n === 0 ? null : kind === "mean" ? acc / n : acc),
  };
}

type R = readonly [si: number, v: unknown, v2?: unknown];
interface Cat {
  label: string;
  rows: R[];
  vals: (number | null)[];
  y2?: number | null;
  /** UTC ms on a time axis. */
  t?: number;
  /** Position in the time-ordered list, before window and reduction. */
  i?: number;
}

interface Opts {
  hidden?: readonly string[];
  window?: View["window"];
  /** Estimated plot width in px: a time axis keeps at most one point per 2 px. */
  plotWidth?: number;
}

export function shape(s: ResolvedSpec, o: Opts | readonly string[] = {}): Shaped {
  const {
    hidden = [],
    window,
    plotWidth = Infinity,
  }: Opts = Array.isArray(o) ? { hidden: o } : (o as Opts);
  const series: string[] = [];
  const si = new Map<string, number>();
  if (s.type === "scatter") {
    // Marks draw from rows: only the series list (and which are visible) is shared.
    if (s.series !== null)
      for (const row of s.data) {
        const sk = String(row[s.series]);
        if (!si.has(sk)) si.set(sk, series.push(sk) - 1);
      }
    else if (s.data.length) series.push("");
    const visible: number[] = [];
    series.forEach((k, j) => hidden.includes(k) || visible.push(j));
    return {
      categories: [],
      totals: [],
      series,
      visible,
      cells: [],
      extent: [0, 0],
      y2: [],
      time: null,
      reduced: null,
      index: null,
    };
  }
  // Points a time axis keeps per chart: one per 2 px, at most MAX_POINTS, shared by the series.
  const target = (n: number) =>
    Math.max(2, Math.min(MAX_POINTS, Math.floor(plotWidth / 2), Math.floor(4000 / Math.max(1, n))));
  let cats: Cat[];
  let isTime = false;
  let reduced: Shaped["reduced"] = null;
  const wf = s.type === "waterfall";
  const spans = new Map<Cat, [number, number]>();
  const fast = fastTime(s, window, target(1));
  if (fast) {
    ({ cats, reduced } = fast);
    isTime = true;
    series.push("");
  } else {
    const ci = new Map<string, Cat>();
    for (const row of s.data) {
      if (s.xType === "time" && row[s.x] == null) continue; // String(null) is a label, not a date
      const c = String(row[s.x]);
      const sk = s.series === null ? "" : String(row[s.series]);
      let j = si.get(sk);
      if (j === undefined) si.set(sk, (j = series.push(sk) - 1));
      let cat = ci.get(c);
      if (!cat) ci.set(c, (cat = { label: c, rows: [], vals: [] }));
      cat.rows.push([j, row[s.y], s.y2 === null ? undefined : row[s.y2]]);
    }
    // aggregate: one reducer per (category, series); pairs with no row stay null.
    const reduce = (rows: readonly R[]) => {
      const rs = new Map<number, ReturnType<typeof agg>>();
      for (const [j, v] of rows) {
        let r = rs.get(j);
        if (!r) rs.set(j, (r = agg(s.aggregate)));
        if (typeof v === "number") r.add(v);
      }
      return series.map((_, j) => rs.get(j)?.value() ?? null);
    };
    // y2: one reducer over every row of the category, whatever the series.
    const reduce2 = (c: Cat) => {
      const a = agg(s.aggregate);
      for (const [, , v] of c.rows) if (typeof v === "number") a.add(v);
      c.y2 = a.value();
    };
    cats = [...ci.values()];
    for (const c of cats) {
      c.vals = reduce(c.rows);
      reduce2(c);
    }
    const total = (c: Cat) => c.vals.reduce<number>((a, v) => a + (v ?? 0), 0);

    // time axis: every label is ISO 8601 (xType "time" also takes epoch ms); sorted by time.
    const parse = (l: string) =>
      toTime(l, false) ?? (s.xType === "time" && /^-?\d+(\.\d+)?$/.test(l) ? +l : null);
    const time =
      s.xType === "time" ||
      (s.xType === "auto" &&
        ["bar", "line", "area"].includes(s.type) &&
        !s.horizontal &&
        !s.sort &&
        s.limit === null);
    if (time && cats.length) {
      const ts = cats.map((c) => parse(c.label));
      if (ts.every((v) => v !== null)) {
        isTime = true;
        cats.forEach((c, i) => (c.t = ts[i]!));
        cats.sort((a, b) => a.t! - b.t!);
        cats.forEach((c, i) => (c.i = i));
      }
    }

    if (s.sort) {
      const d = s.sort === "asc" ? 1 : -1;
      cats = cats
        .map((c) => [c, total(c)] as const)
        .sort((a, b) => d * (a[1] - b[1]))
        .map((p) => p[0]);
    }
    if (s.limit !== null && cats.length > s.limit) {
      const top = new Set(
        cats
          .map((c) => [c, total(c)] as const)
          .sort((a, b) => b[1] - a[1])
          .slice(0, s.limit)
          .map((p) => p[0]),
      );
      const rest = cats.filter((c) => !top.has(c));
      const other: Cat = {
        label: OTHER,
        rows: rest.flatMap((c) => c.rows),
        vals: [],
      };
      other.vals = reduce(other.rows);
      reduce2(other);
      cats = [...cats.filter((c) => top.has(c)), other];
    }

    // waterfall spans use running totals over every category, before the window.
    if (wf) {
      let run = 0;
      for (const c of cats) {
        if (s.totals.includes(c.label)) spans.set(c, [0, run]);
        else spans.set(c, [run, (run += total(c))]);
      }
    }
    const [i0, i1] = span(cats.length, window);
    cats = cats.slice(i0, i1 + 1);

    const catTarget = target(series.length);
    if (isTime && (s.type === "line" || s.type === "area") && cats.length > catTarget) {
      const before = cats.length;
      const keep = reduceTime(
        cats.map((c) => c.t!),
        series.map((_, j) => cats.map((c) => c.vals[j] ?? null)),
        catTarget,
      );
      cats = keep.map((i) => cats[i]!);
      reduced = [cats.length, before];
    }
  }

  const visible: number[] = [];
  series.forEach((k, j) => hidden.includes(k) || visible.push(j));
  const cells: Cell[] = [];
  let lo = 0;
  let hi = 0;
  cats.forEach((c, i) => {
    let pos = 0;
    let neg = 0;
    for (const j of visible) {
      const value = c.vals[j] ?? null;
      const v = value ?? 0;
      let [y0, y1] = wf ? spans.get(c)! : [0, v];
      if (s.stack) {
        if (v < 0) [y0, y1] = [neg, (neg += v)];
        else [y0, y1] = [pos, (pos += v)];
      }
      lo = Math.min(lo, y0, y1);
      hi = Math.max(hi, y0, y1);
      cells.push({ ci: i, si: j, value, y0, y1 });
    }
  });
  return {
    categories: cats.map((c) => c.label),
    totals: cats.map((c) => s.totals.includes(c.label)),
    series,
    visible,
    cells,
    extent: [lo, hi],
    y2: s.y2 === null ? [] : cats.map((c) => c.y2 ?? null),
    time: isTime ? cats.map((c) => c.t!) : null,
    reduced,
    index: isTime ? cats.map((c) => c.i!) : null,
  };
}

/** Inclusive index range of `n` categories inside view.window ([i0, i1]; other lengths ignored). */
const span = (n: number, w: View["window"]): [number, number] => {
  if (w?.length !== 2 || !n) return [0, n - 1];
  const i1 = Math.min(n - 1, Math.max(0, Math.trunc(w[1])));
  return [Math.min(i1, Math.max(0, Math.trunc(w[0]))), i1];
};

/**
 * Time axis fast path for the common case: line or area, one series, no y2, sort or limit, and
 * every x a distinct ISO date in increasing order (so each row is its own category). Typed
 * arrays instead of the category Map, per-category reducers and sort; Cat objects are built
 * only for the kept indexes. Output equals the general path's. Anything else: null.
 */
function fastTime(
  s: ResolvedSpec,
  window: View["window"],
  target: number,
): { cats: Cat[]; reduced: Shaped["reduced"] } | null {
  if (
    (s.type !== "line" && s.type !== "area") ||
    s.series !== null ||
    s.y2 !== null ||
    s.limit !== null ||
    s.sort ||
    s.horizontal ||
    !(s.xType === "time" || s.xType === "auto")
  )
    return null;
  const rows = s.data;
  const t = new Float64Array(rows.length);
  const v = new Float64Array(rows.length); // NaN: no value
  const at = new Int32Array(rows.length); // row of each category
  const count = s.aggregate === "count";
  let m = 0;
  for (let i = 0; i < rows.length; i++) {
    const x = rows[i]![s.x];
    if (x == null && s.xType === "time") continue;
    const l = typeof x === "string" ? x : String(x);
    const tm = toTime(l, false) ?? (s.xType === "time" && NUM.test(l) ? +l : null);
    if (tm === null || !Number.isFinite(tm) || (m && tm <= t[m - 1]!)) return null;
    const y = rows[i]![s.y];
    if (typeof y === "number" && y !== y) return null; // a NaN number is not a gap: general path
    t[m] = tm;
    v[m] = typeof y === "number" ? (count ? 1 : y + 0) : count ? 0 : NaN;
    at[m++] = i;
  }
  if (!m) return null;
  const [i0, i1] = span(m, window);
  const ts = t.subarray(i0, i1 + 1);
  const vs = v.subarray(i0, i1 + 1);
  const before = ts.length;
  const reduce = before > target;
  const keep = reduce ? reduceTime(ts, [vs], target) : Array.from(ts, (_, k) => k);
  return {
    cats: keep.map((k) => ({
      label: String(rows[at[i0 + k]!]![s.x]),
      rows: [],
      vals: [vs[k]! === vs[k]! ? vs[k]! : null],
      t: ts[k]!,
      i: i0 + k,
    })),
    reduced: reduce ? [keep.length, before] : null,
  };
}

const NUM = /^-?\d+(\.\d+)?$/;

/**
 * Largest-triangle-three-buckets over x[s..s+m) and y[s..s+m) (both normalised to 0..1);
 * returns the absolute indexes kept, first and last included.
 */
function lttb(x: ArrayLike<number>, y: ArrayLike<number>, s: number, m: number, n: number) {
  if (n >= m) return Array.from({ length: m }, (_, i) => s + i);
  const out = [s];
  const every = (m - 2) / (n - 2);
  let a = s;
  for (let i = 0; i < n - 2; i++) {
    const b0 = Math.floor(i * every) + 1 + s;
    const b1 = Math.floor((i + 1) * every) + 1 + s;
    const b2 = Math.min(Math.floor((i + 2) * every) + 1, m) + s;
    let cx = 0;
    let cy = 0;
    for (let j = b1; j < b2; j++) ((cx += x[j]!), (cy += y[j]!));
    cx /= b2 - b1;
    cy /= b2 - b1;
    let best = -1;
    let at = b0;
    for (let j = b0; j < b1; j++) {
      const area = Math.abs((x[a]! - cx) * (y[j]! - y[a]!) - (x[a]! - x[j]!) * (cy - y[a]!));
      if (area > best) ((best = area), (at = j));
    }
    out.push(at);
    a = at;
  }
  out.push(s + m - 1);
  return out;
}

/**
 * Category indexes to keep (ascending) when a time axis has more than `catTarget`. `t` is the
 * UTC ms per category, `vs` one value array per series (null or NaN: no value). Per series:
 * LTTB over each run of values plus the series' min and max; the first null after a run is kept
 * so gaps survive. The result is the union over series.
 */
function reduceTime(
  t: ArrayLike<number>,
  vs: readonly ArrayLike<number | null>[],
  catTarget: number,
): number[] {
  const len = t.length;
  const per = Math.max(3, Math.floor(catTarget / vs.length));
  const t0 = t[0]!;
  const span = t[len - 1]! - t0 || 1;
  const xs = Float64Array.from({ length: len }, (_, i) => (t[i]! - t0) / span);
  const ys = new Float64Array(len);
  const keep = new Set<number>([0, len - 1]);
  for (const v of vs) {
    const has = (i: number) => v[i] != null && v[i] === v[i];
    const runs: number[] = []; // start, length pairs
    let lo = -1;
    let hi = -1;
    let n = 0;
    let start = -1;
    for (let i = 0; i < len; i++) {
      if (!has(i)) {
        if (start >= 0) (keep.add(i), runs.push(start, i - start)); // a gap marker, kept as the run ends
        start = -1;
        continue;
      }
      if (start < 0) start = i;
      n++;
      if (lo < 0 || v[i]! < v[lo]!) lo = i;
      if (hi < 0 || v[i]! > v[hi]!) hi = i;
    }
    if (start >= 0) runs.push(start, len - start);
    if (lo < 0) continue;
    keep.add(lo).add(hi);
    const [vmin, vmax] = [v[lo]!, v[hi]!];
    for (let i = 0; i < len; i++) if (has(i)) ys[i] = (v[i]! - vmin) / (vmax - vmin || 1);
    for (let r = 0; r < runs.length; r += 2) {
      const [s0, m] = [runs[r]!, runs[r + 1]!];
      // This run's share of the series' budget (min and max take two).
      const share = Math.max(3, Math.round(((per - 2) * m) / n));
      for (const k of lttb(xs, ys, s0, m, share)) keep.add(k);
    }
  }
  // Many series or sparse runs can still overshoot: first, last and evenly spaced indexes.
  const u = [...keep].sort((a, b) => a - b);
  const n = Math.max(2, catTarget);
  return u.length <= n
    ? u
    : Array.from({ length: n }, (_, k) => u[Math.round((k * (u.length - 1)) / (n - 1))]!);
}

/** colorBy field aggregated per (category, series) like the marks; null without a field colorBy. */
export function colorVals(s: ResolvedSpec): (c: string, ser: string) => number | null {
  const cb = typeof s.colorBy === "string" && s.colorBy !== "sign" ? s.colorBy : null;
  const m = new Map<string, ReturnType<typeof agg>>();
  if (cb)
    for (const row of s.data) {
      const v = row[cb];
      if (typeof v !== "number") continue;
      const k = String(row[s.x]) + "\0" + (s.series === null ? "" : String(row[s.series]));
      (m.get(k) ?? m.set(k, agg(s.aggregate)).get(k)!).add(v);
    }
  return (c, ser) => m.get(c + "\0" + ser)?.value() ?? null;
}
