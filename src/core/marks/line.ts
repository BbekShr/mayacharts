import { colorVals } from "../shape.ts";
import { el, key, OTHER, r } from "../svg.ts";
import type { Axis, BandScale, Cell, LinearScale, Mark, MarkCtx, MarkOut } from "../types.ts";

const axes: Mark["axes"] = (spec, shaped) => [
  shaped.time
    ? ({ kind: "time", field: spec.x, domain: shaped.categories, t: shaped.time } satisfies Axis)
    : ({ kind: "band", field: spec.x, domain: shaped.categories } satisfies Axis),
  // ponytail: 0-anchored via shape's extent (also for line); yDomain overrides in layout.
  { kind: "linear", field: spec.y, domain: shaped.extent } satisfies Axis,
];

function draw(ctx: MarkCtx, fill: boolean): MarkOut {
  const { spec, shaped, plot } = ctx;
  const cat = ctx.x as BandScale;
  const val = ctx.y as LinearScale;
  const cvOf = colorVals(spec);
  const px = (ci: number) => r(cat.at(ci) + cat.bandwidth / 2);

  let areas = "";
  let lines = "";
  let dots = "";
  for (const si of shaped.visible) {
    const ser = shaped.series[si]!;
    const cells: Cell[] = shaped.cells.filter((c) => c.si === si).sort((a, b) => a.ci - b.ci);
    let d = "";
    let gap = true;
    // Area runs: stacked areas treat null as 0 (shape did), so they never break.
    const runs: Cell[][] = [[]];
    for (const c of cells) {
      if (c.value === null && !spec.stack) runs.push([]);
      else runs[runs.length - 1]!.push(c);
      if (c.value === null) {
        gap = true;
        continue;
      }
      d += `${gap ? "M" : "L"}${px(c.ci)} ${r(val.of(c.y1))}`;
      gap = false;

      const cname = shaped.categories[c.ci]!;
      const cv = cvOf(cname, ser);
      const other = cname === OTHER;
      const x = ctx.fmt(spec.x, cname); // display label: month presets, "Other"
      dots += el("circle", {
        "data-maya": "mark",
        "data-key": key(ser, cname),
        "data-c": c.ci,
        "data-s": si % 8,
        "data-x": x,
        "data-series": ser,
        "data-y": c.value,
        "data-f": ctx.fmt(spec.y, c.value),
        "data-neg": c.value < 0,
        "data-tone": ctx.tone(c.value),
        "data-q": cv === null ? null : ctx.q(cv),
        "data-other": other,
        r: 3,
        cx: px(c.ci),
        cy: r(val.of(c.y1)),
      });
      if (spec.labels) ctx.label(px(c.ci), val.of(c.y1), ctx.fmt(spec.y, c.value), "above");
    }
    if (fill) {
      const sh = runs
        .filter((run) => run.length > 0)
        .map(
          (run) =>
            run.map((c, i) => `${i ? "L" : "M"}${px(c.ci)} ${r(val.of(c.y1))}`).join("") +
            [...run]
              .reverse()
              .map((c) => `L${px(c.ci)} ${r(val.of(c.y0))}`)
              .join("") +
            "Z",
        )
        .join("");
      if (sh)
        areas += el("path", {
          "data-maya": "area",
          "data-key": key("a", ser),
          "data-s": si % 8,
          d: sh,
        });
    }
    lines += el("path", {
      "data-maya": "line",
      "data-key": key("l", ser),
      "data-s": si % 8,
      pathLength: 1,
      d: d || null,
    });
  }

  let hits = "";
  // Time axis: each hit runs from the midpoint with the previous category to the one with the next.
  const mid = (ci: number, d: number) => {
    if (ci + d < 0 || ci + d >= shaped.categories.length) return d < 0 ? plot.x : plot.x + plot.w;
    return (cat.at(ci) + cat.at(ci + d)) / 2 + cat.bandwidth / 2;
  };
  shaped.categories.forEach((_, ci) => {
    const [x0, x1] = shaped.time
      ? [mid(ci, -1), mid(ci, 1)]
      : [cat.at(ci), cat.at(ci) + cat.bandwidth];
    hits += el("rect", {
      "data-maya": "hit",
      "data-c": ci,
      "data-i": shaped.index?.[ci],
      x: r(x0),
      y: r(plot.y),
      width: r(x1 - x0),
      height: r(plot.h),
      fill: "transparent",
    });
  });
  return {
    marks: areas + lines + dots,
    hits,
    cross: el("line", { x1: 0, x2: 0, y1: r(plot.y), y2: r(plot.y + plot.h) }),
  };
}

/** Line and area share one file: crosshair contract, stack for area. */
export const line: Mark = { noun: "Line", axes, draw: (ctx) => draw(ctx, false) };
export const area: Mark = { noun: "Area", axes, draw: (ctx) => draw(ctx, true) };
