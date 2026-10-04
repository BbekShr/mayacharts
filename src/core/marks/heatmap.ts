import { el, esc, key, r } from "../svg.ts";
import type { BandScale, Mark } from "../types.ts";

const MIN = 24;

/** x = column category, series = row category; ramp legend; labels default on at >= 24 px. */
export const heatmap: Mark = {
  noun: "Heatmap",
  axes: (spec, shaped) => [
    { kind: "band", field: spec.x, domain: shaped.categories },
    { kind: "band", field: spec.series ?? "", domain: shaped.series },
  ],
  draw(ctx) {
    const { spec, shaped } = ctx;
    const cx = ctx.x as BandScale;
    const cy = ctx.y as BandScale;
    const cells = shaped.cells.filter((c) => c.value !== null);
    let lo = Infinity;
    let hi = -Infinity;
    for (const c of cells) ((lo = Math.min(lo, c.value!)), (hi = Math.max(hi, c.value!)));
    const q = (v: number) =>
      hi > lo ? Math.min(9, Math.max(0, Math.floor(((v - lo) / (hi - lo)) * 10))) : 9;
    let marks = "";
    let hits = "";
    for (const [n, c] of cells.entries()) {
      const v = c.value!;
      const row = shaped.visible.indexOf(c.si);
      const x = cx.at(c.ci) + 1;
      const y = cy.at(row) + 1;
      const w = Math.max(0, cx.bandwidth - 2);
      const h = Math.max(0, cy.bandwidth - 2);
      const col = shaped.categories[c.ci]!;
      const ser = shaped.series[c.si]!;
      const d = {
        "data-key": key(ser, col),
        "data-c": n,
        "data-x": col,
        "data-series": ser,
        "data-y": v,
        "data-f": ctx.fmt(spec.y, v),
        "data-q": q(v),
      };
      marks += el("rect", {
        "data-maya": "mark",
        ...d,
        x: r(x),
        y: r(y),
        width: r(w),
        height: r(h),
      });
      if (w < MIN || h < MIN) {
        const gw = Math.max(w, MIN);
        const gh = Math.max(h, MIN);
        hits += el("rect", {
          "data-maya": "hit",
          ...d,
          x: r(x - (gw - w) / 2),
          y: r(y - (gh - h) / 2),
          width: r(gw),
          height: r(gh),
          fill: "transparent",
        });
      }
      if (spec.labels !== false && w >= MIN && h >= MIN)
        ctx.label(x + w / 2, y + h / 2, ctx.fmt(spec.y, v), "center");
    }
    const legend =
      cells.length > 0
        ? `<div class="maya-legend" data-maya="ramp"><span>${esc(ctx.fmt(spec.y, lo))}</span><i></i><span>${esc(ctx.fmt(spec.y, hi))}</span></div>`
        : "";
    return { marks, hits, grid: "", legend };
  },
};
