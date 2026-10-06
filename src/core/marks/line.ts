import { colorVals } from "../shape.ts";
import { el, key, OTHER, plotHit, r } from "../svg.ts";
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
    const cells: Cell[] = shaped.cells.filter((c) => c.si === si); // ascending ci, as shape lays them out
    let d = "";
    let gap = true;
    // ponytail: on a time axis a hole wider than 5x the series' median gap breaks the line;
    // a fixed factor, not a spec option.
    const T = shaped.time;
    const ts = T ? cells.filter((c) => c.value !== null).map((c) => T[c.ci]!) : [];
    const gaps = ts
      .flatMap((v, i) => (i && v > ts[i - 1]! ? [v - ts[i - 1]!] : []))
      .sort((a, b) => a - b);
    const hole = (gaps[gaps.length >> 1] ?? Infinity) * 5;
    let prev = -Infinity;
    // Area runs: stacked areas treat null as 0 (shape did), so they never break.
    const runs: Cell[][] = [[]];
    for (const [i, c] of cells.entries()) {
      if (T && c.value !== null) {
        if (T[c.ci]! - prev > hole) {
          gap = true;
          if (!spec.stack) runs.push([]);
        }
        prev = T[c.ci]!;
      }
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
        "data-i": shaped.index?.[c.ci],
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
      if (spec.labels) {
        // Off the stroke: above a peak, below a trough, and on a slope into the free corner (up-left
        // when rising, up-right when falling).
        const at = (j: number) => (cells[j]?.value == null ? c.y1 : cells[j]!.y1);
        const [p, q] = [at(i - 1), at(i + 1)];
        const [lx, ly, text] = [+px(c.ci), val.of(c.y1), ctx.fmt(spec.y, c.value)];
        if (p <= c.y1 && q <= c.y1) ctx.label(lx, ly, text, "above");
        else if (p >= c.y1 && q >= c.y1) ctx.label(lx, ly, text, "below");
        else if (p < c.y1) ctx.label(lx - 5, ly - 9, text, "end");
        else ctx.label(lx + 5, ly - 9, text, "start");
      }
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

  return {
    marks: areas + lines + dots,
    hits: plotHit(plot),
    cross: el("line", { x1: 0, x2: 0, y1: r(plot.y), y2: r(plot.y + plot.h) }),
  };
}

/** Line and area share one file: crosshair contract, stack for area. */
export const line: Mark = { noun: "Line", axes, draw: (ctx) => draw(ctx, false) };
export const area: Mark = { noun: "Area", axes, draw: (ctx) => draw(ctx, true) };
