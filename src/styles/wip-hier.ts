// Rules for hierarchy, flow and geo, folded into theme.ts by the owner:
// - treemap: dark ink on the full-strength slot fills, and the depth tint a drilled branch gets
//   (the circle[data-tint] steps, widened to [data-tint] in theme.ts; toward white, so the dark ink holds in both themes);
// - hexmap: ramp steps 7 and 8 take light text only in light mode (the top step in both).
export const HIER =
  "svg:has(rect[data-depth]) [data-maya=labels] [data-in]{fill:#12161c}" +
  "rect[data-tint]{fill:color-mix(in oklab,var(--c) var(--t,100%),#fff)}" +
  "[data-maya=labels] [data-dark=l]{fill:light-dark(var(--maya-bg),var(--maya-fg))}";
