import type { Cell, ResolvedSpec, Shaped } from "./types.ts";

export function shape(spec: ResolvedSpec, hidden: readonly string[] = []): Shaped {
  const categories: string[] = [];
  const raw: unknown[] = [];
  const series: string[] = [];
  const ci = new Map<string, number>();
  const si = new Map<string, number>();
  const sums = new Map<string, number | null>();
  for (const row of spec.data) {
    const c = String(row[spec.x]);
    const s = spec.series === null ? "" : String(row[spec.series]);
    let i = ci.get(c);
    if (i === undefined) (ci.set(c, (i = categories.push(c) - 1)), raw.push(row[spec.x]));
    let j = si.get(s);
    if (j === undefined) si.set(s, (j = series.push(s) - 1));
    const v = row[spec.y];
    if (typeof v !== "number") {
      if (!sums.has(i + "," + j)) sums.set(i + "," + j, null);
      continue;
    }
    sums.set(i + "," + j, (sums.get(i + "," + j) ?? 0) + v);
  }
  const visible: number[] = [];
  series.forEach((s, j) => hidden.includes(s) || visible.push(j));
  const cells: Cell[] = [];
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < categories.length; i++) {
    let pos = 0;
    let neg = 0;
    for (const j of visible) {
      const value = sums.get(i + "," + j) ?? null;
      const v = value ?? 0;
      let y0 = 0;
      let y1 = v;
      if (spec.stack) {
        if (v < 0) [y0, y1] = [neg, (neg += v)];
        else [y0, y1] = [pos, (pos += v)];
      }
      lo = Math.min(lo, y0, y1);
      hi = Math.max(hi, y0, y1);
      cells.push({ ci: i, si: j, value, y0, y1 });
    }
  }
  const totals = categories.map((c) => spec.totals.includes(c));
  return { categories, raw, totals, series, visible, cells, extent: [lo, hi] };
}
