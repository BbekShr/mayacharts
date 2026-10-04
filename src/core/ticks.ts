import type { Ticks } from "./types.ts";

const clean = (n: number) => parseFloat(n.toPrecision(12));

export function niceTicks(min: number, max: number, target = 5): Ticks {
  if (max === min) {
    [min, max] = min === 0 ? [0, 1] : [min - 1, max + 1];
  }
  const base = 10 ** Math.floor(Math.log10((max - min) / target));
  let step = base;
  let best = Infinity;
  for (const m of [1, 2, 2.5, 5, 10]) {
    const s = base * m;
    const n = Math.ceil(max / s - 1e-9) - Math.floor(min / s + 1e-9) + 1;
    if (Math.abs(n - target) < best) {
      best = Math.abs(n - target);
      step = s;
    }
  }
  const lo = Math.floor(min / step + 1e-9);
  const hi = Math.ceil(max / step - 1e-9);
  const values: number[] = [];
  for (let i = lo; i <= hi; i++) values.push(clean(i * step));
  return { domain: [clean(lo * step), clean(hi * step)], values, step: clean(step) };
}
