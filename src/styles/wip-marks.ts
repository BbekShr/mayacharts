// Fold into theme.ts. Parallel: tick labels get a halo so crossing lines do not strike through them;
// end-label leader lines take their line's colour.
export const wipMarks =
  "[data-maya=labels] [data-ax][data-h]{stroke:var(--maya-bg);stroke-width:3;paint-order:stroke;stroke-linejoin:round}[data-maya=grid] line[data-s]{stroke:var(--c)}" +
  // Ridgeline: opaque tint (no gradient, no alpha) so a lower ridge cleanly occludes the one above.
  "svg:not([data-stack]) [data-maya=area][data-ridge][data-s]{fill:color-mix(in oklab,var(--c) 40%,var(--maya-bg))}";
