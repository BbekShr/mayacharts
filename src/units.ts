/*
 * mayacharts/units: one dot per row that flies between forms. Imports only registry, svg,
 * scale, ticks and types. M0 stub: registers the type and draws nothing; M1 fills in draw().
 *
 * Spec: x = group, y = value (the swarm form's axis), name = row identity (the key), optional
 * colorBy. spec.forms (default ["waffle", "bars", "swarm"]) lists the forms; view.form picks
 * one (ResolvedSpec.forms / .form, clamped). Core draws the form control (a `.maya-ctl`
 * radiogroup with data-maya="form", labels text.waffle / bars / swarm) when there are 2+ forms.
 * Algorithm (ctx.spec.forms[ctx.spec.form]):
 *   - waffle: a square grid of dots in data order, coloured by x (data-s = group index % 8).
 *   - bars: one column of stacked dots per x (a unit bar chart).
 *   - swarm: dots along y, dodged like beeswarm.
 *   - Every dot is `<circle data-maya="mark">` keyed `u~NAME` (svg.ts nameId for repeats, the row
 *     index when there is no name), so a form change is an ordinary keyed update: the existing
 *     translate FLIP in animate.ts flies the dots with no new animation code.
 * Borrow: beeswarm's 5000-mark cap and dodge, one hover target per N px, keyboard arrows like
 *   scatter, select, colorBy (ctx.tone / ctx.q), the "Each dot is one {0}" note (text.perDot).
 */
import { register } from "./core/registry.ts";
import type { Mark } from "./core/types.ts";

export const units: Mark = {
  noun: "Unit",
  draw: () => ({ marks: "", hits: "" }),
};

register("units", units);
