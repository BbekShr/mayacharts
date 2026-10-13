import { el, esc, hit, key, r, TOTAL, tw } from "../svg.ts";
import { colorVals } from "../shape.ts";
import { ramp } from "../scale.ts";
import { inkOf, inText, more } from "./bar.ts";
import type { BandScale, Mark } from "../types.ts";

/** x = column category, series = row category; ramp legend; labels default on at >= 24 px. */
export const heatmap: Mark = {
  noun: "Heatmap",
  axes: (spec, shaped) => {
    const m = spec.margins ? [TOTAL] : [];
    return [
      { kind: "band", field: spec.x, domain: [...shaped.categories, ...m] },
      { kind: "band", field: spec.series ?? "", domain: [...shaped.series, ...m] },
    ];
  },
  draw(ctx) {
    const { spec, shaped } = ctx;
    const cx = ctx.x as BandScale;
    const cy = ctx.y as BandScale;
    const cells = shaped.cells.filter((c) => c.value !== null);
    const {
      q,
      labels: legendLabels,
      steps,
    } = ramp(
      cells.map((c) => c.value!),
      spec.colorScale,
      spec.rampMid,
    );
    const mv = spec.tipFields.map((f) => colorVals(spec, f));
    const wasOf = spec.was === null ? null : colorVals(spec, spec.was);
    // Cells fill their band, less a gap (theme cellGap; else 1 px under 12 px bands keeps a calendar's cells readable on a phone).
    const tg = parseFloat(spec.theme.cellGap ?? "");
    const g = tg >= 0 ? tg : Math.min(cx.bandwidth, cy.bandwidth) < 12 ? 1 : 2;
    const w = Math.max(0, cx.bandwidth - g);
    const h = Math.max(0, cy.bandwidth - g);
    // The 1 px accent outline is the 1.4.11 mark on pale cells; on a cell under 8 px it would be most of the cell.
    const sw = Math.min(w, h) < 8 ? 0 : null;
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
      const wv = wasOf?.(col, ser) ?? null;
      const d = {
        "data-key": key(ser, col),
        "data-c": n,
        "data-x": ctx.fmt(spec.x, col),
        "data-series": ser,
        "data-y": v,
        "data-f": ctx.fmt(spec.y, v),
        "data-q": q(v),
        "data-was": wv === null ? null : ctx.t("was", ctx.fmt(spec.y, wv)),
        "data-more": more(ctx, (_, k) => mv[k]!(col, ser)),
      };
      marks += el("rect", {
        "data-maya": "mark",
        "data-hm": true,
        ...d,
        x: r(x),
        y: r(y),
        width: r(w),
        height: r(h),
        "stroke-width": sw,
      });
      hits += hit(d, x, y, w, h);
      // Drawn here (not ctx.label): no halo, the ink follows the cell's own fill (theme.ts, data-ink="a").
      let text = ctx.fmt(spec.y, v);
      if (tw(text) > w) text = ctx.fmt(spec.y, +v.toPrecision(2));
      if (spec.labels !== false && w >= 24 && h >= 24 && tw(text) <= w)
        labels += inText(x + w / 2, y + h / 2, text, {
          ...inkOf(d),
          "data-key": d["data-key"],
        });
    }
    // totals: true: the Total column, row and corner sit in the extra band, outside the ramp (neutral fill, bold value).
    const m = shaped.margins;
    if (m) {
      const tot = ctx.t("total");
      const sum = (k: string, x: number, y: number, v: number | null, cat: string, ser: string) => {
        if (v === null) return;
        const d = {
          "data-key": k,
          "data-x": cat,
          "data-series": ser,
          "data-y": v,
          "data-f": ctx.fmt(spec.y, v),
        };
        const o = { "data-hm": true, "data-sum": true };
        // data-other: a total is not a branch, so it never drills.
        marks += el("rect", {
          "data-maya": "mark",
          "data-other": true,
          ...o,
          ...d,
          x: r(x),
          y: r(y),
          width: r(w),
          height: r(h),
          "stroke-width": sw,
        });
        hits += hit(d, x, y, w, h);
        const text = ctx.fmt(spec.y, v);
        if (spec.labels !== false && w >= 24 && h >= 24 && tw(text) <= w)
          labels += inText(x + w / 2, y + h / 2, text, { "data-ink": "a", ...o, "data-key": k });
      };
      const at = (b: BandScale, i: number, size: number) => b.at(i) + (b.bandwidth - size) / 2;
      const [tx, ty] = [at(cx, shaped.categories.length, w), at(cy, shaped.series.length, h)];
      shaped.categories.forEach((c, i) =>
        sum(key(c, TOTAL), at(cx, i, w), ty, m.x[i]!, ctx.fmt(spec.x, c), tot),
      );
      shaped.visible.forEach((j, n) => {
        const ser = shaped.series[j]!;
        sum(key(TOTAL, ser), tx, at(cy, n, h), m.series[j]!, tot, ser);
      });
      sum(key(TOTAL, TOTAL), tx, ty, m.all, tot, tot);
    }
    // Swatches: a quantile's class steps; rank (lowest, median, highest) two halves; else one gradient.
    const swatch = steps ?? (legendLabels.length > 2 ? [2, 7] : null);
    const legend =
      cells.length > 0
        ? `<div class="maya-legend" data-maya="ramp"><b>${esc(spec.titles.get(spec.y) ?? spec.y)}</b>${legendLabels
            .map(
              (b, k) =>
                `<span>${esc(ctx.fmt(spec.y, b))}</span>` +
                (k < legendLabels.length - 1
                  ? `<i${swatch ? ` data-q="${swatch[k]}"` : ""}></i>`
                  : ""),
            )
            .join("")}</div>`
        : "";
    return { marks, hits, labels, grid: "", legend };
  },
};
