import { el, esc, hit, key, r, tw } from "../svg.ts";
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
    // A 1 px gap under 12 px bands keeps a calendar's cells readable on a phone.
    const g = s < 12 ? 1 : 2;
    const w = Math.max(0, (s < 26 ? s : cx.bandwidth) - g);
    const h = Math.max(0, (s < 26 ? s : cy.bandwidth) - g);
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
        "data-hm": true,
        ...d,
        x: r(x),
        y: r(y),
        width: r(w),
        height: r(h),
      });
      hits += hit(d, x, y, w, h);
      // Drawn here (not ctx.label) so the ink can follow the step: dark on steps 7 to 9 (data-q lets theme.ts use black in dark mode), "t" (dark in light mode, white in dark mode) on the paler ones.
      // ponytail: tuned for the default accent; a spec.colors accent far from it may need other cut steps.
      // Too wide for the cell: the same value to 2 significant digits ("35.2M" becomes "35M") before dropping it.
      let text = ctx.fmt(spec.y, v);
      if (tw(text) > w) text = ctx.fmt(spec.y, +v.toPrecision(2));
      const dk = d["data-q"] > 7;
      if (spec.labels !== false && w >= 24 && h >= 24 && tw(text) <= w)
        labels += inText(x + w / 2, y + h / 2, text, {
          "data-key": d["data-key"],
          "data-q": dk,
          "data-dark": dk,
          "data-ink": dk ? null : "t",
        });
    }
    const legend =
      cells.length > 0
        ? `<div class="maya-legend" data-maya="ramp"><b>${esc(spec.titles.get(spec.y) ?? spec.y)}</b><span>${esc(ctx.fmt(spec.y, lo))}</span><i></i><span>${esc(ctx.fmt(spec.y, hi))}</span></div>`
        : "";
    return { marks, hits, labels, grid: "", legend };
  },
};
