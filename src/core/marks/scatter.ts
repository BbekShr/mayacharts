import { cbField, el, nameId, esc, key, r } from "../svg.ts";
import type { LinearScale, Mark, MarkCtx, ResolvedSpec, Row, Shaped } from "../types.ts";
import { MAX_MARKS } from "../validate.ts";

interface Pt {
  i: number;
  x: number;
  y: number;
  sz: number | null;
  si: number;
  name: string | null;
  row: Row;
}

const memo = new WeakMap<Shaped, Pt[]>(); // axes() and draw() share one pass

/**
 * Visible points, in row order. Rows with a null/non-numeric x or y, hidden series, and points
 * outside an explicit xDomain/yDomain are skipped (domains clip; they never draw off-plot).
 * A 4-element view.window (scatter zoom box) clips the same way as the domains.
 */
function points(spec: ResolvedSpec, shaped: Shaped): Pt[] {
  const hit = memo.get(shaped);
  if (hit) return hit;
  const out: Pt[] = [];
  memo.set(shaped, out);
  const sIdx = new Map(shaped.series.map((k, j) => [k, j]));
  const vis = new Set(shaped.visible);
  const xd = spec.xDomain;
  const yd = spec.yDomain;
  const w = spec.window;
  spec.data.forEach((row, i) => {
    const x = row[spec.x];
    const y = row[spec.y];
    if (typeof x !== "number" || typeof y !== "number") return;
    if (xd && (x < xd[0] || x > xd[1])) return;
    if (yd && (y < yd[0] || y > yd[1])) return;
    if (w && (x < w[0] || x > w[1] || y < w[2] || y > w[3])) return;
    const si = sIdx.get(spec.series === null ? "" : String(row[spec.series]))!;
    if (!vis.has(si)) return;
    const sv = spec.size === null ? null : row[spec.size];
    const nv = spec.name === null ? null : row[spec.name];
    out.push({
      i,
      x,
      y,
      sz: typeof sv === "number" ? sv : null,
      si,
      name: nv == null ? null : String(nv),
      row,
    });
  });
  return out;
}

/**
 * Density cells for more than MAX_MARKS visible points: a grid over the plot (cells >= 6 px, at
 * most MAX_MARKS of them), non-empty cells only, ramp by sqrt(count). The grid is a function of
 * the axis domains and the plot size, so the same window gives the same cells.
 * ponytail: square cells, series merged (no per-series colour), no size or name; hexes and
 * per-series stacks if anyone needs them.
 */
