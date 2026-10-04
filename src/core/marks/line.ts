import { el, key, OTHER, r } from "../svg.ts";
import type { Axis, BandScale, Cell, LinearScale, Mark, MarkCtx, MarkOut } from "../types.ts";

const axes: Mark["axes"] = (spec, shaped) => [
  { kind: "band", field: spec.x, domain: shaped.categories } satisfies Axis,
  // ponytail: 0-anchored via shape's extent (also for line); yDomain overrides in layout.
  { kind: "linear", field: spec.y, domain: shaped.extent } satisfies Axis,
];

function draw(ctx: MarkCtx, fill: boolean): MarkOut {
  const { spec, shaped, plot } = ctx;
  const cat = ctx.x as BandScale;
  const val = ctx.y as LinearScale;
  const cb = typeof spec.colorBy === "string" && spec.colorBy !== "sign" ? spec.colorBy : null;
  const rows = new Map<string, number[]>();
  if (cb)
    for (const row of spec.data) {
      const v = row[cb];
      if (typeof v !== "number") continue;
      const k = String(row[spec.x]) + "\0" + (spec.series === null ? "" : String(row[spec.series]));
      (rows.get(k) ?? rows.set(k, []).get(k)!).push(v);
    }
  const red = ctx.agg(spec.aggregate);
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
      const cv = cb ? red(rows.get(cname + "\0" + ser) ?? []) : null;
      const other = cname === OTHER;
      const x = other ? ctx.t("other") : cname;
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
  shaped.categories.forEach((_, ci) => {
    hits += el("rect", {
      "data-maya": "hit",
      "data-c": ci,
      x: r(cat.at(ci)),
      y: r(plot.y),
      width: r(cat.bandwidth),
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
