import { cbField, el, esc, memo, nameId, key, r } from "../svg.ts";
import type {
  Axis,
  BandScale,
  LinearScale,
  Mark,
  MarkCtx,
  ResolvedSpec,
  Row,
  Shaped,
} from "../types.ts";
import { MAX_MARKS } from "../validate.ts";
import { more, rowTip } from "./bar.ts";
import { level, ramp } from "./scatter.ts";

interface Pt {
  i: number;
  v: number;
  ci: number;
  si: number;
  name: string | null;
  sz: number | null;
  row: Row;
}

/**
 * One point per row with a numeric y, a visible series and (when x is set) a kept category.
 * An explicit yDomain clips; points outside it are skipped.
 */
const memoKey = (spec: ResolvedSpec, shaped: Shaped) =>
  `${spec.x}|${spec.y}|${spec.series}|${spec.name}|${spec.size}|${spec.yDomain}|${shaped.visible}|${shaped.categories.join("\0")}`;
// Kept per data array: axes(), draw() and every re-render of the same rows share one pass.
const points = (spec: ResolvedSpec, shaped: Shaped): Pt[] =>
  memo(spec.data, `bs|${memoKey(spec, shaped)}`, () => scan(spec, shaped));
function scan(spec: ResolvedSpec, shaped: Shaped): Pt[] {
  const out: Pt[] = [];
  const cats = new Map(shaped.categories.map((c, ci) => [c, ci]));
  const yd = spec.yDomain;
  spec.data.forEach((row, i) => {
    const v = row[spec.y] as number;
    if (!Number.isFinite(v)) return;
    if (yd && (v < yd[0] || v > yd[1])) return;
    // No x: one swarm (shape put every row in the single category "undefined").
    const ci = spec.x === "" ? 0 : cats.get(String(row[spec.x]));
    if (ci === undefined) return;
    const si = shaped.series.indexOf(spec.series === null ? "" : String(row[spec.series]));
    if (!shaped.visible.includes(si)) return;
    const nv = spec.name === null ? null : row[spec.name];
    const sz = spec.size === null ? null : row[spec.size];
    out.push({
      i,
      v,
      ci,
      si,
      name: nv == null ? null : String(nv),
      sz: typeof sz === "number" ? sz : null,
      row,
    });
  });
  return out;
}

/**
 * Dodge: points sorted by pixel x; each takes the smallest |offset| (from the band centre) at which
 * it clears every placed neighbour closer than the sum of their radii `rs`. Candidates are 0 and the
 * tangent offsets of those neighbours. Deterministic: ties go to the positive offset.
 */
function dodge(xs: number[], rs: number[], half: number): number[] {
  const order = xs.map((_, i) => i).sort((a, b) => xs[a]! - xs[b]! || a - b);
  const wide = 2 * Math.max(...rs);
  const out: number[] = new Array(xs.length).fill(0);
  const placed: number[] = []; // indices into xs, in placement order
  let from = 0; // placed[from..] may still be within a diameter in x
  for (const i of order) {
    const x = xs[i]!;
    while (from < placed.length && x - xs[placed[from]!]! >= wide) from++;
    // ponytail: only the 50 most recent neighbours are checked (ties would be quadratic); the swarm clamps past ~25 anyway.
    const near = placed.slice(Math.max(from, placed.length - 50));
    const cand = [0];
    for (const j of near) {
      const h = Math.sqrt(Math.max(0, (rs[i]! + rs[j]!) ** 2 - (x - xs[j]!) ** 2));
      cand.push(out[j]! + h, out[j]! - h);
    }
    cand.sort((a, b) => Math.abs(a) - Math.abs(b) || b - a);
    const ok = (o: number) =>
      near.every((j) => (x - xs[j]!) ** 2 + (o - out[j]!) ** 2 >= (rs[i]! + rs[j]!) ** 2 - 1e-6);
    let o = cand.find(ok) ?? 0;
    // ponytail: a swarm taller than its band is clamped, so the overflow overlaps instead of leaving the band.
    const limit = Math.max(0, half - rs[i]!);
    o = Math.max(-limit, Math.min(limit, o));
    out[i] = o;
    placed.push(i);
  }
  return out;
}

