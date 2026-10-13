import { cbField, el, memo, nameId, esc, key, r } from "../svg.ts";
import { marked, more, rowTip } from "./bar.ts";
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

/** The rows with a numeric x and y as typed columns, once per data array (a resize or legend toggle reuses them). */
function columns(spec: ResolvedSpec, shaped: Shaped) {
  return memo(spec.data, `c${JSON.stringify([spec.x, spec.y, spec.series])}`, () => {
    const rows = spec.data;
    const [at, xs, ys, si] = [
      new Int32Array(rows.length),
      new Float64Array(rows.length),
      new Float64Array(rows.length),
      new Int32Array(rows.length),
    ];
    const sIdx = new Map(shaped.series.map((k, j) => [k, j]));
    let n = 0;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const [x, y] = [row[spec.x], row[spec.y]];
      if (typeof x !== "number" || typeof y !== "number") continue;
      at[n] = i;
      xs[n] = x;
      ys[n] = y;
      si[n++] = spec.series === null ? 0 : sIdx.get(String(row[spec.series]))!;
    }
    return { n, at, xs, ys, si };
  });
}

const picks = new WeakMap<Shaped, { n: number; k: Int32Array; c: ReturnType<typeof columns> }>(); // axes() and draw() share one pass

/**
 * Visible points as positions into the typed columns, in row order. Rows with a null/non-numeric
 * x or y, hidden series, and points outside an explicit xDomain/yDomain are skipped (domains
 * clip; they never draw off-plot). A 4-element view.window (scatter zoom box) clips the same way
 * as the domains.
 */
function pick(spec: ResolvedSpec, shaped: Shaped) {
  const hit = picks.get(shaped);
  if (hit) return hit;
  const c = columns(spec, shaped);
  const k = new Int32Array(c.n);
  let n = 0;
  const vis = new Uint8Array(shaped.series.length);
  for (const j of shaped.visible) vis[j] = 1;
  const [xd, yd, w] = [spec.xDomain, spec.yDomain, spec.window];
  for (let i = 0; i < c.n; i++) {
    const [x, y] = [c.xs[i]!, c.ys[i]!];
    if (xd && (x < xd[0] || x > xd[1])) continue;
    if (yd && (y < yd[0] || y > yd[1])) continue;
    if (w && (x < w[0] || x > w[1] || y < w[2] || y > w[3])) continue;
    if (vis[c.si[i]!]) k[n++] = i;
  }
  const out = { n, k, c };
  picks.set(shaped, out);
  return out;
}

/** The visible points as objects, in row order. */
export function points(spec: ResolvedSpec, shaped: Shaped): Pt[] {
  const { n, k, c } = pick(spec, shaped);
  const out: Pt[] = [];
  for (let m = 0; m < n; m++) {
    const i = k[m]!;
    const row = spec.data[c.at[i]!]!;
    const sv = spec.size === null ? null : row[spec.size];
    const nv = spec.name === null ? null : row[spec.name];
    out.push({
      i: c.at[i]!,
      x: c.xs[i]!,
      y: c.ys[i]!,
      sz: typeof sv === "number" ? sv : null,
      si: c.si[i]!,
      name: nv == null ? null : String(nv),
      row,
    });
  }
  return out;
}

/** Ramp step 0..9 of a cell holding n of at most max points: log, so one point and a thousand read differently on a heavy plot. */
export const level = (n: number, max: number) =>
  max < 2 ? 0 : Math.min(9, Math.floor((10 * Math.log(n)) / Math.log(max)));

/** The density ramp legend and note for a grid of cell counts (scatter's cells, beeswarm's columns). The ramp is log, so its middle is the geometric mean of 1 and the maximum. */
export function ramp(ctx: MarkCtx, grid: Map<number, number>) {
  const vals = [...grid.values()];
  const [min, max] = [Math.min(...vals), Math.max(...vals)];
  const mid = Math.round(Math.sqrt(max));
  const f = (n: number) => `<span>${esc(ctx.fmt("", n))}</span>`;
  return {
    legend:
      `<div class="maya-legend" data-maya="ramp" data-d><b>${esc(ctx.t("perCell"))}</b>${f(1)}<i></i>` +
      (mid > 1 && mid < max ? `${f(mid)}<i></i>` : "") +
      f(max) +
      "</div>",
    note: ctx.t("density", ...[grid.size, min, max].map((v) => ctx.fmt("", v))) + ".",
  };
}

/**
 * Density cells for more than MAX_MARKS visible points: a grid over the plot (cells >= 6 px, at
 * most MAX_MARKS of them), non-empty cells only, ramp by log(count). The grid is a function of
 * the axis domains and the plot size, so the same window gives the same cells.
 * ponytail: square cells, series merged (no per-series colour), no size or name; hexes and
 * per-series stacks if anyone needs them.
 */