function bins(ctx: MarkCtx, pts: Pt[]) {
  const { spec, plot } = ctx;
  const [sx, sy] = [ctx.x as LinearScale, ctx.y as LinearScale];
  const cell = Math.max(6, Math.sqrt((plot.w * plot.h) / MAX_MARKS));
  // Extreme aspect ratios (400000 x 20) would floor to thousands of columns: cap the grid too.
  const ny = Math.max(1, Math.min(Math.floor(plot.h / cell), MAX_MARKS));
  const nx = Math.max(1, Math.min(Math.floor(plot.w / cell), Math.floor(MAX_MARKS / ny)));
  const [cw, ch] = [plot.w / nx, plot.h / ny];
  const at = (v: number, s: LinearScale, o: number, n: number) =>
    Math.min(n - 1, Math.max(0, Math.floor((s.of(v) - o) / (n === nx ? cw : ch))));
  const grid = new Map<number, number>();
  for (const p of pts) {
    const k = at(p.x, sx, plot.x, nx) * ny + at(p.y, sy, plot.y, ny);
    grid.set(k, (grid.get(k) ?? 0) + 1);
  }
  const max = Math.max(...grid.values());
  const ti = (f: string) => spec.titles.get(f) ?? f;
  // Pixel to data, from the scale's own endpoints.
  const inv = (s: LinearScale, px: number) =>
    s.domain[0] + ((px - s.range[0]) / (s.range[1] - s.range[0])) * (s.domain[1] - s.domain[0]);
  // Formatted values at the grid lines, once each: cells read their two neighbours.
  const edges = (s: LinearScale, f: string, o: number, c: number, n: number) =>
    Array.from({ length: n + 1 }, (_, i) => ctx.fmt(f, inv(s, o + i * c)));
  const [ex, ey] = [edges(sx, spec.x, plot.x, cw, nx), edges(sy, spec.y, plot.y, ch, ny)];
  let marks = "";
  [...grid]
    .sort((a, b) => a[0] - b[0])
    .forEach(([k, n], c) => {
      const [i, j] = [Math.floor(k / ny), k % ny];
      const [x, y] = [plot.x + i * cw, plot.y + j * ch];
      const gx = ctx.t("range", ex[i]!, ex[i + 1]!);
      const gy = ctx.t("range", ey[j + 1]!, ey[j]!);
      marks += el("rect", {
        "data-maya": "mark",
        "data-key": key("b", i, j),
        "data-c": c,
        "data-s": 0,
        "data-x": `${ti(spec.x)} ${gx}, ${ti(spec.y)} ${gy}`,
        "data-y": n,
        "data-f": ctx.t(n === 1 ? "point" : "points", ctx.fmt("", n)),
        "data-gx": gx,
        "data-gy": gy,
        "data-q": Math.min(9, Math.ceil(Math.sqrt(n / max) * 10) - 1),
        x: r(x + 0.5),
        y: r(y + 0.5),
        width: r(cw - 1),
        height: r(ch - 1),
      });
    });
  // The ramp is sqrt, so the middle of the gradient is a quarter of the maximum.
  const mid = Math.round(max / 4);
  const f = (n: number) => `<span>${esc(ctx.fmt("", n))}</span>`;
  const legend =
    `<div class="maya-legend" data-maya="ramp" data-d><b>${esc(ctx.t("perCell"))}</b>${f(1)}<i></i>` +
    (mid > 1 && mid < max ? `${f(mid)}<i></i>` : "") +
    f(max) +
    "</div>";
  const note =
    ctx.t("density", ...[grid.size, Math.min(...grid.values()), max].map((v) => ctx.fmt("", v))) +
    ".";
  return { marks, hits: "", cross: cross(ctx), legend, note };
}

/** Hover guides: element-owned, moved to the hovered point (tooltip.ts); pills carry its x and y. */
function cross({ plot }: MarkCtx) {
  const [l, t, b] = [plot.x, plot.y, plot.y + plot.h];
  return (
    el("line", { "data-g": "x", x1: 0, x2: 0, y1: r(t), y2: r(b) }) +
    el("line", { "data-g": "y", x1: r(l), x2: r(l + plot.w), y1: 0, y2: 0 }) +
    el("text", { "data-g": "x", y: r(b - 6), "text-anchor": "middle" }, "") +
    el("text", { "data-g": "y", x: r(l + 6), y: -6 }, "")
  );
}

