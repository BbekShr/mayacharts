import { clip, tw } from "../layout.ts";
import { colorVals } from "../shape.ts";
import { el, esc, key, OTHER, plotHit, r } from "../svg.ts";
import type { Axis, BandScale, Cell, LinearScale, Mark, MarkCtx, MarkOut } from "../types.ts";

const axes: Mark["axes"] = (spec, shaped) => [
  shaped.time
    ? ({ kind: "time", field: spec.x, domain: shaped.categories, t: shaped.time } satisfies Axis)
    : ({ kind: "band", field: spec.x, domain: shaped.categories } satisfies Axis),
  // ponytail: 0-anchored via shape's extent (also for line); yDomain overrides in layout.
  { kind: "linear", field: spec.y, domain: shaped.extent } satisfies Axis,
];

// Direct end labels instead of a legend: 2 to 8 series, all visible (a hidden one needs the legend
// toggle back), no value labels, one axis.
const ends: NonNullable<Mark["ends"]> = (spec, shaped, fmt) =>
  spec.labels ||
  spec.y2 !== null ||
  shaped.visible.length !== shaped.series.length ||
  shaped.visible.length < 2 ||
  shaped.visible.length > 8
    ? []
    : shaped.visible.flatMap((si) => {
        const c = shaped.cells.filter((c) => c.si === si && c.value !== null).at(-1);
        return c
          ? [
              [spec.titles.get(shaped.series[si]!) ?? shaped.series[si]!, fmt(spec.y, c.value)] as [
                string,
                string,
              ],
            ]
          : [];
      });

function draw(ctx: MarkCtx, fill: boolean): MarkOut {
  const { spec, shaped, plot } = ctx;
  const cat = ctx.x as BandScale;
  const val = ctx.y as LinearScale;
  const cvOf = colorVals(spec);
  const px = (ci: number) => r(cat.at(ci) + cat.bandwidth / 2);

  let areas = "";
  let lines = "";
  let dots = "";
  const ep: [number, number, string, number][] = [];
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
    const path = cells.flatMap((c) =>
      c.value === null ? [] : [[px(c.ci), val.of(c.y1)] as const],
    );
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
        // Off the stroke: the first of above/below/left/right (a peak, trough, rise or fall prefers
        // its own) whose estimated box meets no segment of this series.
        const at = (j: number) => (cells[j]?.value == null ? c.y1 : cells[j]!.y1);
        const [p, q] = [at(i - 1), at(i + 1)];
        const [lx, ly, text] = [+px(c.ci), val.of(c.y1), ctx.fmt(spec.y, c.value)];
        const w = text.length * 7.2 + 4;
        const C = [
          [lx, ly, "above", lx - w / 2, ly - 16],
          [lx, ly, "below", lx - w / 2, ly + 2],
          [lx - 5, ly - 9, "end", lx - 5 - w, ly - 16],
          [lx + 5, ly - 9, "start", lx + 5, ly - 16],
        ] as const;
        const f = p <= c.y1 && q <= c.y1 ? 0 : p >= c.y1 && q >= c.y1 ? 1 : p < c.y1 ? 2 : 3;
        const o = [C[f], ...C.filter((_, k) => k !== f)].find(([, , , l, t]) =>
          path.every(([x1, y1], j) => {
            const [x0, y0] = path[j - 1] ?? [x1, y1];
            const [a, b] = [Math.max(x0, l), Math.min(x1, l + w)];
            if (a > b || x1 === x0) return true;
            const [ya, yb] = [a, b].map((x) => y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)) as [
              number,
              number,
            ];
            return Math.max(ya, yb) < t || Math.min(ya, yb) > t + 14;
          }),
        );
        if (o) ctx.label(o[0], o[1], text, o[2]);
      }
    }
    const e = path.at(-1);
    if (e) ep.push([e[1], e[0], ser, si]);
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

  // End labels in the right gutter: series colour, name and last value (name alone when the value
  // does not fit), nudged 14 px apart; a short leader when moved more than 3 px.
  let end = "";
  if (ctx.gutter) {
    const tx = ends(spec, shaped, ctx.fmt);
    const o = ep.map((e, i) => [...e, tx[i]!] as const).sort((a, b) => a[0] - b[0]);
    const ys = o.map((e) => e[0]);
    ys.forEach((y, i) => (ys[i] = Math.max(y, i ? ys[i - 1]! + 14 : plot.y)));
    for (let i = ys.length - 1; i >= 0; i--)
      ys[i] = Math.min(ys[i]!, i < ys.length - 1 ? ys[i + 1]! - 14 : plot.y + plot.h);
    o.forEach(([ey, x, , si, [n, v]], i) => {
      const full = `${n} ${v}`;
      const fit = ctx.gutter - 12;
      const lab = tw(full) <= fit ? full : clip(n, fit);
      if (Math.abs(ys[i]! - ey) > 3)
        end += el("line", {
          "data-lead": true,
          "data-s": si % 8,
          x1: x + 3,
          y1: ey,
          x2: x + 7,
          y2: ys[i],
        });
      end += el(
        "text",
        {
          "data-end": true,
          "data-s": si % 8,
          x: r(x + 8),
          y: r(ys[i]!),
          "dominant-baseline": "middle",
        },
        esc(lab === full ? n : lab) +
          (lab === full ? `<tspan data-v="" dx="4">${esc(v)}</tspan>` : ""),
      );
    });
  }

  return {
    marks: areas + lines + dots,
    labels: end,
    hits: plotHit(plot),
    cross: el("line", { x1: 0, x2: 0, y1: r(plot.y), y2: r(plot.y + plot.h) }),
  };
}

/** Line and area share one file: crosshair contract, stack for area. */
export const line: Mark = { noun: "Line", axes, ends, draw: (ctx) => draw(ctx, false) };
export const area: Mark = { noun: "Area", axes, ends, draw: (ctx) => draw(ctx, true) };
