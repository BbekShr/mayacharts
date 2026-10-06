import { el, esc, hit, key, r } from "../svg.ts";
import { inText } from "./bar.ts";
import type { BandScale, Mark } from "../types.ts";

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
    const q = (v: number) => (hi > lo ? Math.min(9, Math.floor(((v - lo) / (hi - lo)) * 10)) : 9);
    // Small cells (no room for a label) are squares centred in their band, not tall pills.
    const s = Math.min(cx.bandwidth, cy.bandwidth);
    const w = Math.max(0, (s < 26 ? s : cx.bandwidth) - 2);
    const h = Math.max(0, (s < 26 ? s : cy.bandwidth) - 2);
    let marks = "";
    let hits = "";
    let labels = "";
    for (const [n, c] of cells.entries()) {
      const v = c.value!;
      const row = shaped.visible.indexOf(c.si);
      const x = cx.at(c.ci) + (cx.bandwidth - w) / 2;
      const y = cy.at(row) + (cy.bandwidth - h) / 2;
      const col = shaped.categories[c.ci]!;
      const ser = shaped.series[c.si]!;
      const d = {
        "data-key": key(ser, col),
        "data-c": n,
        "data-x": ctx.fmt(spec.x, col),
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
      hits += hit(d, x, y, w, h);
      // Drawn here (not ctx.label) so labels on the dark ramp steps can carry data-dark.
      // Too wide for the cell: the same value to 2 significant digits ("35.2M" becomes "35M") before dropping it.
      let text = ctx.fmt(spec.y, v);
      if (text.length * 7.2 + 4 > w) text = ctx.fmt(spec.y, +v.toPrecision(2));
      if (spec.labels !== false && w >= 24 && h >= 24 && text.length * 7.2 + 4 <= w)
        labels += inText(x + w / 2, y + h / 2, text, { "data-dark": d["data-q"] >= 6 });
    }
    const legend =
      cells.length > 0
        ? `<div class="maya-legend" data-maya="ramp"><b>${esc(spec.titles.get(spec.y) ?? spec.y)}</b><span>${esc(ctx.fmt(spec.y, lo))}</span><i></i><span>${esc(ctx.fmt(spec.y, hi))}</span></div>`
        : "";
    return { marks, hits, labels, grid: "", legend };
  },
};
