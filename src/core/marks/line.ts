import { clip, tw } from "../layout.ts";
import { colorVals } from "../shape.ts";
import { el, esc, key, OTHER, plotHit, r, repel } from "../svg.ts";
import { marked, more } from "./bar.ts";
import type {
  Axis,
  BandScale,
  Cell,
  LinearScale,
  Mark,
  MarkCtx,
  MarkOut,
  Shaped,
} from "../types.ts";

/** A log axis spans the smallest to the largest positive value (never 0); linear keeps shape's extent. */
const positive = (scale: string, shaped: Shaped): [number, number] => {
  const v = scale === "log" ? shaped.cells.flatMap((c) => (c.y1 > 0 ? [c.y1] : [])) : [];
  return v.length ? [Math.min(...v), Math.max(...v)] : shaped.extent;
};

const axes: Mark["axes"] = (spec, shaped) => [
  shaped.time
    ? ({ kind: "time", field: spec.x, domain: shaped.categories, t: shaped.time } satisfies Axis)
    : ({ kind: "band", field: spec.x, domain: shaped.categories } satisfies Axis),
  // ponytail: 0-anchored via shape's extent (also for line); yDomain overrides in layout.
  { kind: "linear", field: spec.y, domain: positive(spec.yScale, shaped) } satisfies Axis,
];

// Direct end labels instead of a legend: 1 to 8 series, all visible (a hidden one needs the legend
// toggle back), no value labels, one axis.
const ends: NonNullable<Mark["ends"]> = (spec, shaped, fmt) =>
  spec.labels ||
  spec.y2 !== null ||
  shaped.visible.length !== shaped.series.length ||
  shaped.visible.length < 1 ||
  shaped.visible.length > 8
    ? []
    : shaped.visible.flatMap((si) => {
        const c = shaped.cells.filter((c) => c.si === si && c.value !== null).at(-1);
        const n = shaped.series[si]!;
        return c ? [[spec.titles.get(n) ?? n, fmt(spec.y, c.value)] as [string, string]] : [];
      });

