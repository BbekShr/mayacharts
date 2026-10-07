/*
 * mayacharts/weave: a bump chart whose threads weave. Imports only registry, svg, scale, ticks
 * and types. M0 stub: registers the type and draws nothing; M1 fills in draw().
 *
 * Spec: x = period (band axis, bottom), y = value, series = one thread each (required).
 * Algorithm:
 *   - Per x, rank the visible series by y, descending (1 = largest; ties in series order). A
 *     null y leaves a gap in that thread.
 *   - Rank sets the vertical position (rank 1 on top); no left value axis.
 *   - Draw one thick path per segment (period i to i + 1), key `w~SERIES~i`, with a `--maya-bg`
 *     halo so a crossing reads as over/under. In each segment the series whose rank improves is
 *     drawn last, so the climber passes over.
 *   - Every segment carries data-s (palette slot) and data-series, so hover lights the whole
 *     thread through the existing line lighting; one point mark per (series, period) holds the
 *     tooltip payload (data-f = formatted y, rank via ctx.t("rank", n)).
 * Borrow: ends() for labels at both ends (with label() collision), the CSS `d` path morph on
 *   update, select and view.hidden (legend toggles threads), colors by series.
 */
import { register } from "./core/registry.ts";
import type { Mark } from "./core/types.ts";

export const weave: Mark = {
  noun: "Weave",
  draw: () => ({ marks: "", hits: "" }),
};

register("weave", weave);