export const scatter: Mark = {
  noun: "Scatter",
  axes(spec, shaped) {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const p of points(spec, shaped)) {
      x0 = Math.min(x0, p.x);
      x1 = Math.max(x1, p.x);
      y0 = Math.min(y0, p.y);
      y1 = Math.max(y1, p.y);
    }
    if (x0 > x1) ((x0 = x1 = 0), (y0 = y1 = 0));
    // Bubbles: pad 6% so the largest radius stays inside the plot.
    const px = spec.size === null ? 0 : (x1 - x0) * 0.06;
    const py = spec.size === null ? 0 : (y1 - y0) * 0.06;
    const lo = (v: number, p: number) => (v >= 0 ? Math.max(0, v - p) : v - p);
    [x0, x1, y0, y1] = [lo(x0, px), x1 + px, lo(y0, py), y1 + py];
    return [
      { kind: "linear", field: spec.x, domain: spec.xDomain ?? [x0, x1] },
      { kind: "linear", field: spec.y, domain: spec.yDomain ?? [y0, y1] },
    ];
  },
  draw(ctx) {
    const { spec, shaped, plot } = ctx;
    const sx = ctx.x as { of(v: number): number };
    const sy = ctx.y as { of(v: number): number };
    const pts = points(spec, shaped);
    if (pts.length > MAX_MARKS) return bins(ctx, pts);
    let max = 0;
    for (const p of pts) if (p.sz !== null) max = Math.max(max, Math.abs(p.sz));
    const scale = Math.min(plot.w, plot.h) / 16;
    const radius = (v: number) => 3 + Math.sqrt(Math.abs(v) / max) * scale;
    // Dense plots read as density: points shrink and thin out as they multiply (isolated ones keep their outline).
    const dense = max === 0 && pts.length > 100;
    const flat = dense ? Math.max(2.5, 5 * Math.sqrt(100 / pts.length)) : 5;
    const cb = cbField(spec);

    // Ids follow row order (name, name#2, ...), so they are assigned before the size sort.
    const seen = new Map<string, number>();
    const ids = spec.name === null ? null : new Map(pts.map((p) => [p, nameId(seen, p.name, p.i)]));
    const rad = (p: Pt) => (p.sz !== null && max > 0 ? radius(p.sz) : flat);
    // Big bubbles first so small ones stay on top; stable for ties.
    const order = max > 0 ? [...pts].sort((a, b) => rad(b) - rad(a)) : pts;

    let marks = "";
    for (const p of order) {
      const ser = shaped.series[p.si]!;
      const x = ctx.fmt(spec.x, p.x);
      const y = ctx.fmt(spec.y, p.y);
      const cv = cb ? p.row[cb] : null;
      const named = p.name !== null || p.sz !== null;
      const cx = sx.of(p.x);
      const cy = sy.of(p.y);
      marks += el("circle", {
        "data-maya": "mark",
        "data-key": key(ser, ids?.get(p) ?? p.i),
        "data-c": p.i,
        "data-s": spec.series === null ? null : p.si % 8, // none: the group colours the point
        "data-x": p.name ?? x,
        "data-series": ser || null,
        "data-y": p.y,
        "data-f": !named
          ? y
          : [x, y, p.sz === null ? null : ctx.fmt(spec.size!, p.sz)]
              .filter((v) => v !== null)
              .join(" · "),
        // Guide pills: only when data-x / data-f are not already the formatted x and y.
        "data-gx": named ? x : null,
        "data-gy": named ? y : null,
        "data-neg": p.y < 0,
        "data-tone": ctx.tone(p.y),
        "data-q": typeof cv === "number" ? ctx.q(cv) : null,
        // Once, on the first point: CSS thins every point of a dense plot from the group.
        "data-dense": dense && !marks,
        r: r(rad(p)),
        cx: r(cx),
        cy: r(cy),
      });
      if (spec.labels) ctx.label(cx, cy - rad(p), y, "above");
    }
    // Size key: three reference circles drawn with the marks' own radius rule, values rounded to one digit.
    const ref = [0.1, 0.25, 0.5].map((f) => Number((max * f).toPrecision(1)));
    const key3 = (v: number) => {
      const q = radius(v); // the rounded value, so circle and label agree
      const d = r(q * 2 + 2);
      return `<svg width="${d}" height="${d}" aria-hidden="true"><circle cx="${r(q + 1)}" cy="${r(q + 1)}" r="${r(q)}"/></svg><span>${esc(ctx.fmt(spec.size!, v))}</span>`;
    };
    const legend =
      max > 0
        ? `<div class="maya-legend" data-maya="ramp"><b>${esc(spec.titles.get(spec.size!) ?? spec.size!)}</b>${ref.map(key3).join("")}</div>`
        : "";
    return { marks, hits: "", cross: pts.length ? cross(ctx) : "", legend };
  },
};