/**
 * Past MAX_MARKS points: a violin of cells per band. Each band is cut along the value axis into
 * columns (about 6 px) and each non-empty column is one rect centred on the band, as tall as its
 * count (against the busiest column of all bands, so bands compare), coloured on scatter's ramp.
 * ponytail: series merged and no name, like scatter's cells; per-series violins if anyone asks.
 */
function bins(ctx: MarkCtx, pts: Pt[]) {
  // Values sorted per band, once per data array: a column's count is then two binary searches.
  const sorted = memo(ctx.spec.data, `bsv|${memoKey(ctx.spec, ctx.shaped)}`, () => {
    const by: number[][] = ctx.shaped.categories.map(() => []);
    for (const p of pts) (by[p.ci] ??= []).push(p.v);
    return by.map((v) => Float64Array.from(v).sort());
  });
  const { spec, shaped, plot } = ctx;
  const sx = ctx.x as LinearScale;
  const band = ctx.y as BandScale | null;
  const bh = band ? band.bandwidth : plot.h;
  const bands = Math.max(1, shaped.categories.length);
  const nx = Math.max(1, Math.min(Math.floor(plot.w / 6), Math.floor(MAX_MARKS / bands)));
  const cw = plot.w / nx;
  const [d0, d1] = sx.domain;
  // Value at a fraction of the plot width (a log axis steps by decades).
  const at = (f: number) =>
    sx.log ? 10 ** (Math.log10(d0) + f * (Math.log10(d1) - Math.log10(d0))) : d0 + f * (d1 - d0);
  const grid = new Map<number, number>();
  sorted.forEach((a, ci) => {
    let from = 0;
    for (let i = 0; i < nx; i++) {
      let to = a.length; // the last column takes the rest, as the first took everything below it
      if (i < nx - 1) {
        const e = at(((i + 1) * cw) / plot.w);
        for (let lo = from, hi = a.length; (to = lo) < hi;) {
          const m = (lo + hi) >> 1;
          a[m]! < e ? (lo = m + 1) : (hi = m);
        }
      }
      if (to > from) grid.set(ci * nx + i, to - from);
      from = to;
    }
  });
  const vals = [...grid.values()];
  const max = Math.max(...vals);
  const edge = Array.from({ length: nx + 1 }, (_, i) => ctx.fmt(spec.y, at((i * cw) / plot.w)));
  const ti = spec.titles.get(spec.y) ?? spec.y;
  let marks = "";
  [...grid]
    .sort((a, b) => a[0] - b[0])
    .forEach(([k, n], c) => {
      const [ci, i] = [Math.floor(k / nx), k % nx];
      const h = Math.max(2, bh * 0.9 * (n / max));
      const mid = band ? band.at(ci) + bh / 2 : plot.y + plot.h / 2;
      const gx = ctx.t("range", edge[i]!, edge[i + 1]!);
      marks += el("rect", {
        "data-maya": "mark",
        "data-key": key("b", ci, i),
        "data-c": c,
        "data-s": 0,
        "data-x": `${band ? ctx.fmt(spec.x, shaped.categories[ci]) + ", " : ""}${ti} ${gx}`,
        "data-y": n,
        "data-f": ctx.t(n === 1 ? "point" : "points", ctx.fmt("", n)),
        "data-q": level(n, max),
        x: r(plot.x + i * cw + 0.5),
        y: r(mid - h / 2),
        width: r(cw - 1),
        height: r(h),
      });
    });
  const { legend, note } = ramp(ctx, grid);
  return { marks, hits: "", legend, note };
}

