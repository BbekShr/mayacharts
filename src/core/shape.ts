import { cbField, memo, OTHER } from "./svg.ts";
import { toTime } from "./ticks.ts";
import { MAX_MARKS, MAX_POINTS } from "./validate.ts";
import type { Aggregate, Cell, ResolvedSpec, Shaped, View } from "./types.ts";

/** Reducer for one aggregate; shared with hierarchy.ts. Empty: null (count: 0). A class: a million categories hold a million of these. */
class Reducer {
  n = 0;
  acc = 0;
  kind: Aggregate;
  constructor(kind: Aggregate) {
    this.kind = kind;
  }
  add(v: number) {
    const k = this.kind;
    this.acc =
      this.n++ === 0 || k === "sum" || k === "mean"
        ? this.acc + v
        : k === "min"
          ? Math.min(this.acc, v)
          : k === "max"
            ? Math.max(this.acc, v)
            : this.acc;
  }
  value(): number | null {
    return this.kind === "count"
      ? this.n
      : this.n === 0
        ? null
        : this.kind === "mean"
          ? this.acc / this.n
          : this.acc;
  }
}
export const agg = (kind: Aggregate): Reducer => new Reducer(kind);

interface Cat {
  label: string;
  vals: (number | null)[];
  y2?: number | null;
  /** Mean only: the count behind each value and behind y2, so the Other bucket can merge. */
  ns?: number[];
  n2?: number;
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

export function shape(
  s: ResolvedSpec,
  { hidden = [], window, plotWidth = Infinity }: Opts = {},
): Shaped {
  const series: string[] = [];
  const shown = () => series.flatMap((k, j) => (hidden.includes(k) ? [] : [j]));
  if (s.type === "scatter" || s.type === "units") {
    // Marks draw from rows: only the series list (and which are visible) is shared.
    if (s.series !== null) {
      const f = s.series;
      const keys = memo(s.data, `k${f}`, () => {
        const u = new Set<string>();
        for (const row of s.data) u.add(String(row[f]));
        return [...u];
      });
      for (const k of keys) series.push(k);
    } else if (s.data.length) series.push("");
    return {
      categories: [],
      totals: [],
      series,
      visible: shown(),
      cells: [],
      extent: [0, 0],
      y2: [],
      time: null,
      reduced: null,
      index: null,
      capped: null,
    };
  }
  // Points a time axis keeps per chart: one per 2 px, at most MAX_POINTS, shared by the series.
  // The width term steps by 50 (past 100) so a resize drag mostly reuses the cached reduction.
  const fit = Math.floor(Math.min(plotWidth, 1e6) / 2);
  const target = (n: number) =>
    Math.max(2, ~~Math.min(MAX_POINTS, fit - (fit < 100 ? 0 : fit % 50), 4000 / Math.max(1, n)));
  let cats: Cat[];
  let isTime = false;
  let reduced: Shaped["reduced"] = null;
  let capped: Shaped["capped"] = null;
  let index: number[] | null = null;
  const wf = s.type === "waterfall";
  const spans = new Map<Cat, [number, number]>();
  // The row pass (grouping, aggregation, time parse) is cached per data array: key = the fields it reads.
  const rk = JSON.stringify([
    s.x,
    wide(s) ? s.measures : s.y,
    s.y2,
    s.series,
    s.aggregate,
    s.xType,
  ]);
  const fast = fastTime(s, window, target(1), rk);
  if (fast) {
    ({ cats, reduced } = fast);
    isTime = true;
    series.push("");
  } else if (s.type === "funnel" && !s.x) {
    // Wide funnel: each measure is a stage (category = field name), its rows combined by aggregate.
    series.push("");
    cats = s.measures.map((m) => {
      const a = agg(s.aggregate);
      for (const row of s.data) if (typeof row[m] === "number") a.add(row[m]);
      return { label: m, vals: [a.value()] };
    });
  } else {
    // time axis: every label is ISO 8601 (xType "time" also takes epoch ms); sorted by time.
    const time =
      s.xType === "time" ||
      (s.xType === "auto" &&
        ["bar", "line", "area"].includes(s.type) &&
        !s.horizontal &&
        !s.sort &&
        s.limit === null);
    const base = memo(s.data, `b${rk}${time}`, () => group(s, time));
    for (const k of base.series) series.push(k);
    isTime = base.time;
    cats = base.cats;
    const total = (c: Cat) => c.vals.reduce<number>((a, v) => a + (v ?? 0), 0);
    // ponytail: a bar with more categories than MAX_MARKS keeps the top N (N from the plot width,
    // in steps of 10 so a resize does not recompute) and rolls the rest into Other; NON-FEATURES.
    let lim = s.limit;
    if (lim === null && s.type === "bar" && !isTime && cats.length * series.length > MAX_MARKS) {
      lim = Math.max(
        1,
        Math.min(
          10 * Math.floor(Math.max(40, plotWidth) / 40),
          Math.floor(MAX_MARKS / series.length) - 1,
        ),
      );
      capped = [lim, cats.length];
    }
    if (s.sort || (lim !== null && cats.length > lim))
      cats = memo(base.cats, `s${s.sort}${lim}${capped ? "a" : ""}`, () => {
        // Category totals and their sorted copy come once per row pass; a new limit (a resize
        // across a 40 px step) is then a selection and a merge, no row pass.
        // An auto roll-up ranks by magnitude, so a large negative bar is not hidden in Other.
        const { tot, r, asc } = memo(base.cats, capped ? "ta" : "t", () => {
          const tot = Float64Array.from(base.cats, total);
          const r = capped ? tot.map(Math.abs) : tot;
          return { tot, r, asc: Float64Array.from(r).sort() };
        });
        const d = s.sort === "asc" ? 1 : -1;
        const by = (ix: number[]) => (s.sort ? ix.sort((a, b) => d * (tot[a]! - tot[b]!)) : ix);
        const all = Array.from(base.cats.keys());
        if (lim === null || cats.length <= lim) return by(all).map((i) => base.cats[i]!);
        // The top `lim` by total, ties in category order: everything above the cut-off, then ties.
        const cut = asc[asc.length - lim]!;
        let ties = lim - asc.reduce((n, v) => n + +(v > cut), 0);
        const top = all.filter((i) => r[i]! > cut || (r[i] === cut && ties-- > 0));
        const kept = new Set(top);
        return [
          ...by(top).map((i) => base.cats[i]!),
          other(
            s,
            base.series,
            base.cats.filter((_, i) => !kept.has(i)),
          ),
        ];
      });

    // waterfall spans use running totals over every category, before the window.
    if (wf) {
      let run = 0;
      for (const c of cats) {
        if (s.totals.includes(c.label)) spans.set(c, [0, run]);
        else spans.set(c, [run, (run += total(c))]);
      }
    }
    const [i0, i1] = span(cats.length, window);
    const all = cats;
    if (i0 > 0 || i1 < cats.length - 1) cats = cats.slice(i0, i1 + 1);

    const catTarget = target(series.length);
    // A kpi sparkline draws one point per 4 px (kpi.ts thins to the same budget, so it keeps all
    // of these); a line or area thins past its width budget on a time axis, past MAX_POINTS on a
    // category axis.
    const kpi = s.type === "kpi";
    const budget = kpi
      ? Math.max(3, Math.floor((Math.min(plotWidth, 1e6) + 32) / 4) - 2)
      : catTarget;
    if (
      (kpi || s.type === "line" || s.type === "area") &&
      cats.length > (kpi || !isTime ? Math.max(budget, MAX_POINTS) : budget)
    ) {
      const before = cats.length;
      const sub = cats;
      const keep = memo(all, `r${i0},${i1},${budget},${isTime}`, () => {
        const k = reduceTime(
          isTime ? sub.map((c) => c.t!) : sub.map((_, i) => i),
          series.map((_, j) => sub.map((c) => c.vals[j] ?? null)),
          budget,
        );
        if (!kpi) return k;
        // The headline and its delta read the last two values: keep them (a null there is kept as a gap edge).
        const live = [sub.length - 2, sub.length - 1];
        return [...new Set([...k, ...live])].sort((x, y) => x - y);
      });
      if (!isTime) index = keep.map((k) => i0 + k);
      cats = keep.map((i) => cats[i]!);
      reduced = [cats.length, before];
    }
  }

  const visible = shown();
  const cells: Cell[] = [];
  let lo = 0;
  let hi = 0;
  cats.forEach((c, i) => {
    let pos = 0;
    let neg = 0;
    // ponytail: stack "percent" keeps only the share (no raw value for tooltips), NON-FEATURES.
    // stack "percent": shares of the category's visible total of magnitudes (0 when it is 0), so
    // negatives stack below 0 and the span is 1. Running sums are divided, not summed shares, so
    // an all-positive stack tops out at exactly 1.
    // Values are pre-divided by the series count so two 1e308 cells do not overflow the total.
    const d = s.stack === "percent" ? visible.length : 1;
    const k =
      (s.stack === "percent" && visible.reduce((a, j) => a + Math.abs((c.vals[j] ?? 0) / d), 0)) ||
      1;
    for (const j of visible) {
      const raw = c.vals[j] ?? null;
      const value = raw === null ? null : raw / d / k;
      const v = (raw ?? 0) / d;
      // Plain assignments: array destructuring is slow in V8's interpreter (first render).
      let y0 = wf ? spans.get(c)![0] : 0,
        y1 = wf ? spans.get(c)![1] : v;
      if (s.stack) {
        y0 = (v < 0 ? neg : pos) / k;
        y1 = (v < 0 ? (neg += v) : (pos += v)) / k;
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
    index: isTime ? cats.map((c) => c.i!) : index,
    capped,
  };
}

/** The Other bucket from the rolled-up categories' aggregates (a mean is weighted by its counts). */
function other(s: ResolvedSpec, series: string[], rest: Cat[]): Cat {
  const k = s.aggregate;
  const fold = (get: (c: Cat) => number | null, w: (c: Cat) => number) => {
    let acc: number | null = null;
    let n = 0;
    for (const c of rest) {
      const v = get(c);
      if (v === null) continue;
      const m = k === "mean" ? w(c) : 1;
      acc =
        acc === null
          ? v * m
          : k === "min"
            ? Math.min(acc, v)
            : k === "max"
              ? Math.max(acc, v)
              : acc + v * m;
      n += m;
    }
    return acc === null ? null : k === "mean" ? acc / n : acc;
  };
  return {
    label: OTHER,
    vals: series.map((_, j) =>
      fold(
        (c) => c.vals[j] ?? null,
        (c) => c.ns![j]!,
      ),
    ),
    y2:
      s.y2 === null
        ? null
        : fold(
            (c) => c.y2 ?? null,
            (c) => c.n2!,
          ),
  };
}

/** A kpi with a y array: each measure is a series (cell.si = measure index), thinned together. */
const wide = (s: ResolvedSpec) => s.type === "kpi" && s.measures.length > 1;

/**
 * The row pass: one reducer per (category, series) and one for y2 per category; pairs with no row
 * stay null. A time axis (when every label parses) is sorted by time.
 */
function group(s: ResolvedSpec, time: boolean) {
  const ms = wide(s) ? s.measures : null;
  const series: string[] = ms ? [...ms] : [];
  const si = new Map<string, number>();
  const ci = new Map<string, number>();
  const cats: Cat[] = [];
  const acc: { rs: ReturnType<typeof agg>[]; a2: ReturnType<typeof agg> | undefined }[] = [];
  for (const row of s.data) {
    if (s.xType === "time" && row[s.x] == null) continue; // String(null) is a label, not a date
    const c = String(row[s.x]);
    const sk = s.series === null ? "" : String(row[s.series]);
    let j = ms ? 0 : si.get(sk);
    if (j === undefined) si.set(sk, (j = series.push(sk) - 1));
    let k = ci.get(c);
    if (k === undefined) {
      ci.set(c, (k = cats.push({ label: c, vals: [] }) - 1));
      acc.push({ rs: [], a2: s.y2 === null ? undefined : agg(s.aggregate) });
    }
    const a = acc[k]!;
    if (ms)
      ms.forEach((m, j) => {
        const r = (a.rs[j] ??= agg(s.aggregate));
        const v = row[m];
        if (typeof v === "number") r.add(v);
      });
    else {
      const r = (a.rs[j] ??= agg(s.aggregate));
      const v = row[s.y];
      if (typeof v === "number") r.add(v);
    }
    if (s.y2 !== null) {
      const v2 = row[s.y2];
      if (typeof v2 === "number") a.a2!.add(v2);
    }
  }
  cats.forEach((c, k) => {
    c.vals = series.map((_, j) => acc[k]!.rs[j]?.value() ?? null);
    c.y2 = acc[k]!.a2?.value() ?? null;
    if (s.aggregate === "mean")
      ((c.ns = series.map((_, j) => acc[k]!.rs[j]?.n ?? 0)), (c.n2 = acc[k]!.a2?.n ?? 0));
  });
  let isTime = false;
  if (time && cats.length) {
    const ts: number[] = [];
    for (const c of cats) {
      const v = when(s, c.label);
      if (v === null) break;
      ts.push(v);
    }
    if (ts.length === cats.length) {
      isTime = true;
      cats.forEach((c, i) => (c.t = ts[i]!));
      cats.sort((a, b) => a.t! - b.t!);
      cats.forEach((c, i) => (c.i = i));
    }
  }
  return { cats, series, time: isTime };
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
  rk: string,
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
  const col = memo(rows, `f${rk}`, () => {
    const t = new Float64Array(rows.length);
    const v = new Float64Array(rows.length); // NaN: no value
    const at = new Int32Array(rows.length); // row of each category
    let m = 0;
    for (let i = 0; i < rows.length; i++) {
      const x = rows[i]![s.x];
      if (x == null && s.xType === "time") continue;
      const tm = when(s, String(x));
      const y = rows[i]![s.y];
      // A NaN number is not a gap: general path.
      if (tm === null || !Number.isFinite(tm) || (m && tm <= t[m - 1]!) || y !== y) return null;
      t[m] = tm;
      v[m] =
        typeof y === "number"
          ? s.aggregate === "count"
            ? 1
            : y + 0
          : s.aggregate === "count"
            ? 0
            : NaN;
      at[m++] = i;
    }
    return m ? { t: t.subarray(0, m), v: v.subarray(0, m), at } : null;
  });
  if (!col) return null;
  const [i0, i1] = span(col.t.length, window);
  const ts = col.t.subarray(i0, i1 + 1);
  const vs = col.v.subarray(i0, i1 + 1);
  const before = ts.length;
  const keep =
    before > target
      ? memo(rows, `k${rk},${i0},${i1},${target}`, () => reduceTime(ts, [vs], target))
      : Array.from(ts, (_, k) => k);
  return {
    cats: keep.map((k) => ({
      label: String(rows[col.at[i0 + k]!]![s.x]),
      vals: [vs[k]! === vs[k]! ? vs[k]! : null],
      t: ts[k]!,
      i: i0 + k,
    })),
    reduced: before > target ? [keep.length, before] : null,
  };
}

/** UTC ms of a category label: ISO 8601, or epoch ms digits under xType "time". */
const when = (s: ResolvedSpec, l: string) =>
  toTime(l, false) ?? (s.xType === "time" && /^-?\d+(\.\d+)?$/.test(l) ? +l : null);

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
  const dt = t[len - 1]! - t0 || 1;
  const xs = new Float64Array(len); // a loop: Float64Array.from with a callback is 10x slower
  for (let i = 0; i < len; i++) xs[i] = (t[i]! - t0) / dt;
  const ys = new Float64Array(len);
  const keep = new Set<number>([0, len - 1]);
  const pin = new Set<number>([0, len - 1]); // first, last and each series' min and max survive
  for (const v of vs) {
    // Finite numbers only (null and NaN are gaps): x - x is 0 for those and NaN for the rest.
    const has = (i: number) => {
      const x = v[i];
      return x !== null && x! - x! === 0;
    };
    let lo = -1;
    let hi = -1;
    let [vl, vh] = [Infinity, -Infinity];
    let n = 0;
    for (let i = 0; i < len; i++) {
      const x = v[i];
      if (x === null || x! - x! !== 0) continue;
      n++;
      if (x! < vl) ((vl = x!), (lo = i));
      if (x! > vh) ((vh = x!), (hi = i));
    }
    if (!n) continue;
    keep.add(lo).add(hi);
    pin.add(lo).add(hi);
    const [vmin, vmax] = [v[lo]!, v[hi]!];
    let start = -1;
    for (let i = 0; i <= len; i++) {
      if (i < len && has(i)) {
        ys[i] = (v[i]! - vmin) / (vmax - vmin || 1);
        if (start < 0) start = i;
      } else if (start >= 0) {
        if (i < len) keep.add(i); // a gap marker, kept as the run ends
        // This run's share of the series' budget (min and max take two).
        const share = Math.max(3, Math.round(((per - 2) * (i - start)) / n));
        for (const k of lttb(xs, ys, start, i - start, share)) keep.add(k);
        start = -1;
      }
    }
  }
  // Many series or sparse runs can still overshoot: keep the pins, fill the rest evenly spaced.
  const u = [...keep].sort((a, b) => a - b);
  const n = Math.max(2, catTarget);
  if (u.length <= n) return u;
  if (pin.size >= n)
    return Array.from({ length: n }, (_, k) => u[Math.round((k * (u.length - 1)) / (n - 1))]!);
  const rest = u.filter((i) => !pin.has(i));
  const room = n - pin.size;
  const picked = Array.from(
    { length: room },
    (_, k) => rest[Math.floor(((k + 0.5) * rest.length) / room)]!,
  );
  return [...pin, ...picked].sort((a, b) => a - b);
}

/** A field (default: the colorBy field; also spec.was) aggregated per (category, series) like the marks; null without one. */
export function colorVals(
  s: ResolvedSpec,
  cb: string | null = cbField(s),
): (c: string, ser: string) => number | null {
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

/**
 * Indexes to draw from `cols` (equal-length value arrays, null = gap): every position, or when
 * there are more than `max`, the reduceTime pick over evenly spaced positions.
 */
export function thin(cols: readonly (readonly (number | null)[])[], max: number): number[] {
  const all = [...Array(cols[0]?.length ?? 0).keys()];
  return all.length <= max ? all : reduceTime(all, cols, max);
}
