import { OTHER } from "./svg.ts";
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

type R = readonly [si: number, v: unknown];
interface Cat {
  label: string;
  rows: R[];
  vals: (number | null)[];
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
    const c = String(row[s.x]);
    const sk = s.series === null ? "" : String(row[s.series]);
    let j = si.get(sk);
    if (j === undefined) si.set(sk, (j = series.push(sk) - 1));
    let cat = ci.get(c);
    if (!cat) ci.set(c, (cat = { label: c, rows: [], vals: [] }));
    cat.rows.push([j, row[s.y]]);
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
  let cats = [...ci.values()];
  for (const c of cats) c.vals = reduce(c.rows);
  const total = (c: Cat) => c.vals.reduce<number>((a, v) => a + (v ?? 0), 0);

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
  };
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