/** Dots dodged off a shared value axis: y = value (bottom axis), x = optional row category (left band). */
export const beeswarm: Mark = {
  noun: "Beeswarm",
  axes(spec, shaped) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of points(spec, shaped)) ((lo = Math.min(lo, p.v)), (hi = Math.max(hi, p.v)));
    if (lo > hi) lo = hi = 0;
    const left: Axis =
      spec.x === "" ? null : { kind: "band", field: spec.x, domain: shaped.categories };
    return [{ kind: "linear", field: spec.y, domain: spec.yDomain ?? [lo, hi] }, left];
  },
  draw(ctx) {
    const { spec, shaped, plot } = ctx;
    const sx = ctx.x as LinearScale;
    const band = ctx.y as BandScale | null;
    const pts = points(spec, shaped);
    if (pts.length > MAX_MARKS) return bins(ctx, pts);
    const bh = band ? band.bandwidth : plot.h;
    const groups = new Map<number, Pt[]>();
    for (const p of pts) (groups.get(p.ci) ?? groups.set(p.ci, []).get(p.ci)!).push(p);
    let big = 1;
    for (const g of groups.values()) big = Math.max(big, g.length);
    // Radius from density: the area each point of the busiest swarm gets, 3 to 6 px.
    const rad = Math.max(3, Math.min(6, Math.sqrt((plot.w * bh) / big) / 4));
    const cb = cbField(spec);
    // size: radius by sqrt of |size| (scatter's rule) against the largest, 3 px up to a share of the lane.
    let max = ctx.sizeMax ?? 0;
    if (ctx.sizeMax === null) for (const p of pts) max = Math.max(max, Math.abs(p.sz ?? 0));
    const scale = Math.min(plot.w, bh) / 12;
    const radius = (p: Pt) =>
      spec.size === null
        ? rad
        : p.sz === null || !max
          ? 3
          : 3 + Math.sqrt(Math.abs(p.sz) / max) * scale;
    // select { peers }: every mark names its peer value; the selected value's marks light up with their mean.
    const pe = spec.peers;
    const peer = (p: Pt) => (pe ? String(p.row[pe.field] ?? "") : null);
    const on = (p: Pt) => pe?.value != null && peer(p) === pe.value;

    const seen = new Map<string, number>();
    let marks = "";
    let labels = "";
    let grid = "";
    for (const [ci, g] of [...groups].sort((a, b) => a[0] - b[0])) {
      const mid = band ? band.at(ci) + band.bandwidth / 2 : plot.y + plot.h / 2;
      const xs = g.map((p) => sx.of(p.v));
      const rs = g.map((p) => radius(p));
      const off = dodge(
        xs,
        rs.map((q) => q + 0.5),
        bh / 2,
      );
      g.forEach((p, k) => {
        const ser = shaped.series[p.si]!;
        const f = ctx.fmt(spec.y, p.v);
        const cv = cb ? p.row[cb] : null;
        const d = {
          "data-key": key(ser, nameId(seen, p.name, p.i)),
          "data-c": p.i,
          "data-s": p.si % 8,
          "data-x": p.name ?? (band ? ctx.fmt(spec.x, shaped.categories[ci]) : ""),
          "data-series": ser || null,
          "data-y": p.v,
          "data-f": f,
          "data-more": more(ctx, rowTip(ctx, p.row)),
          "data-neg": p.v < 0,
          "data-tone": ctx.tone(p.v),
          "data-q": typeof cv === "number" ? ctx.q(cv) : null,
          "data-peer": peer(p),
          "data-peer-on": on(p) || null,
        };
        const cx = xs[k]!;
        const cy = mid + off[k]!;
        marks += el("circle", { "data-maya": "mark", ...d, r: r(rs[k]!), cx: r(cx), cy: r(cy) });
        if (spec.labels) ctx.label(cx, cy - rs[k]!, f, "above", d["data-key"]);
      });
    }
    // The lit peers' mean: one line across the plot, its label beside the top.
    const lit = pts.filter(on);
    if (lit.length) {
      const m = lit.reduce((a, p) => a + p.v, 0) / lit.length;
      const x = r(sx.of(m));
      grid = el("line", {
        "data-peer-mean": true,
        x1: x,
        x2: x,
        y1: r(plot.y),
        y2: r(plot.y + plot.h),
      });
      const right = sx.of(m) < plot.x + plot.w / 2;
      labels = el(
        "text",
        {
          "data-peer-mean": true,
          x: r(sx.of(m) + (right ? 4 : -4)),
          y: r(plot.y + 10),
          "text-anchor": right ? "start" : "end",
        },
        esc(`${ctx.t("peerMean", pe!.value!)} ${ctx.fmt(spec.y, m)}`),
      );
    }
    return { marks, hits: "", grid, labels }; // no hit squares: the tooltip picks the nearest dot, as for scatter
  },
};
