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
}

export function shape(s: ResolvedSpec, o: Opts | readonly string[] = {}): Shaped {
  const { hidden = [], window }: Opts = Array.isArray(o) ? { hidden: o } : (o as Opts);
  const series: string[] = [];
  const si = new Map<string, number>();
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
  let cats = [...ci.values()];
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
  let isTime = false;
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
  const wf = s.type === "waterfall";
  const spans = new Map<Cat, [number, number]>();
  if (wf) {
    let run = 0;
    for (const c of cats) {
      if (s.totals.includes(c.label)) spans.set(c, [0, run]);
      else spans.set(c, [run, (run += total(c))]);
    }
  }
  if (window?.length === 2 && cats.length) {
    const i1 = Math.min(cats.length - 1, Math.max(0, Math.trunc(window[1])));
    const i0 = Math.min(i1, Math.max(0, Math.trunc(window[0])));
    cats = cats.slice(i0, i1 + 1);
  }

  let reduced: Shaped["reduced"] = null;
  const catTarget = Math.min(MAX_POINTS, Math.floor(4000 / Math.max(1, series.length)));
  if (isTime && (s.type === "line" || s.type === "area") && cats.length > catTarget) {
    const before = cats.length;
    const keep = reduceTime(cats, series.length, catTarget);
    cats = keep.map((i) => cats[i]!);
    reduced = [cats.length, before];
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

/**
 * Largest-triangle-three-buckets over one run of points (x, y normalised to 0..1); returns the
 * indexes kept, first and last included.
 */
function lttb(x: number[], y: number[], n: number): number[] {
  const m = x.length;
  if (n >= m) return x.map((_, i) => i);
  const out = [0];
  const every = (m - 2) / (n - 2);
  let a = 0;
  for (let i = 0; i < n - 2; i++) {
    const b0 = Math.floor(i * every) + 1;
    const b1 = Math.floor((i + 1) * every) + 1;
    const b2 = Math.min(Math.floor((i + 2) * every) + 1, m);
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
  out.push(m - 1);
  return out;
}

/**
 * Category indexes to keep (ascending) when a time axis has more than `catTarget`. Per series:
 * LTTB over each run of non-null values plus the series' min and max; the first null after a run
 * is kept so gaps survive. The result is the union over series.
 */
function reduceTime(cats: readonly Cat[], nSeries: number, catTarget: number): number[] {
  const per = Math.max(3, Math.floor(catTarget / nSeries));
  const t0 = cats[0]!.t!;
  const span = cats.at(-1)!.t! - t0 || 1;
  const keep = new Set<number>([0, cats.length - 1]);
  for (let j = 0; j < nSeries; j++) {
    const runs: number[][] = [];
    let lo = -1;
    let hi = -1;
    let run: number[] | null = null;
    cats.forEach((c, i) => {
      const v = c.vals[j] ?? null;
      if (v === null) {
        if (run) keep.add(i); // a gap marker, kept as the run ends
        run = null;
        return;
      }
      if (!run) runs.push((run = []));
      run.push(i);
      if (lo < 0 || v < cats[lo]!.vals[j]!) lo = i;
      if (hi < 0 || v > cats[hi]!.vals[j]!) hi = i;
    });
    if (lo < 0) continue;
    keep.add(lo).add(hi);
    const vs = runs.flat().map((i) => cats[i]!.vals[j]!);
    const [vmin, vmax] = [cats[lo]!.vals[j]!, cats[hi]!.vals[j]!];
    const n = vs.length;
    for (const idx of runs) {
      // This run's share of the series' budget (min and max take two).
      const share = Math.max(3, Math.round(((per - 2) * idx.length) / n));
      const xs = idx.map((i) => (cats[i]!.t! - t0) / span);
      const ys = idx.map((i) => (cats[i]!.vals[j]! - vmin) / (vmax - vmin || 1));
      for (const k of lttb(xs, ys, share)) keep.add(idx[k]!);
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
