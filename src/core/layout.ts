import type { Layout, ResolvedSpec, Shaped } from "./types.ts";

const w = (s: string) => s.length * 7.2 + 8;
const maxW = (a: readonly string[]) => a.reduce((m, s) => Math.max(m, w(s)), 0);

export function layout(
  spec: ResolvedSpec,
  shaped: Shaped,
  yLabels: readonly string[],
  size: { width: number; height: number },
): Layout {
  const left = (spec.yAxis ? maxW(yLabels) + 10 : 8) + (spec.yLabel ? 18 : 0);
  const bottom = (spec.xAxis ? 24 : 8) + (spec.xLabel ? 18 : 0);
  const pw = Math.max(1, size.width - left - 12);
  const ph = Math.max(1, size.height - 10 - bottom);
  const step = pw / Math.max(1, shaped.categories.length);
  return {
    width: size.width,
    height: size.height,
    plot: { x: left, y: 10, w: pw, h: ph },
    xLabelEvery: Math.max(1, Math.ceil(maxW(shaped.categories) / step)),
  };
}
