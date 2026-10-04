import { el, key, r } from "../svg.ts";
import type { Mark, ResolvedSpec, Row, Shaped } from "../types.ts";

const MIN = 24;

interface Pt {
  i: number;
  x: number;
  y: number;
  sz: number | null;
  si: number;
  name: string | null;
  row: Row;
}

/**
 * Visible points, in row order. Rows with a null/non-numeric x or y, hidden series, and points
 * outside an explicit xDomain/yDomain are skipped (domains clip; they never draw off-plot).
 * A 4-element view.window (scatter zoom box) clips the same way as the domains.
 */
function points(spec: ResolvedSpec, shaped: Shaped): Pt[] {
  const out: Pt[] = [];
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
    const si = shaped.series.indexOf(spec.series === null ? "" : String(row[spec.series]));
    if (!shaped.visible.includes(si)) return;
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
    let max = 0;
    for (const p of pts) if (p.sz !== null) max = Math.max(max, Math.abs(p.sz));
    const scale = Math.min(plot.w, plot.h) / 16;
    const cb = typeof spec.colorBy === "string" && spec.colorBy !== "sign" ? spec.colorBy : null;

    const seen = new Map<string, number>();
    const items = pts.map((p) => {
      const rad = p.sz !== null && max > 0 ? 3 + Math.sqrt(Math.abs(p.sz) / max) * scale : 5;
      let id: string | number = p.i;
      if (p.name !== null) {
        const n = (seen.get(p.name) ?? 0) + 1;
        seen.set(p.name, n);
        id = n > 1 ? `${p.name}#${n}` : p.name;
      }
      const ser = shaped.series[p.si]!;
      const x = ctx.fmt(spec.x, p.x);
      const y = ctx.fmt(spec.y, p.y);
      const cv = cb ? p.row[cb] : null;
      const d = {
        "data-key": key(ser, id),
        "data-c": p.i,
        "data-s": p.si % 8,
        "data-x": p.name ?? x,
        "data-series": ser,
        "data-y": p.y,
        "data-f":
          p.name === null && p.sz === null
            ? y
            : [x, y, p.sz === null ? null : ctx.fmt(spec.size!, p.sz)]
                .filter((v) => v !== null)
                .join(" · "),
        "data-gx": x,
        "data-gy": y,
        "data-neg": p.y < 0,
        "data-tone": ctx.tone(p.y),
        "data-q": typeof cv === "number" ? ctx.q(cv) : null,
      };
      return { p, rad, d, cx: sx.of(p.x), cy: sy.of(p.y) };
    });
    // Big bubbles first so small ones stay on top; stable for ties.
    items.sort((a, b) => b.rad - a.rad);

    let marks = "";
    let hits = "";
    for (const { p, rad, d, cx, cy } of items) {
      marks += el("circle", {
        "data-maya": "mark",
        ...d,
        r: r(rad),
        cx: r(cx),
        cy: r(cy),
      });
      if (rad * 2 < MIN)
        hits += el("circle", {
          "data-maya": "hit",
          ...d,
          r: r(Math.max(rad, 12)),
          cx: r(cx),
          cy: r(cy),
          fill: "transparent",
        });
      if (spec.labels) ctx.label(cx, cy - rad, ctx.fmt(spec.y, p.y), "above");
    }
    // Hover guides: element-owned, moved to the hovered point (tooltip.ts); pills carry its x and y.
    const [l, t, b] = [plot.x, plot.y, plot.y + plot.h];
    const cross = pts.length
      ? el("line", { "data-g": "x", x1: 0, x2: 0, y1: r(t), y2: r(b) }) +
        el("line", { "data-g": "y", x1: r(l), x2: r(l + plot.w), y1: 0, y2: 0 }) +
        el("text", { "data-g": "x", y: r(b - 6), "text-anchor": "middle" }, "") +
        el("text", { "data-g": "y", x: r(l + 6), y: -6 }, "")
      : "";
    return { marks, hits, cross };
  },
};
