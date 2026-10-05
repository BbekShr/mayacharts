import { colorVals, thin } from "../shape.ts";
import { bands, el, key, OTHER, r } from "../svg.ts";
import type { Axis, BandScale, Cell, Mark } from "../types.ts";

// One hover target per 6 px of plot width; a denser category list keeps each bucket's low and high.
const PX = 6;

/** Rows of areas, first series on top, each scaled 0..global max so peaks overlap the row above. */
export const ridgeline: Mark = {
  noun: "Ridgeline",
  axes: (spec, shaped) => [
    { kind: "band", field: spec.x, domain: shaped.categories } satisfies Axis,
    {
      kind: "band",
      field: spec.series ?? "",
      domain: shaped.visible.map((i) => shaped.series[i]!),
    },
  ],
  draw(ctx) {
    const { spec, shaped, plot } = ctx;
    const cat = ctx.x as BandScale;
    const row = ctx.y as BandScale;
    const cvOf = colorVals(spec);
    const px = (ci: number) => r(cat.at(ci) + cat.bandwidth / 2);
    let max = 0;
    for (const c of shaped.cells) if (c.value !== null && c.value > max) max = c.value;
    if (max <= 0) max = 1;
    // Baseline = bottom of each band; the peak reaches 1.4 bands up unless the top row would leave the plot.
    const base = (ri: number) => row.at(ri) + row.bandwidth / 2 + row.step / 2;
    const tall = Math.min(1.4 * row.step, base(0) - plot.y);

    // Categories to draw: all, or the thinned union over the visible series.
    // shape lays cells out category by category, one per visible series.
    const nv = shaped.visible.length;
    const keep = thin(
      shaped.visible.map((_, vi) =>
        shaped.categories.map((_, ci) => shaped.cells[ci * nv + vi]!.value),
      ),
      Math.floor(plot.w / PX),
    );
    const kept = new Set(keep);

    let rows = "";
    let dots = "";
    shaped.visible.forEach((si, ri) => {
      const ser = shaped.series[si]!;
      const b = base(ri);
      const py = (v: number) => r(b - (v / max) * tall);
      const cells: Cell[] = shaped.cells
        .filter((c) => c.si === si && kept.has(c.ci))
        .sort((a, c) => a.ci - c.ci);
      const runs: Cell[][] = [[]];
      for (const c of cells) {
        if (c.value === null) {
          runs.push([]);
          continue;
        }
        runs[runs.length - 1]!.push(c);
        const cname = shaped.categories[c.ci]!;
        const cv = cvOf(cname, ser);
        dots += el("circle", {
          "data-maya": "mark",
          "data-key": key(ser, cname),
          "data-c": c.ci,
          "data-s": si % 8,
          "data-x": ctx.fmt(spec.x, cname),
          "data-series": ser,
          "data-y": c.value,
          "data-f": ctx.fmt(spec.y, c.value),
          "data-neg": c.value < 0,
          "data-tone": ctx.tone(c.value),
          "data-q": cv === null ? null : ctx.q(cv),
          "data-other": cname === OTHER,
          r: 3,
          cx: px(c.ci),
          cy: py(c.value),
        });
      }
      const pts = (run: Cell[]) => run.map((c, i) => `${i ? "L" : "M"}${px(c.ci)} ${py(c.value!)}`);
      const live = runs.filter((run) => run.length > 0);
      const area = live
        .map(
          (run) => `${pts(run).join("")}L${px(run.at(-1)!.ci)} ${r(b)}L${px(run[0]!.ci)} ${r(b)}Z`,
        )
        .join("");
      if (area)
        rows += el("path", {
          "data-maya": "area",
          "data-ridge": true,
          "data-key": key("a", ser),
          "data-s": si % 8,
          d: area,
        });
      rows += el("path", {
        "data-maya": "line",
        "data-key": key("l", ser),
        "data-s": si % 8,
        pathLength: 1,
        d: live.map((run) => pts(run).join("")).join("") || null,
      });
    });

    // One band per drawn category.
    const hits = bands(plot, keep, (c) => cat.at(c) + cat.bandwidth / 2);
    return {
      marks: rows + dots,
      hits,
      cross: el("line", { x1: 0, x2: 0, y1: r(plot.y), y2: r(plot.y + plot.h) }),
    };
  },
};
