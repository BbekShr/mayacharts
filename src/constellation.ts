/*
 * mayacharts/constellation: rows as stars, placed by similarity. Imports only registry, svg,
 * scale, ticks and types. M0 stub: registers the type and draws nothing; M1 fills in draw().
 *
 * Spec: x = name (one star per row), y = 2 or more measures (validate: too-few-measures; all
 * shown, no measure toggle, as parallel), optional size (star area) and colorBy.
 * Algorithm:
 *   - Standardise each measure (z-scores; a constant measure contributes 0).
 *   - Deterministic 2-D PCA: a fixed number of power iterations from a fixed start vector,
 *     each component sign-normalised (largest loading positive) so the layout never flips
 *     between renders. Same input, same bytes.
 *   - Lines to each star's nearest neighbour. Each star carries data-n (its index) and data-a
 *     (its 3 nearest star indexes), so hover lights them through the flows' existing data-a
 *     lighting; the tooltip can say text.nearest.
 *   - Labels on the largest 5 stars via ctx.label() collision. Description: text.alike with
 *     the measure titles.
 *   - Stars are `<circle data-maya="mark">` keyed `c~NAME` (svg.ts nameId for repeats).
 * Borrow: spec.measures (parallel), data-a (flow), keyboard arrows like scatter, select.
 */
import { register } from "./core/registry.ts";
import type { Mark } from "./core/types.ts";

export const constellation: Mark = {
  noun: "Constellation",
  draw: () => ({ marks: "", hits: "" }),
};

register("constellation", constellation);