function draw(ctx: MarkCtx, fill: boolean): MarkOut {
  const { spec, shaped, plot } = ctx;
  const cat = ctx.x as BandScale;
  const { of } = ctx.y as LinearScale;
  // A yDomain can exclude data: it sits on the plot edge.
  const val = { of: (v: number) => Math.min(Math.max(of(v), plot.y), plot.y + plot.h) };
  const cvOf = colorVals(spec);
  const px = (ci: number) => r(cat.at(ci) + cat.bandwidth / 2);
  const tipOf = spec.tipFields.map((f) => colorVals(spec, f));
  // A stream's value is its band thickness: its end label sits at the band's middle; the hover markers sit on the stroke (the band top).
  const mid = (c: Cell) => (spec.stack === "stream" ? (c.y0 + c.y1) / 2 : c.y1);
  const series = shaped.visible.map((si) => shaped.cells.filter((c) => c.si === si)); // ascending ci, as shape lays them out
  const paths = series.map((cells) =>
    cells.flatMap((c) => (c.value === null ? [] : [[px(c.ci), val.of(c.y1)] as const])),
  );
  // Where cell c's label sits off the stroke: the first of above/below/left/right (a peak, trough,
  // rise or fall prefers its own) whose estimated box meets no segment of its series.
  const spot = (c: Cell, said?: string) => {
    const k = shaped.visible.indexOf(c.si);
    const [cells, path] = [series[k]!, paths[k]!];
    const i = cells.indexOf(c);
    const at = (j: number) => (cells[j]?.value == null ? c.y1 : cells[j]!.y1);
    const [p, q] = [at(i - 1), at(i + 1)];
    const [lx, ly, text] = [+px(c.ci), val.of(c.y1), said ?? ctx.fmt(spec.y, c.value)];
    const w = tw(text) + 4;
    const f = p <= c.y1 && q <= c.y1 ? 0 : p >= c.y1 && q >= c.y1 ? 1 : p < c.y1 ? 2 : 3;
    // k: 0 above, 1 below, 2 end (left), 3 start (right); l, t the box's left and top.
    const n = [f, 0, 1, 2, 3].find((k) => {
      const l = lx + [-w / 2, -w / 2, -5 - w, 5][k]!;
      const t = ly + (k === 1 ? 2 : -16);
      if (k === 1 && spec.yDomain && ly >= plot.y + plot.h) return false; // would sit on the axis
      return path.every(([x1, y1], j) => {
        const [x0, y0] = path[j - 1] ?? [x1, y1];
        const [a, b] = [Math.max(x0, l), Math.min(x1, l + w)];
        if (a > b || x1 === x0) return true;
        const [ya, yb] = [a, b].map((x) => y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)) as [
          number,
          number,
        ];
        return Math.max(ya, yb) < t || Math.min(ya, yb) > t + 14;
      });
    });
    return n === undefined
      ? null
      : ([
          lx + [0, 0, -5, 5][n]!,
          ly - (n > 1 ? 9 : 0),
          text,
          (["above", "below", "end", "start"] as const)[n]!,
          key(shaped.series[c.si], shaped.categories[c.ci]),
        ] as const);
  };
  // spec.annotate, ahead of plain value labels; the labelled point keeps its dot.
  // ponytail: "last" is skipped beside end labels, which already say it.
  const done = new Set<Cell>();
  marked(
    ctx,
    series.map((cells) => cells.filter((c) => c.value !== null)),
    (c) => shaped.categories[c.ci],
    (c) => c.value!,
    (c, a, said) => {
      const sp = spot(c, said);
      return !!sp && ctx.label(...sp, a) && !!done.add(c);
    },
    ctx.gutter ? spec.annotate.filter((a) => a !== "last") : spec.annotate,
  );

  let areas = "";
  let lines = "";
  let ghosts = "";
  const wasOf = spec.was === null ? null : colorVals(spec, spec.was);
  let dots = "";
  const tx = ctx.ends;
  const ep: [number, number, number, [string, string]][] = [];
  for (const [k, si] of shaped.visible.entries()) {
    const ser = shaped.series[si]!;
    const [cells, path] = [series[k]!, paths[k]!];
    const dash = spec.dash.has(ser);
    let d = "";
    let gap = true;
    let len = 0; // px length of the drawn polyline: a dashed series sets its dash in pathLength units
    let [lx0, ly0] = [0, 0];
    // ponytail: on a time axis a hole wider than 5x the series' median gap breaks the line;
    // a fixed factor, not a spec option.
    const T = shaped.time;
    const ts = T ? cells.filter((c) => c.value !== null).map((c) => T[c.ci]!) : [];
    const gaps = ts
      .flatMap((v, i) => (i && v > ts[i - 1]! ? [v - ts[i - 1]!] : []))
      .sort((a, b) => a - b);
    // ponytail: a thinned series' median step is the thinning's, not the data's; its kept points sit at most 3 mean steps apart, so a hole of 6 mean steps (about 6 px) breaks it. Smaller real gaps do not show.
    const hole = shaped.reduced
      ? ((ts.at(-1) ?? 0) - (ts[0] ?? 0)) * (6 / (ts.length || 1))
      : (gaps[gaps.length >> 1] ?? Infinity) * 5;
    let prev = -Infinity;
    // Area runs: stacked areas treat null as 0 (shape did), so they never break.
    const runs: Cell[][] = [[]];
    for (const c of cells) {
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
      const [qx, qy] = [+px(c.ci), r(val.of(c.y1))];
      if (!gap) len += Math.hypot(qx - lx0, qy - ly0);
      [lx0, ly0] = [qx, qy];
      d += `${gap ? "M" : "L"}${qx} ${qy}`;
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
        "data-more": more(ctx, (_, k) => tipOf[k]!(cname, ser)),
        "data-dash": dash,
        "data-em": spec.emphasis.has(ser),
        "data-last": done.has(c), // an annotated point keeps its dot
        r: 3,
        cx: px(c.ci),
        cy: r(val.of(c.y1)),
      });
      const sp = spec.labels && !done.has(c) ? spot(c) : null;
      if (sp) ctx.label(...sp);
    }
    const e = path.at(-1);
    const lc = cells.filter((c) => c.value !== null).at(-1);
    if (e && lc) ep.push([val.of(mid(lc)), e[0], si, tx[ep.length]!]);
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
    // spec.was: the old values as a dashed ghost line (gaps break it), under the line.
    const wd = wasOf
      ? cells
          .map((c) => [c, wasOf(shaped.categories[c.ci]!, ser)] as const)
          .reduce(
            (a, [c, v], i, all) =>
              v === null
                ? a
                : a + (all[i - 1]?.[1] == null ? "M" : "L") + `${px(c.ci)} ${r(val.of(v))}`,
            "",
          )
      : "";
    if (wd)
      ghosts += el("path", {
        "data-key": key("\u0000was", ser),
        "data-past": true,
        "data-s": si % 8,
        fill: "none", // until the theme's [data-past] rule paints it
        d: wd,
      });
    lines += el("path", {
      "data-maya": "line",
      "data-key": key("l", ser),
      "data-s": si % 8,
      "data-dash": dash,
      "data-em": spec.emphasis.has(ser),
      pathLength: 1,
      // pathLength 1 (the entrance wipe) makes a dash a fraction of the line: 6 px on, 4 off.
      "stroke-dasharray":
        dash && len ? `${+(6 / len).toPrecision(3)} ${+(4 / len).toPrecision(3)}` : null,
      d: d || null,
    });
  }

  // End labels in the right gutter: series colour, name and last value (name alone when the value
  // does not fit), nudged 14 px apart; a short leader when moved more than 3 px.
  let end = "";
  if (ctx.gutter) {
    const o = ep.sort((a, b) => a[0] - b[0]);
    const ys = repel(
      o.map((e) => e[0]),
      plot.y,
      plot.y + plot.h,
      14,
    );
    o.forEach(([ey, x, si, [n, v]], i) => {
      // The value always stays; the name is whole if it fits beside it, else ellipsized into what is left
      // of the gutter, else dropped (short of about 8 characters it says too little: the legend names it).
      const room = ctx.gutter - 12 - tw(v) - 4;
      const name = ctx.width < 400 ? "" : tw(n) <= room ? n : room < 56 ? "" : clip(n, room);
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
          "data-key": key("l", shaped.series[si]),
          "data-s": si % 8,
          "data-dash": spec.dash.has(shaped.series[si]!),
          x: r(x + 8),
          y: r(ys[i]!),
          "dominant-baseline": "middle",
        },
        name ? `${esc(name)}<tspan data-v="" dx="4">${esc(v)}</tspan>` : esc(v),
      );
    });
  }

  return {
    marks: areas + ghosts + lines + dots,
    labels: end,
    hits: plotHit(plot),
    cross: el("line", { x1: 0, x2: 0, y1: r(plot.y), y2: r(plot.y + plot.h) }),
  };
}

/** Line and area share one file: crosshair contract, stack for area. */
export const line: Mark = { noun: "Line", axes, ends, draw: (ctx) => draw(ctx, false) };
export const area: Mark = { noun: "Area", axes, ends, draw: (ctx) => draw(ctx, true) };
