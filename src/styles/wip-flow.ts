// Hexmap label ink by ramp step, each measured against its fill at 4.5:1: black on steps 8 and 9 (both
// themes), white on dark steps 6 and 7, else the text colour. Dimmed cells (hover) lose the black.
export const HEXINK =
  "svg:not(:has([data-active])) [data-maya=labels] text[data-q][data-dark]{fill:#000}" +
  '[data-maya=labels] :is([data-q="6"],[data-q="7"]){fill:light-dark(var(--maya-fg),#fff)}';
