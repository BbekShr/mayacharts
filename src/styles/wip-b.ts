// Designer B's CSS for M2 (parallel brush, beeswarm peers); appended to the stylesheet by theme.ts.
export const wipB =
  // Parallel brush: lines outside every range fade; the range is a band on its axis (the cross group is hidden by default).
  "[data-off]{opacity:.12}" +
  "[data-maya=cross]:has([data-range]){opacity:1}" +
  "rect[data-range]{fill:var(--maya-accent);fill-opacity:.2;stroke:var(--maya-accent);pointer-events:none}" +
  "rect[data-maya=axis]{cursor:ns-resize}" +
  // Beeswarm select { peers }: the peers keep their ink, the rest step back; their mean is a dashed rule with a label.
  "[data-maya=marks]:has([data-peer-on]) [data-peer]:not([data-peer-on]){opacity:.3}" +
  "[data-peer-on]{stroke:var(--maya-fg);stroke-width:1.5}" +
  "[data-maya=grid] line[data-peer-mean]{stroke:var(--maya-fg);stroke-width:1.25;stroke-dasharray:4 3;pointer-events:none}" +
  "[data-maya=labels] text[data-peer-mean]{fill:var(--maya-fg);font-weight:600;pointer-events:none}";