function bins(ctx: MarkCtx, sel: ReturnType<typeof pick>) {
  const { spec, plot } = ctx;
  const [sx, sy] = [ctx.x as LinearScale, ctx.y as LinearScale];
  const cell = Math.max(6, Math.sqrt((plot.w * plot.h) / MAX_MARKS));
  // Extreme aspect ratios (400000 x 20) would floor to thousands of columns: cap the grid too.
  const ny = Math.max(1, Math.min(Math.floor(plot.h / cell), MAX_MARKS));
  const nx = Math.max(1, Math.min(Math.floor(plot.w / cell), Math.floor(MAX_MARKS / ny)));
  const [cw, ch] = [plot.w / nx, plot.h / ny];
  const at = (v: number, s: LinearScale, o: number, c: number, n: number) =>
    Math.min(n - 1, Math.max(0, Math.floor((s.of(v) - o) / c)));
  // Counted in a typed array (a Map of a million increments costs ~60 ms), kept as a Map of the non-empty cells.
  const counts = new Uint32Array(nx * ny);
  for (let m = 0; m < sel.n; m++) {
    const i = sel.k[m]!;
    counts[at(sel.c.xs[i]!, sx, plot.x, cw, nx) * ny + at(sel.c.ys[i]!, sy, plot.y, ch, ny)]!++;
  }
  const grid = new Map<number, number>();
  counts.forEach((n, k) => n && grid.set(k, n));
  const max = Math.max(...grid.values());
  const ti = (f: string) => spec.titles.get(f) ?? f;
  // Pixel to data, from the scale's own endpoints.
  const inv = (s: LinearScale, px: number) => {
    const [a, b] = s.log ? s.domain.map(Math.log10) : s.domain;
    const v = a! + ((px - s.range[0]) / (s.range[1] - s.range[0])) * (b! - a!);
    return s.log ? 10 ** v : v;
  };
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
        "data-q": level(n, max),
        x: r(x + 0.5),
        y: r(y + 0.5),
        width: r(cw - 1),
        height: r(ch - 1),
      });
    });
  const { legend, note } = ramp(ctx, grid);
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
    const { n, k, c } = pick(spec, shaped);
    for (let m = 0; m < n; m++) {
      const i = k[m]!;
      x0 = Math.min(x0, c.xs[i]!);
      x1 = Math.max(x1, c.xs[i]!);
      y0 = Math.min(y0, c.ys[i]!);
      y1 = Math.max(y1, c.ys[i]!);
    }
    if (x0 > x1) ((x0 = x1 = 0), (y0 = y1 = 0));
    // Bubbles: pad 6% so the largest radius stays inside the plot.
    const px = spec.size === null ? 0 : (x1 - x0) * 0.06;
    const py = spec.size === null ? 0 : (y1 - y0) * 0.06;
    const lo = (v: number, p: number) => (v >= 0 ? Math.max(0, v - p) : v - p);
    // A log axis spans the data as is (no pad: 0 and negatives have no place on it).
    [x0, x1] = spec.xScale === "log" ? [x0, x1] : [lo(x0, px), x1 + px];
    [y0, y1] = spec.yScale === "log" ? [y0, y1] : [lo(y0, py), y1 + py];
    return [
      { kind: "linear", field: spec.x, domain: spec.xDomain ?? [x0, x1] },
      { kind: "linear", field: spec.y, domain: spec.yDomain ?? [y0, y1] },
    ];
  },
  draw(ctx) {
    const { spec, shaped, plot } = ctx;
    const sx = ctx.x as { of(v: number): number };
    const sy = ctx.y as { of(v: number): number };
    const sel = pick(spec, shaped);
    if (sel.n > MAX_MARKS) return bins(ctx, sel);
    const pts = points(spec, shaped);
    let max = ctx.sizeMax ?? 0;
    if (ctx.sizeMax === null)
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

    // spec.annotate: per series the max and min y, the first and last by x, and { x, text } notes, ahead of plain value labels.
    marked(
      ctx,
      shaped.visible.map((si) => pts.filter((p) => p.si === si).sort((a, b) => a.x - b.x)),
      (p) => p.x,
      (p) => p.y,
      (p, a, said) =>
        ctx.label(
          sx.of(p.x),
          sy.of(p.y) - rad(p),
          said ?? ctx.fmt(spec.y, p.y),
          "above",
          key(shaped.series[p.si]!, ids?.get(p) ?? p.i),
          a,
        ),
    );

    let marks = "";
    for (const p of order) {
      const ser = shaped.series[p.si]!;
      const x = ctx.fmt(spec.x, p.x);
      const y = ctx.fmt(spec.y, p.y);
      const cv = cb ? p.row[cb] : null;
      const named = p.name !== null || p.sz !== null || typeof cv === "number";
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
          : [
              [spec.x, x],
              [spec.y, y],
              [spec.size, p.sz === null ? null : ctx.fmt(spec.size!, p.sz)],
              [cb, typeof cv === "number" ? ctx.fmt(cb!, cv) : null],
            ]
              .map(([f, v]) => v !== null && `${spec.titles.get(f!) ?? f}\t${v}`)
              .filter(Boolean)
              .join("\n"),
        // Guide pills: only when data-x / data-f are not already the formatted x and y.
        "data-gx": named ? x : null,
        "data-gy": named ? y : null,
        "data-more": more(ctx, rowTip(ctx, p.row)),
        "data-neg": p.y < 0,
        "data-tone": ctx.tone(p.y),
        "data-q": typeof cv === "number" ? ctx.q(cv) : null,
        // Once, on the first point: CSS thins every point of a dense plot from the group.
        "data-dense": dense && !marks,
        r: r(rad(p)),
        cx: r(cx),
        cy: r(cy),
      });
      if (spec.labels) ctx.label(cx, cy - rad(p), y, "above", key(ser, ids?.get(p) ?? p.i));
    }
    // Slope rules: y = k * x + b (b defaults to 0, the origin) ("mean": sum y / sum x of the drawn points), clipped to the plot.
    // ponytail: straight only when both axes share a scale; with one log axis the line would be a curve, so it is skipped.
    const [dx, dy] = [(ctx.x as LinearScale).domain, (ctx.y as LinearScale).domain];
    const [tx, ty] = [pts.reduce((a, p) => a + p.x, 0), pts.reduce((a, p) => a + p.y, 0)];
    let under = "";
    spec.slopes.forEach(({ k, b, label }, i) => {
      const m = k === "mean" ? ty / tx : k;
      if (!m || !isFinite(m) || spec.xScale !== spec.yScale) return;
      const [u, v] = [(dy[0] - b) / m, (dy[1] - b) / m];
      const [x0, x1] = [Math.max(dx[0], Math.min(u, v)), Math.min(dx[1], Math.max(u, v))];
      if (!(x0 < x1)) return;
      const [px0, py0, px1, py1] = [sx.of(x0), sy.of(m * x0 + b), sx.of(x1), sy.of(m * x1 + b)];
      under += el("line", {
        "data-key": key("\u0000slope", i),
        "data-slope": true,
        x1: r(px0),
        y1: r(py0),
        x2: r(px1),
        y2: r(py1),
      });
      // The value after the label ("Average price $38 per unit"), else the label alone, else the
      // value alone. Spots lie along the line, 10 px off it on either side; the one covering the
      // fewest points wins, and ctx.label (the collision queue) takes the first that fits.
      const per = ctx.t(
        "perX",
        ctx.fmt(spec.y, +m.toPrecision(3)),
        spec.titles.get(spec.x) ?? spec.x,
      );
      const name = label ?? (k === "mean" ? ctx.t("mean") : "");
      const rise = py0 > py1;
      const spots = [0.5, 0.3, 0.7, 0.15, 0.85].flatMap((t) =>
        [-10, 10].map((dy) => ({
          x: px0 + (px1 - px0) * t + (rise === dy < 0 ? -4 : 4),
          y: py0 + (py1 - py0) * t + dy,
          a: (rise === dy < 0 ? "end" : "start") as "end" | "start", // away from the line
        })),
      );
      for (const text of [`${name} ${per}`.trim(), name, per]) {
        if (!text) continue;
        const w = text.length * 6.5; // ponytail: width guess for the mark check only; the queue measures for real
        const hit = (c: (typeof spots)[number]) => {
          const [l, r2] = c.a === "end" ? [c.x - w, c.x] : [c.x, c.x + w];
          if (c.y < plot.y + 8 || c.y > plot.y + plot.h - 8) return 1e9; // off the plot, onto the axis
          return pts.filter((p) => {
            const [qx, qy] = [sx.of(p.x), sy.of(p.y)];
            const d = rad(p) + 2;
            return qx + d > l && qx - d < r2 && qy + d > c.y - 8 && qy - d < c.y + 8;
          }).length;
        };
        const ranked = spots.map((c) => [hit(c), c] as const).sort((u, v) => u[0] - v[0]);
        if (ranked.some(([, c]) => ctx.label(c.x, c.y, text, c.a))) break;
      }
    });
    // Size key: three reference circles drawn with the marks' own radius rule, values rounded to one digit.
    const ref = [0.1, 0.25, 0.5].map((f) => Number((max * f).toPrecision(1)));
    const key3 = (v: number) => {
      const q = radius(v); // the rounded value, so circle and label agree
      const d = r(q * 2 + 2);
      return `<svg width="${d}" height="${d}" aria-hidden="true"><circle cx="${r(q + 1)}" cy="${r(q + 1)}" r="${r(q)}"/></svg><span>${esc(ctx.fmt(spec.size!, v))}</span>`;
    };
    // No size field: no size key; the series or colour legend renders alone.
    const legend =
      max > 0
        ? `<div class="maya-legend" data-maya="ramp"><b>${esc(spec.titles.get(spec.size!) ?? spec.size!)}</b>${ref.map(key3).join("")}</div>`
        : null;
    return {
      marks: under + marks,
      hits: "",
      cross: pts.length ? cross(ctx) : "",
      ...(legend && { legend }),
    };
  },
};
