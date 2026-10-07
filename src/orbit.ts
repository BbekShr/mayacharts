/*
 * mayacharts/orbit: an orrery of categories. Imports only registry, svg, scale, ticks and
 * types. M0 stub: registers the type and draws nothing; M1 fills in draw().
 *
 * Spec: x = category (a planet), y = value (planet size), optional y2 = growth (speed and
 * direction; shaped.y2 holds it per category). sort and limit work (limit rolls up an Other
 * planet), colorBy too.
 * Algorithm:
 *   - Orbit radius by rank of y (largest innermost); planet radius by sqrt(y); the total sits
 *     at the sun as a text mark keyed `t` that counts up (as radial's centre).
 *   - Each planet is a `<g>`/mark carrying data-v (speed bucket 1 to 5 from |growth|) and
 *     data-neg for negative growth (reverse orbit), data-tone from growth sign.
 *   - A static trail arc whose sweep is the growth, so the chart reads with motion off, in SSR
 *     and in toSVG().
 *   - Motion is a theme rule, not JS: under prefers-reduced-motion: no-preference,
 *     [data-maya=mark][data-v] runs a linear infinite rotation per bucket, reversed for
 *     [data-neg], paused on svg :hover. // ponytail: speed quantised to 5 buckets.
 *   - Description sentence: text.speedBy with the y2 title.
 * Borrow: the radial centre count-up, data-neg, limit's Other bucket, select.
 */
import { register } from "./core/registry.ts";
import type { Mark } from "./core/types.ts";

export const orbit: Mark = {
  noun: "Orbit",
  draw: () => ({ marks: "", hits: "" }),
};

register("orbit", orbit);
