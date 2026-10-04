import { bandScale } from "../scale.ts";
import { el, r } from "../svg.ts";
import type { BandScale, Layout, LinearScale, ResolvedSpec, Shaped } from "../types.ts";

const MIN = 24;

export function barMarks(ctx: {
  spec: ResolvedSpec;
  shaped: Shaped;
  layout: Layout;
  x: BandScale;
  y: LinearScale;
  fmt: (v: number) => string;
}): { marks: string; hits: string } {
  const { spec, shaped, x, y, fmt } = ctx;
  const keys = shaped.visible.map((j) => shaped.series[j]!);
  const inner = bandScale(keys, [0, x.bandwidth], 0.1, 0);
  let marks = "";
  let hits = "";
  for (const c of shaped.cells) {
    if (c.value === null) continue;
    const k = shaped.visible.indexOf(c.si);
    const bx = x.at(c.ci) + (spec.stack ? 0 : inner.at(k));
    const w = spec.stack ? x.bandwidth : inner.bandwidth;
    const top = y.of(Math.max(c.y0, c.y1));
    const h = Math.abs(y.of(c.y0) - y.of(c.y1));
    const cat = shaped.categories[c.ci]!;
    const ser = shaped.series[c.si]!;
    const d = {
      "data-key": encodeURIComponent(ser) + "~" + encodeURIComponent(cat),
      "data-c": c.ci,
      "data-s": c.si % 8,
      "data-x": cat,
      "data-series": ser,
      "data-f": fmt(c.value),
      "data-neg": c.value < 0,
    };
    marks += el("rect", {
      "data-maya": "mark",
      ...d,
      x: r(bx),
      y: r(top),
      width: r(w),
      height: r(h),
    });
    if (w < MIN || h < MIN) {
      const gw = Math.max(w, MIN);
      const gh = Math.max(h, MIN);
      hits += el("rect", {
        "data-maya": "hit",
        ...d,
        x: r(bx - (gw - w) / 2),
        y: r(top - (gh - h) / 2),
        width: r(gw),
        height: r(gh),
        fill: "transparent",
      });
    }
  }
  return { marks, hits };
}
