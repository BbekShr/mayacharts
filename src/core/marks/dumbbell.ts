import { el, hit, key, OTHER, r } from "../svg.ts";
import type { Axis, BandScale, LinearScale, Mark } from "../types.ts";

/** Two dots per category (series 0 = from, 1 = to) joined by a connector toned by colorBy "sign". */
export const dumbbell: Mark = {
  noun: "Dumbbell",
  axes(spec, shaped) {
    const cat: Axis = { kind: "band", field: spec.x, domain: shaped.categories };
    const val: Axis = { kind: "linear", field: spec.y, domain: shaped.extent };
    return spec.horizontal ? [val, cat] : [cat, val];
  },
  draw(ctx) {
    const { spec, shaped } = ctx;
    const hz = spec.horizontal;
    const cat = (hz ? ctx.y : ctx.x) as BandScale;
    const val = (hz ? ctx.x : ctx.y) as LinearScale;
    const rad = Math.max(3, Math.min(5, cat.bandwidth / 2 - 1));
    // ponytail: sort stays shape's total-across-series order; sorting by the gap is out of scope.
    const pairs = new Map<number, [number?, number?]>();
    for (const c of shaped.cells)
      if (c.value !== null && c.si < 2)
        (pairs.get(c.ci) ?? pairs.set(c.ci, []).get(c.ci)!)[c.si] = c.value;
    let links = "";
    let dots = "";
    let hits = "";
    for (const [ci, p] of [...pairs].sort((a, b) => a[0] - b[0])) {
      const cname = shaped.categories[ci]!;
      const mid = cat.at(ci) + cat.bandwidth / 2;
      const at = (v: number): [number, number] => (hz ? [val.of(v), mid] : [mid, val.of(v)]);
      const [from, to] = p;
      if (from !== undefined && to !== undefined) {
        const [x1, y1] = at(from);
        const [x2, y2] = at(to);
        links += el("line", {
          "data-maya": "link",
          "data-key": key("k", cname),
          "data-c": ci,
          "data-tone": ctx.tone(to - from),
          "stroke-width": 2,
          x1: r(x1),
          y1: r(y1),
          x2: r(x2),
          y2: r(y2),
        });
      }
      for (const si of [0, 1]) {
        const v = p[si];
        if (v === undefined) continue;
        const [cx, cy] = at(v);
        const ser = shaped.series[si]!;
        const d = {
          "data-key": key(ser, cname),
          "data-c": ci,
          "data-s": si % 8,
          "data-x": ctx.fmt(spec.x, cname),
          "data-series": ser,
          "data-f": ctx.fmt(spec.y, v),
          "data-y": v,
          "data-neg": v < 0,
          "data-other": cname === OTHER,
        };
        dots += el("circle", { "data-maya": "mark", ...d, cx: r(cx), cy: r(cy), r: rad });
        hits += hit(d, cx - rad, cy - rad, rad * 2, rad * 2);
        if (spec.labels) {
          // "to" beyond its dot, "from" on the other side; pixel direction of from -> to.
          const other = p[1 - si];
          const [ox, oy] = at(other ?? v);
          const text = ctx.fmt(spec.y, v);
          const down = hz ? cx >= ox : cy >= oy;
          const side = other === undefined ? hz : si === 1 ? down : !down;
          if (hz) ctx.label(cx + (side ? rad + 4 : -rad - 4), cy, text, side ? "start" : "end");
          else ctx.label(cx, cy + (side ? rad : -rad), text, side ? "below" : "above");
        }
      }
    }
    return { marks: links + dots, hits };
  },
};
