import { el, key, r } from "../svg.ts";
import type { Axis, BandScale, LinearScale, Mark, ResolvedSpec, Shaped } from "../types.ts";

interface Pt {
  i: number;
  v: number;
  ci: number;
  si: number;
  name: string | null;
  row: Record<string, unknown>;
}

/**
 * One point per row with a numeric y, a visible series and (when x is set) a kept category.
 * An explicit yDomain clips; points outside it are skipped.
 */
function points(spec: ResolvedSpec, shaped: Shaped): Pt[] {
  const out: Pt[] = [];
  const cats = new Map(shaped.categories.map((c, ci) => [c, ci]));
  const yd = spec.yDomain;
  spec.data.forEach((row, i) => {
    const v = row[spec.y];
    if (typeof v !== "number" || !Number.isFinite(v)) return;
    if (yd && (v < yd[0] || v > yd[1])) return;
    // No x: one swarm (shape put every row in the single category "undefined").
    const ci = spec.x === "" ? 0 : cats.get(String(row[spec.x]));
    if (ci === undefined) return;
    const si = shaped.series.indexOf(spec.series === null ? "" : String(row[spec.series]));
    if (!shaped.visible.includes(si)) return;
    const nv = spec.name === null ? null : row[spec.name];
    out.push({ i, v, ci, si, name: nv == null ? null : String(nv), row });
  });
  return out;
}

/**
 * Dodge: points sorted by pixel x; each takes the smallest |offset| (from the band centre) at which
 * it clears every placed neighbour closer than one diameter. Candidates are 0 and the tangent
 * offsets of those neighbours. Deterministic: ties go to the positive offset.
 */
function dodge(xs: number[], rad: number, limit: number): number[] {
  const order = xs.map((_, i) => i).sort((a, b) => xs[a]! - xs[b]! || a - b);
  const d2 = (2 * rad) ** 2;
  const out: number[] = new Array(xs.length).fill(0);
  const placed: number[] = []; // indices into xs, in placement order
  let from = 0; // placed[from..] may still be within a diameter in x
  for (const i of order) {
    const x = xs[i]!;
    while (from < placed.length && x - xs[placed[from]!]! >= 2 * rad) from++;
    const near = placed.slice(from);
    const cand = [0];
    for (const j of near) {
      const h = Math.sqrt(Math.max(0, d2 - (x - xs[j]!) ** 2));
      cand.push(out[j]! + h, out[j]! - h);
    }
    cand.sort((a, b) => Math.abs(a) - Math.abs(b) || b - a);
    const ok = (o: number) =>
      near.every((j) => (x - xs[j]!) ** 2 + (o - out[j]!) ** 2 >= d2 - 1e-6);
    let o = cand.find(ok) ?? 0;
    // ponytail: a swarm taller than its band is clamped, so the overflow overlaps instead of leaving the band.
    o = Math.max(-limit, Math.min(limit, o));
    out[i] = o;
    placed.push(i);
  }
  return out;
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
    const bh = band ? band.bandwidth : plot.h;
    const groups = new Map<number, Pt[]>();
    for (const p of pts) (groups.get(p.ci) ?? groups.set(p.ci, []).get(p.ci)!).push(p);
    let big = 1;
    for (const g of groups.values()) big = Math.max(big, g.length);
    // Radius from density: the area each point of the busiest swarm gets, 3 to 6 px.
    const rad = Math.max(3, Math.min(6, Math.sqrt((plot.w * bh) / big) / 4));
    const cb = typeof spec.colorBy === "string" && spec.colorBy !== "sign" ? spec.colorBy : null;

    const seen = new Map<string, number>();
    let marks = "";
    for (const [ci, g] of [...groups].sort((a, b) => a[0] - b[0])) {
      const mid = band ? band.at(ci) + band.bandwidth / 2 : plot.y + plot.h / 2;
      const xs = g.map((p) => sx.of(p.v));
      const off = dodge(xs, rad + 0.5, Math.max(0, bh / 2 - rad));
      g.forEach((p, k) => {
        let id: string | number = p.i;
        if (p.name !== null) {
          const n = (seen.get(p.name) ?? 0) + 1;
          seen.set(p.name, n);
          id = n > 1 ? `${p.name}#${n}` : p.name;
        }
        const ser = shaped.series[p.si]!;
        const f = ctx.fmt(spec.y, p.v);
        const cv = cb ? p.row[cb] : null;
        const d = {
          "data-key": key(ser, id),
          "data-c": p.i,
          "data-s": p.si % 8,
          "data-x": p.name ?? (band ? ctx.fmt(spec.x, shaped.categories[ci]) : ""),
          "data-series": ser || null,
          "data-y": p.v,
          "data-f": f,
          "data-neg": p.v < 0,
          "data-tone": ctx.tone(p.v),
          "data-q": typeof cv === "number" ? ctx.q(cv) : null,
        };
        const cx = xs[k]!;
        const cy = mid + off[k]!;
        marks += el("circle", { "data-maya": "mark", ...d, r: r(rad), cx: r(cx), cy: r(cy) });
        if (spec.labels) ctx.label(cx, cy - rad, f, "above");
      });
    }
    return { marks, hits: "" }; // no hit squares: the tooltip picks the nearest dot, as for scatter
  },
};
