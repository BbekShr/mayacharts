import type { Ticks } from "./types.ts";

const clean = (n: number) => parseFloat(n.toPrecision(12));

export function niceTicks(min: number, max: number, target = 5): Ticks {
  if (max === min) {
    [min, max] = min === 0 ? [0, 1] : [min - 1, max + 1];
  }
  const base = 10 ** Math.floor(Math.log10((max - min) / target));
  let step = base;
  let best = Infinity;
  // Crossing zero, a coarse step pads the short side by a whole step (stacked negatives
  // reaching -200 for -40), so take the tightest domain with up to target + 3 ticks instead.
  const cross = min < 0 && max > 0;
  for (const m of [1, 2, 2.5, 5, 10]) {
    const s = base * m;
    const lo = Math.floor(min / s + 1e-9);
    const n = Math.ceil(max / s - 1e-9) - lo + 1;
    const score = cross
      ? n > target + 3
        ? Infinity
        : (n - 1 + Math.abs(n - target) / 1e3) * s
      : Math.abs(n - target);
    if (score < best - 1e-9 * Math.abs(score)) {
      best = score;
      step = s;
    }
  }
  const lo = Math.floor(min / step + 1e-9);
  const hi = Math.ceil(max / step - 1e-9);
  const values: number[] = [];
  for (let i = lo; i <= hi; i++) values.push(clean(i * step));
  return { domain: [clean(lo * step), clean(hi * step)], values, step: clean(step) };
}
