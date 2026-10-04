import { bandScale } from "../scale.ts";
import { colorVals } from "../shape.ts";
import { el, hit, key, OTHER, r } from "../svg.ts";
import type { Axis, BandScale, LinearScale, Mark, ResolvedSpec, Shaped } from "../types.ts";

interface Item {
  ci: number;
  si: number;
  y0: number;
  y1: number;
  /** Raw value shown (waterfall total: the running total). */
  v: number;
  /** data-s: series slot; waterfall 0 up / 1 down / 2 total. */
  s: number;
}

/** Waterfall: delta bars float on the running total; `totals` categories draw it from 0. */
function steps(shaped: Shaped): Item[] {
  const by: (typeof shaped.cells)[number][] = [];
  for (const c of shaped.cells) by[c.ci] = c;
  const si = shaped.visible[0] ?? 0;
  let run = 0;
  const out: Item[] = [];
  shaped.categories.forEach((_, ci) => {
    const c = by[ci];
    if (!c) return;
    if (shaped.totals[ci]) return void out.push({ ci, si, y0: 0, y1: run, v: run, s: 2 });
    if (c.value === null) return;
    out.push({ ci, si, y0: run, y1: (run += c.value), v: c.value, s: c.value < 0 ? 1 : 0 });
  });
  return out;
}

const items = (spec: ResolvedSpec, shaped: Shaped): Item[] =>
  spec.type === "waterfall"
    ? steps(shaped)
    : shaped.cells.flatMap((c) =>
        c.value === null
          ? []
          : [{ ci: c.ci, si: c.si, y0: c.y0, y1: c.y1, v: c.value, s: c.si % 8 }],
      );

export const bar: Mark = {
  noun: "Bar",
  axes(spec, shaped) {
    let lo = shaped.extent[0];
    let hi = shaped.extent[1];
    if (spec.type === "waterfall") {
      lo = hi = 0;
      for (const i of steps(shaped))
        ((lo = Math.min(lo, i.y0, i.y1)), (hi = Math.max(hi, i.y0, i.y1)));
    }
    const cat: Axis = { kind: "band", field: spec.x, domain: shaped.categories };
    const val: Axis = { kind: "linear", field: spec.y, domain: [lo, hi] };
    return spec.horizontal ? [val, cat] : [cat, val];
  },
  draw(ctx) {
    const { spec, shaped } = ctx;
    const hz = spec.horizontal;
    const cat = (hz ? ctx.y : ctx.x) as BandScale;
    const val = (hz ? ctx.x : ctx.y) as LinearScale;
    const keys = shaped.visible.map((j) => shaped.series[j]!);
    const inner = bandScale(keys, [0, cat.bandwidth], 0.1, 0);
    const cvOf = colorVals(spec);
    let marks = "";
    let hits = "";
    for (const c of items(spec, shaped)) {
      const k = shaped.visible.indexOf(c.si);
      const pos = cat.at(c.ci) + (spec.stack || spec.type === "waterfall" ? 0 : inner.at(k));
      const th = spec.stack || spec.type === "waterfall" ? cat.bandwidth : inner.bandwidth;
      const [a, b] = [val.of(c.y0), val.of(c.y1)];
      const lo = Math.min(a, b);
      const len = Math.abs(a - b);
      const [x, y, w, h] = hz ? [lo, pos, len, th] : [pos, lo, th, len];
      const cname = shaped.categories[c.ci]!;
      const ser = shaped.series[c.si]!;
      const cv = cvOf(cname, ser);
      const d = {
        "data-key": key(ser, cname),
        "data-c": c.ci,
        "data-s": c.s,
        "data-x": ctx.fmt(spec.x, cname),
        "data-series": ser,
        "data-f": ctx.fmt(spec.y, c.v),
        "data-y": c.v,
        "data-neg": c.v < 0,
        "data-tone": ctx.tone(c.v),
        "data-q": cv === null ? null : ctx.q(cv),
        "data-other": cname === OTHER,
        "data-total": shaped.totals[c.ci], // waterfall running total: neutral colour
      };
      marks += el("rect", {
        "data-maya": "mark",
        ...d,
        x: r(x),
        y: r(y),
        width: r(w),
        height: r(h),
      });
      hits += hit(d, x, y, w, h);
      if (spec.labels) {
        // Inside when it fits, else outside the bar end (collisions are dropped by ctx.label).
        const text = ctx.fmt(spec.y, c.v);
        const est = text.length * 7.2 + 4;
        const [cx, cy] = [x + w / 2, y + h / 2];
        const neg = c.v < 0;
        if (hz)
          est <= w && h >= 14
            ? ctx.label(cx, cy, text, "center")
            : ctx.label(neg ? x - 4 : x + w + 4, cy, text, neg ? "end" : "start");
        else
          est <= w && h >= 16
            ? ctx.label(cx, cy, text, "center")
            : ctx.label(cx, neg ? y + h : y, text, neg ? "below" : "above");
      }
    }
    return { marks, hits };
  },
};
