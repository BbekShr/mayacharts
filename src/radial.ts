// mayacharts/radial: polar bars and the gauge. Imports only registry, svg, scale, ticks and types.
//
// gauge contract: one value, every row of spec.y combined by spec.aggregate (no x, no series, one
// y). Dial range: spec.yDomain, else 0 to a nice max over the value, colorBy target and warn and
// spec.was. Thresholds come resolved in spec.colorBy (target, warn, better; null when unset) and
// ctx.tone(v) gives "good" | "warn" | "bad" | null for data-tone. spec.was is the previous value.
import { register } from "./core/registry.ts";
import { TAU } from "./core/scale.ts";
import { clip, el, esc, key, OTHER, px, r } from "./core/svg.ts";
import { niceTicks } from "./core/ticks.ts";
import type { Mark, MarkCtx, MarkOut } from "./core/types.ts";

const INK = { "data-in": true, "data-dark": true, "data-name": "" };
const W = 7.2; // estimated glyph width at 12px, the same estimate core layout uses

/** The disc and its rings (the outermost always, then every other one, at most 3) with their values; `put` places a label at ring radius rr. */
const rings = (
  ctx: MarkCtx,
  [cx, cy, R]: number[],
  vals: number[],
  rad: (v: number) => number,
  put: (rr: number) => Parameters<typeof el>[1],
) => {
  let grid = el("circle", { cx: r(cx!), cy: r(cy!), r: r(R!), "data-disc": true });
  let labels = "";
  vals.forEach((v, i) => {
    if (vals.length > 3 && (vals.length - 1 - i) % 2) return;
    grid += el("circle", { cx: r(cx!), cy: r(cy!), r: r(rad(v)), fill: "none" });
    labels += el(
      "text",
      { ...put(rad(v)), "dominant-baseline": "middle", "data-ring": "" },
      esc(ctx.fmt(ctx.spec.y, v)),
    );
  });
  return { grid, labels };
};

/** A level category name at (x, y) on a spoke of sine s, anchored by angle; "" when it would overlap a placed one (boxes grows). */
const catLabel = (boxes: number[][], x: number, y: number, s: number, name: string) => {
  const anchor = Math.abs(s) < 0.2 ? "middle" : s > 0 ? "start" : "end";
  const w = name.length * W;
  const l = anchor === "middle" ? x - w / 2 : anchor === "start" ? x : x - w;
  if (boxes.some((b) => l < b[2]! && l + w > b[0]! && y - 7 < b[3]! && y + 7 > b[1]!)) return "";
  boxes.push([l, y - 7, l + w, y + 7]);
  return el(
    "text",
    { x: r(x), y: r(y), "text-anchor": anchor, "dominant-baseline": "middle", "data-cat": "" },
    esc(name),
  );
};

/**
 * spec.form "line" (a radar): angle = x from 12 o'clock, radius = y from the centre, one line per
 * series (key `l~SERIES`, the line mark's attributes: dash, emphasis, legend isolate), closed when the
 * series has a value in every category and open where one is missing. A dot per value holds the
 * tooltip; a wedge hit per category (keyed to its first dot) lists every series of that category.
 * ponytail: no area fill (overlapping series would hide each other); categories are thinned by label collision.
 */
const radar = (ctx: MarkCtx): MarkOut => {
  const { spec, shaped: sh, plot } = ctx;
  const n = sh.categories.length;
  if (!n || !sh.cells.length) return { marks: "", hits: "" };
  const max = Math.max(0, ...sh.cells.map((c) => c.value ?? 0));
  const ticks = niceTicks(0, max, 5);
  const top = ticks.domain[1] || 1;
  const names = sh.categories.map((c) =>
    clip(ctx.fmt(spec.x, c), Math.max(4, Math.floor((plot.w * 0.2) / W))),
  );
  const lw = Math.max(...names.map((s) => s.length)) * W + 8;
  const [cx, cy] = [plot.x + plot.w / 2, plot.y + plot.h / 2];
  const R = Math.max(10, Math.min(plot.w / 2 - lw, plot.h / 2 - 18));
  const ang = (k: number) => (k / n) * TAU;
  const at = (rr: number, a: number): [number, number] => [
    cx + rr * Math.sin(a),
    cy - rr * Math.cos(a),
  ];
  let marks = "";
  let dots = "";
  let hits = "";
  let grid = "";
  const first = new Map<number, string>();
  for (const si of sh.visible) {
    const ser = sh.series[si]!;
    const row = sh.categories.map(() => null as number | null);
    for (const c of sh.cells) if (c.si === si && c.value !== null) row[c.ci] = Math.max(0, c.value);
    const closed = n > 2 && row.every((v) => v !== null);
    let d = "";
    let len = 0;
    let prev: [number, number] | null = null;
    row.forEach((v, k) => {
      if (v === null) return void (prev = null);
      const p = at((v / top) * R, ang(k));
      d += `${prev ? "L" : "M"}${r(p[0])} ${r(p[1])}`;
      if (prev) len += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
      prev = p;
      const cname = sh.categories[k]!;
      const key_ = key(ser, cname);
      first.has(k) || first.set(k, key_);
      const cell = sh.cells.find((c) => c.si === si && c.ci === k)!;
      dots += el("circle", {
        "data-maya": "mark",
        "data-key": key_,
        "data-c": k,
        "data-s": si % 8,
        "data-x": ctx.fmt(spec.x, cname),
        "data-series": ser,
        "data-y": cell.value,
        "data-f": ctx.fmt(spec.y, cell.value),
        "data-tone": ctx.tone(v),
        "data-dash": spec.dash.has(ser),
        "data-em": spec.emphasis.has(ser),
        "data-last": n === 1,
        r: 3,
        cx: r(p[0]),
        cy: r(p[1]),
      });
    });
    if (closed) {
      const f = at((row[0]! / top) * R, 0);
      len += Math.hypot(f[0] - prev![0], f[1] - prev![1]);
      d += "Z";
    }
    const dash = spec.dash.has(ser);
    marks += el("path", {
      "data-maya": "line",
      "data-key": key("l", ser),
      "data-s": si % 8,
      "data-radar": true, // the legend key is a line, as for a line chart (theme.ts)
      "data-dash": dash,
      "data-em": spec.emphasis.has(ser),
      pathLength: 1,
      "stroke-dasharray":
        dash && len ? `${+(6 / len).toPrecision(3)} ${+(4 / len).toPrecision(3)}` : null,
      d: d || null,
    });
  }
  // Spokes and the wedge a category answers for.
  const h = Math.min(Math.PI / n, 3);
  for (let k = 0; k < n; k++) {
    const [x, y] = at(R, ang(k));
    grid += el("line", { x1: r(cx), y1: r(cy), x2: r(x), y2: r(y) });
    const [a, b] = [at(R, ang(k) - h), at(R, ang(k) + h)];
    if (first.has(k))
      hits += el("path", {
        "data-maya": "hit",
        "data-key": first.get(k),
        "data-c": k,
        d: `M${r(cx)} ${r(cy)}L${r(a[0])} ${r(a[1])}A${r(R)} ${r(R)} 0 ${h * 2 > Math.PI ? 1 : 0} 1 ${r(b[0])} ${r(b[1])}Z`,
        fill: "transparent",
      });
  }
  const ring = rings(
    ctx,
    [cx, cy, R],
    ticks.values.filter((v) => v > 0),
    (v) => R * (v / top),
    // Between the first two spokes, so neither a spoke's line nor a category name sits under a value.
    (rr) => ({
      x: r(at(rr, ang(0.5))[0]),
      y: r(at(rr, ang(0.5))[1]),
      "text-anchor": "middle",
    }),
  );
  grid = ring.grid + grid;
  let labels = ring.labels;
  const boxes: number[][] = [];
  names.forEach((name, k) => {
    const a = ang(k);
    const [x, y] = at(R + 8 + 4 * Math.abs(Math.cos(a)), a);
    labels += catLabel(boxes, x, y, Math.sin(a), name);
  });
  return { marks: marks + dots, hits, labels, grid };
};

export const radial: Mark = {
  noun: "Radial bar",
  draw(ctx) {
    if (ctx.spec.radar) return radar(ctx);
    const { spec, shaped, plot } = ctx;
    const n = shaped.categories.length;
    if (!n || !shaped.cells.length) return { marks: "", hits: "" };

    // Stack outward per category; a null value has no segment (so no zero-width mark, no tooltip row), a negative draws nothing.
    const segs = shaped.cells
      .filter((c) => c.value !== null)
      .map((c) => ({ c, v: Math.max(0, c.value!), y0: 0, y1: 0 }));
    const totals = new Array<number>(n).fill(0);
    const last = new Array<number>(n).fill(-1);
    const topV = new Array<number>(n).fill(0);
    segs.forEach((s, i) => {
      s.y0 = totals[s.c.ci]!;
      s.y1 = totals[s.c.ci] = s.y0 + s.v;
      last[s.c.ci] = i;
      topV[s.c.ci] = s.v;
    });
    const max = Math.max(0, ...totals);
    const total = totals.reduce((a, b) => a + b, 0);
    const ticks = niceTicks(0, max, 5);
    const top = ticks.domain[1] || 1;

    // Many categories: labels run along the radius (short, so they never collide);
    // otherwise they sit level, truncated to a fifth of the width.
    const along = n > 16;
    let names = shaped.categories.map((c) => ctx.fmt(spec.x, c));
    // One shared trailing year (dates): the ring names drop it and the centre states it once.
    // ponytail: the centre label hides below ~170 px, taking the year with it; a year-first locale keeps full names.
    const y = /\s\d{4}$/.exec(names[0]!)?.[0] ?? "";
    const yr = names.every((s) => s.endsWith(y)) ? y : "";
    names = names.map((s) => s.replace(yr, ""));
    const room = along ? 7 : Math.max(4, Math.floor((plot.w * 0.2) / W));
    const shown = names.map((s) => clip(s, room));
    // One series: a name rides on its bar when it fits, so the outer ring of names is only
    // reserved (and drawn, for the bars that miss) when some bar is too short for its name.
    const solo = shaped.series.length === 1 && n <= 40;
    const tips = n <= 40;
    const fv = (v: number) => ctx.fmt(spec.y, v);
    // Names ride on the bars only when every bar holds its name and its value; else all of
    // them join the outer ring (one rule for the chart, never a mix).
    const fit = (t: number, nm: string, Rc: number) =>
      (t / top) * Rc * 0.58 - 12 >= (nm.length + fv(t).length) * 6.6 + 8;
    const allFit = shown.every((nm, i) => fit(totals[i]!, nm, Math.min(plot.w, plot.h) / 2 - 8));
    const lw = solo && allFit ? 8 : Math.max(...shown.map((s) => s.length)) * W + 8;
    const [cx, cy] = [plot.x + plot.w / 2, plot.y + plot.h / 2];
    const R = Math.max(
      10,
      along || (solo && allFit)
        ? Math.min(plot.w, plot.h) / 2 - lw
        : Math.min(plot.w / 2 - lw, plot.h / 2 - 16),
    );
    const R0 = R * 0.4;
    const rad = (v: number) => R0 + (v / top) * (R - R0);
    const pt = (rr: number, a: number) => `${r(cx + rr * Math.sin(a))} ${r(cy - rr * Math.cos(a))}`;
    // A clear wedge at 12 o'clock holds the ring labels, so they never sit on a bar.
    const G = n > 1 ? Math.min(0.6, Math.max(0.3, 46 / R)) : 0;
    const step = (TAU - G) / n;
    const gap = Math.min(step * 0.14, 0.05);
    // Sector with the outer corners rounded by c px (c = 0 degenerates to straight lines,
    // so every path has the same commands and morphs between data states).
    const sector = (r0: number, r1: number, a0: number, a1: number, c: number) => {
      const e = Math.min(a1, a0 + (TAU * 359.99) / 360);
      const big = e - a0 > Math.PI ? 1 : 0;
      const da = c / Math.max(r1, 1);
      return (
        `M${pt(r0, a0)}L${pt(r1 - c, a0)}A${r(c)} ${r(c)} 0 0 1 ${pt(r1, a0 + da)}` +
        `A${r(r1)} ${r(r1)} 0 ${big} 1 ${pt(r1, e - da)}A${r(c)} ${r(c)} 0 0 1 ${pt(r1 - c, e)}` +
        `L${pt(r0, e)}A${r(r0)} ${r(r0)} 0 ${big} 0 ${pt(r0, a0)}Z`
      );
    };

    // Text along a spoke at radius rr, reading left to right (flipped on the left half).
    const spoke = (
      text: string,
      rr: number,
      a: number,
      attrs: Parameters<typeof el>[1],
      inward = false,
    ) => {
      const [x, y] = [cx + rr * Math.sin(a), cy - rr * Math.cos(a)];
      const flip = Math.sin(a) < 0;
      return el(
        "text",
        {
          x: r(x),
          y: r(y),
          transform: `rotate(${r((a * 180) / Math.PI + (flip ? 90 : -90))} ${r(x)} ${r(y)})`,
          "text-anchor": flip !== inward ? "end" : "start",
          "dominant-baseline": "middle",
          ...attrs,
        },
        esc(text),
      );
    };
    let marks = "";
    let hits = "";
    let tipText = "";
    segs.forEach((s, i) => {
      const cname = shaped.categories[s.c.ci]!;
      const ser = shaped.series[s.c.si]!;
      const [a0, a1] = [G / 2 + s.c.ci * step + gap, G / 2 + (s.c.ci + 1) * step - gap];
      const [r0, r1] = [rad(s.y0), rad(s.y1)];
      const cr =
        last[s.c.ci] === i
          ? Math.max(0, Math.min(5, (r1 - r0) / 2 - 0.5, ((a1 - a0) * r1) / 2 - 0.5))
          : 0;
      const d = {
        "data-key": key(ser, cname),
        "data-c": s.c.ci,
        "data-s": s.c.si % 8,
        "data-x": ctx.fmt(spec.x, cname),
        "data-series": ser,
        "data-y": s.c.value,
        "data-f": fv(s.c.value!),
        "data-tone": ctx.tone(s.v),
        "data-other": cname === OTHER,
      };
      marks += el("path", {
        "data-maya": "mark",
        "data-polar": true,
        ...d,
        d: sector(r0, r1, a0, a1, cr),
      });
      // Hit: grown to >= 24 px thick and wide around the segment's middle (hit() is rect-only).
      const mid = (r0 + r1) / 2;
      const [h0, h1] = [
        Math.max(0, mid - Math.max(12, (r1 - r0) / 2)),
        mid + Math.max(12, (r1 - r0) / 2),
      ];
      const half = Math.max((a1 - a0) / 2, 12 / mid || 0);
      const am = (a0 + a1) / 2;
      if (r1 - r0 < 24 || (a1 - a0) * mid < 24)
        hits += el("path", {
          "data-maya": "hit",
          ...d,
          d: sector(h0, h1, am - half, am + half, 0),
          fill: "transparent",
        });
    });

    // Stack total at each tip, beyond it when there is room, else inside it (names as above).
    const named = new Set<number>();
    const outs: [string, number, number, boolean][] = [];
    totals.forEach((t, ci) => {
      const a = G / 2 + (ci + 0.5) * step;
      const [rt, f] = [rad(t), fv(t)];
      if (!tips || !t || (step - 2 * gap) * Math.max(rt, 1) < 11) return;
      const [nm, w] = [shown[ci]!, f.length * 6.2];
      // Inside the tip only the top segment's own length counts.
      const [out, len] = [rt + 6 + w <= R - 2, rt - rad(t - topV[ci]!) - 8];
      const on = solo && allFit;
      const both = on && (out || len >= w + nm.length * 6.6 + 8);
      if (on) {
        named.add(ci);
        tipText += spoke(nm, R0 + 7, a, INK);
      }
      const inside = () => spoke(f, rt - 6, a, INK, true);
      if (out) outs.push([f, rt + 6, a, len >= w]);
      else if (len >= w + (both ? nm.length * 6.6 + 8 : 0)) tipText += inside();
    });

    // Disc and rings; the outermost ring always shows, every other one below it (at most 3).
    const ring = rings(
      ctx,
      [cx, cy, R],
      ticks.values.filter((v) => v > 0),
      rad,
      (rr) => ({
        x: r(cx),
        y: r(cy - rr),
        "text-anchor": "middle",
      }),
    );
    const grid = ring.grid;
    let labels = ring.labels;

    // Centre: the grand total under the measure's name.
    const tt = spec.titles.get(spec.y) ?? spec.y;
    const f = fv(total);
    const inner = R0 * 1.5;
    const fs = Math.max(12, Math.min(R0 * 0.4, 26, inner / (f.length * 0.62)));
    // Only a sum or count adds up across categories; a stack of means has no honest total.
    const tot = spec.aggregate[0] !== "m"; // sum and count; mean, min, max all start with m
    const sub = tot && R0 > 30 && fs * 1.7 + 14 < R0 * 2;
    // A keyed text mark, so the element counts the total up on first draw and on change.
    if (tot)
      marks += el(
        "text",
        {
          "data-maya": "mark",
          "data-key": key("t"),
          "data-x": tt,
          "data-y": total,
          "data-f": f,
          "data-series": "",
          x: r(cx),
          y: r(cy + (sub ? 6 : 0)),
          "text-anchor": "middle",
          "dominant-baseline": "middle",
          "font-size": r(fs),
          "font-weight": 650,
          "data-total": "",
        },
        esc(f),
      );
    const cap = Math.floor((R0 * 1.8) / 6.2);
    if (sub)
      labels += el(
        "text",
        {
          x: r(cx),
          y: r(cy - fs / 2 - 4),
          "text-anchor": "middle",
          "dominant-baseline": "middle",
          "font-size": 11,
          "data-ring": "",
        },
        esc(clip((tt + yr).length > cap ? tt : tt + yr, cap)), // the year goes before an ellipsis does
      );

    labels += tipText;
    // Category labels (stacked only). Level: anchored by angle, a label overlapping a placed
    // one is skipped. Along the radius: every nth, so neighbours stay 14 px apart.
    const boxes: number[][] = [];
    const every = along ? Math.ceil(14 / (step * (R + 6))) : 1;
    shown.forEach((name, i) => {
      if (i % every || named.has(i)) return;
      const a = G / 2 + (i + 0.5) * step;
      if (along) return void (labels += spoke(name, R + 6, a, { "data-cat": "" }));
      labels += catLabel(
        boxes,
        cx + (R + 6) * Math.sin(a),
        cy - (R + 6) * Math.cos(a),
        Math.sin(a),
        name,
      );
    });
    // A value beyond its bar tip yields to a category label it would overprint (the spoke's box, 6 px each side).
    // Place outside, else relocate inside the top segment when it has room, else drop.
    for (const [f, rr, a, room] of outs) {
      const [x0, y0] = [cx + rr * Math.sin(a), cy - rr * Math.cos(a)];
      const [x1, y1] = [x0 + f.length * 6.2 * Math.sin(a), y0 - f.length * 6.2 * Math.cos(a)];
      if (
        !boxes.some(
          (b) =>
            Math.min(x0, x1) - 6 < b[2]! &&
            Math.max(x0, x1) + 6 > b[0]! &&
            Math.min(y0, y1) - 6 < b[3]! &&
            Math.max(y0, y1) + 6 > b[1]!,
        )
      )
        labels += spoke(f, rr, a, { "data-tip": "" });
      else if (room) labels += spoke(f, rr - 12, a, INK, true);
    }
    return { marks, hits, labels, grid };
  },
};

register("radial", radial);

// Gauge: a 180, 270 or 360 degree dial (spec.arc). The track is a rounded sector, the value a stroked circle (see below);
// bands, target tick and was marker are unkeyed (outside marks).
const num = (v: unknown) => (typeof v === "number" ? v : null);
const PI = Math.PI;

export const gauge: Mark = {
  noun: "Gauge",
  draw(ctx) {
    const { spec, plot } = ctx;
    const col = (f: string) => ctx.agg(spec.aggregate)(spec.data.map((row) => num(row[f])));
    // aggregate { ratio }: sum(numerator) / sum(denominator), null when the denominator is 0.
    const [nu, de] = spec.ratio ? [col(spec.ratio[0]), col(spec.ratio[1])] : [];
    const value = spec.ratio ? (nu != null && de ? nu / de : null) : col(spec.y);
    if (value === null)
      return {
        marks: "",
        hits: "",
        labels: el(
          "text",
          {
            "data-maya": "empty",
            x: r(ctx.width / 2),
            y: r(ctx.height / 2),
            "text-anchor": "middle",
            "dominant-baseline": "middle",
          },
          esc(ctx.t("noData")),
        ),
      };
    const g = typeof spec.colorBy === "object" && spec.colorBy ? spec.colorBy : null;
    const [target, warn] = [g?.target ?? null, g?.warn ?? null];
    const wasV = spec.was ? col(spec.was) : null;
    const fv = (v: number) => ctx.fmt(spec.y, v);
    // Dial range: yDomain, else nice bounds over zero and everything the dial must hold (negatives show).
    const vs = [value, target ?? 0, warn ?? 0, wasV ?? 0];
    const [lo, hi] = spec.yDomain ?? niceTicks(Math.min(0, ...vs), Math.max(0, ...vs), 5).domain;
    const span = hi - lo || 1;
    const fr = (v: number) => Math.min(1, Math.max(0, (v - lo) / span));
    const bands = target !== null && warn !== null;
    const tl = target === null ? "" : clip(`${ctx.t("target")} ${fv(target)}`, 24);

    // Fit: R is the track's outer radius; the block (arc, band ring, rows below) centres in the box.
    const ex = bands ? 6 : 0;
    const tone = ctx.tone(value);
    const status =
      tone && target !== null
        ? ctx.t(tone === "good" ? "onTrack" : tone === "warn" ? "atRisk" : "offTrack")
        : "";
    // Sweep in degrees from its start (12 o'clock clockwise): 180 from 9 o'clock, 270 from 225 degrees, 360 closed from 12.
    const SW = spec.arc;
    const A0 = SW === 180 ? -90 : SW === 270 ? -135 : 0;
    const open = SW < 360;
    const wide = SW > 180; // the number and rows sit inside the ring, not under the dial
    // The row under a half dial: change, and the status when it cannot sit above the value (a ring holds them inside).
    const below = wide ? (open ? 16 : 0) : 18 + (wasV !== null || status ? 16 : 0);
    const dn = SW === 180 ? 0 : SW === 270 ? Math.SQRT1_2 : 1; // how far the dial hangs below its centre, in radii
    const top = target === null ? 6 : 18;
    // The target text stands 9 px beyond the band ring (the tag offset): 12 + ex of reach and then its width,
    // reserved only on the side its tick points to (a label near the poles centres over the dial).
    // The warn text of a band ring does the same, on its own side.
    const sin = (v: number | null) => (v === null ? 0 : Math.sin(((A0 + fr(v) * SW) * PI) / 180));
    const [sn, wn] = [sin(target), bands ? sin(warn) : 0];
    const [lab, wl] = [
      12 + ex + Math.min(plot.w * 0.2, tl.length * 6.2),
      12 + ex + (warn === null ? 0 : fv(warn).length * 6.2),
    ];
    const [sl, sr] = [-1, 1].map(
      (d) => 6 + ex + Math.max(sn * d > 0.25 ? lab : 0, wn * d > 0.25 ? wl : 0),
    ) as [number, number];
    const R = Math.max(
      14,
      Math.min((plot.w - sl - sr) / 2, (plot.h - below - top - ex) / (1 + dn)),
    );
    const t = Math.min(26, Math.max(6, R * 0.2));
    const [cx, cy] = [
      plot.x + sl + (plot.w - sl - sr) / 2,
      plot.y + Math.max(0, (plot.h - R * (1 + dn) - ex - top - below) / 2) + top + ex + R,
    ];
    const ri = R - t;
    const pt = (rr: number, a: number) => `${r(cx + rr * Math.sin(a))} ${r(cy - rr * Math.cos(a))}`;
    const at = (f: number) => ((A0 + f * SW) * PI) / 180;
    // Annular sector over fractions f0..f1 of the dial; h > 0 rounds both ends (they stay inside f0..f1).
    const ring = (r0: number, r1: number, f0: number, f1: number, h: number) => {
      const d = h / ((r0 + r1) / 2);
      const a0 = at(f0) + d;
      const a1 = Math.min(Math.max(at(f1) - d, a0), a0 + TAU - 0.001);
      const lg = a1 - a0 > PI ? 1 : 0;
      return (
        `M${pt(r1, a0)}A${r(r1)} ${r(r1)} 0 ${lg} 1 ${pt(r1, a1)}A${r(h)} ${r(h)} 0 0 1 ${pt(r0, a1)}` +
        `A${r(r0)} ${r(r0)} 0 ${lg} 0 ${pt(r0, a0)}A${r(h)} ${r(h)} 0 0 1 ${pt(r1, a0)}Z`
      );
    };
    // The whole dial: a rounded sector, or for a ring two circles (the inner one reversed leaves the hole).
    const full = () =>
      open
        ? ring(ri, R, 0, 1, t / 2)
        : [R, ri]
            .map(
              (q, i) =>
                `M${r(cx - q)} ${r(cy)}a${r(q)} ${r(q)} 0 1 ${1 - i} ${r(2 * q)} 0a${r(q)} ${r(q)} 0 1 ${1 - i} ${r(-2 * q)} 0Z`,
            )
            .join("");

    let grid = el("path", { "data-kpi": "track", d: full() });
    if (bands) {
      const [a, b] = [Math.min(lo, hi), Math.max(lo, hi)];
      const lower = g!.better === "lower";
      const cuts = lower ? [a, target, warn, b] : [a, warn, target, b];
      cuts.slice(0, 3).forEach((_, i) => {
        const [f0, f1] = [fr(cuts[i]!), fr(cuts[i + 1]!)].sort((p, q) => p - q);
        if (f1! > f0!)
          grid += el("path", {
            fill: "var(--maya-fg)",
            "fill-opacity": [0.4, 0.22, 0.1][lower ? 2 - i : i],
            d: ring(R + 3, R + 6, f0!, f1!, 0),
          });
      });
    }

    const f = fv(value);
    const d = {
      "data-s": 0,
      "data-x": "", // the tooltip row names the measure; a header would repeat it
      "data-y": value,
      "data-f": f,
      "data-tone": tone,
      "data-more":
        spec.tipFields
          .flatMap((k) => {
            const rt = spec.tipRatio.get(k);
            const sum = (q: string) => ctx.agg("sum")(spec.data.map((row) => num(row[q])));
            const v = rt ? (sum(rt[1]) ? sum(rt[0])! / sum(rt[1])! : null) : col(k);
            // Tabs and newlines are the grammar: a cell holding them must not add rows.
            const cl = (x: string) => x.replace(/[\t\n]/g, " ");
            return v == null ? [] : [`${cl(spec.titles.get(k) ?? k)}\t${cl(ctx.fmt(k, v))}`];
          })
          .join("\n") || null,
    };
    // The value is a stroked circle like a sunburst slice (pathLength 360, dash = angle) so a change
    // sweeps along the track; the round caps sit inside the same inset as the track's rounded ends.
    const cap = (t / (ri + R)) * (180 / PI);
    // The fill grows from zero (the dial minimum when zero is off the dial), either way round.
    const z = fr(0) * SW;
    const d0 = fr(value) * SW - z;
    const sweep = Math.max(0, Math.abs(d0) - 2 * cap);
    const marks = el("circle", {
      "data-maya": "mark",
      "data-key": "v",
      ...d,
      cx: r(cx),
      cy: r(cy),
      r: r((ri + R) / 2),
      "data-depth": 1, // borrows the sunburst ring paint: no fill, stroke var(--c)
      "stroke-width": r(t),
      "stroke-linecap": d0 ? "round" : "butt", // a zero value draws nothing, not a dot
      pathLength: 360,
      "stroke-dasharray": `${r(sweep)} ${r(360 - sweep)}`,
      // The dash starts at 3 o'clock; the offset turns it back to the dial's start (12 o'clock is 270).
      "stroke-dashoffset": r(((-(A0 + 270 + z + Math.min(d0, 0) + cap) % 360) + 360) % 360),
    });
    const hits = el("path", {
      "data-maya": "hit",
      "data-key": "v",
      ...d,
      fill: "transparent",
      d: full(),
    });
    // Value centred in the dial; it counts up as a keyed text mark.
    const fs = Math.max(
      12,
      Math.min(
        ri * 0.55,
        44,
        (ri * 1.5) / (f.length * 0.62),
        px(spec.theme.heroSize), // heroSize caps the fit
      ),
    );
    // On a ring the number sits on the centre (or just above it when a row of text follows).
    const row = wasV !== null || (status && !(ri * ri - (fs + 22) ** 2 >= 1300));
    const vy = wide ? (row ? cy - 2 : cy + fs * 0.35) : cy - 4;
    const out = el(
      "text",
      {
        "data-maya": "mark",
        "data-key": "t",
        ...d,
        "data-tone": null,
        "data-total": "",
        "data-hero": true,
        x: r(cx),
        y: r(vy),
        "text-anchor": "middle",
        "font-size": r(fs),
        "font-weight": 650,
      },
      esc(f),
    );
    // The status word sits above the value when it fits, else it leads the row under the dial (never colour alone).
    const above = ri * ri - (fs + 22) ** 2 >= 1300;
    let labels = "";
    if (status && above)
      labels += el(
        "text",
        {
          "data-tone": tone,
          x: r(cx),
          y: r(vy - fs - 6),
          "text-anchor": "middle",
          "font-size": 12,
          "font-weight": 600,
        },
        esc(status),
      );
    const end = (x: number, y: number, a: string, s: string) =>
      el("text", { "data-kpi": "of", x: r(x), y: r(y), "text-anchor": a, "font-size": 11 }, esc(s));
    // A half dial prints its ends under the track's ends; a 270 one under its ends, further in; a ring has no ends.
    if (SW === 180)
      labels += end(cx - R, cy + 14, "start", fv(lo)) + end(cx + R, cy + 14, "end", fv(hi));
    else if (open) {
      const [ex2, ey] = [((ri + R) / 2) * Math.SQRT1_2, cy + R * Math.SQRT1_2 + 14];
      labels += end(cx - ex2, ey, "middle", fv(lo)) + end(cx + ex2, ey, "middle", fv(hi));
    }
    const tick = (v: number, r0: number, r1: number, a: Parameters<typeof el>[1]) => {
      const an = at(fr(v));
      return el("line", {
        x1: r(cx + r0 * Math.sin(an)),
        y1: r(cy - r0 * Math.cos(an)),
        x2: r(cx + r1 * Math.sin(an)),
        y2: r(cy - r1 * Math.cos(an)),
        ...a,
      });
    };
    // A threshold's text stands beside its tick, outside the band ring and anchored away from the dial's
    // middle. Returned with its box so a warn value that would touch the target label can be dropped.
    // cut: the text is clipped to the room left in the svg (the target label, which is never dropped).
    const tag = (v: number, s: string, rr: number, a: Parameters<typeof el>[1], cut = false) => {
      const an = at(fr(v));
      const sx = Math.sin(an);
      const m = Math.abs(sx) < 0.25 ? 1 : sx > 0 ? 2 : 0; // end, middle, start
      const x = cx + rr * sx;
      const room = m === 2 ? ctx.width - x : m ? 2 * Math.min(x, ctx.width - x) : x;
      if (cut) s = clip(s, Math.max(4, Math.floor(room / 6.2)));
      const w = s.length * 6.2;
      const y = cy - rr * Math.cos(an) + (Math.abs(sx) > 0.9 ? 4 : 0);
      const text = el(
        "text",
        {
          "data-kpi": "of",
          x: r(x),
          y: r(y),
          "text-anchor": ["end", "middle", "start"][m],
          "font-size": 11,
          ...a,
        },
        esc(s),
      );
      return { x0: x - ((2 - m) * w) / 2, w, y, text };
    };
    const tg = target === null ? null : tag(target, tl, R + ex + 9, {}, true);
    if (tg) {
      labels += tick(target!, ri - 2, R + 3 + ex, { "data-kpi": "target", "stroke-width": 2 });
      labels += tg.text;
    }
    if (bands) {
      labels += tick(warn, R + 2, R + 7, { stroke: "var(--maya-fg-muted)" });
      const wt = tag(
        warn,
        ctx.t(g!.better === "lower" ? "offAbove" : "offBelow", fv(warn)),
        R + ex + 7,
        { fill: "var(--maya-fg-muted)" },
      );
      // ponytail: a warn value that touches the target label or leaves the svg is dropped, its tick stays (the description names it).
      const touch =
        tg!.x0 < wt.x0 + wt.w + 4 && wt.x0 < tg!.x0 + tg!.w + 4 && Math.abs(tg!.y - wt.y) < 12;
      if (!touch && wt.x0 >= 0 && wt.x0 + wt.w <= ctx.width) labels += wt.text;
    }
    if (lo * hi < 0) labels += tick(0, ri, R, { stroke: "var(--maya-fg-muted)" }); // where the fill starts
    // The old value: a pale tick across the track (CSS: line[data-past]).
    if (wasV !== null) labels += tick(wasV, ri - 3, R + 3, { "data-past": true });
    const dv = wasV === null ? 0 : value - wasV;
    const pct = new Intl.NumberFormat(spec.locale, {
      maximumFractionDigits: 1,
      signDisplay: "exceptZero",
      style: "percent",
      notation: "compact",
    });
    const minus = (s: string) => s.replace("-", "\u2212");
    const isPts = fv(1).includes("%");
    const arrow = dv > 0 ? "\u25B2" : dv < 0 ? "\u25BC" : "\u2192";
    const name = spec.titles.get(spec.was!) ?? spec.was!;
    const amount = minus(
      isPts
        ? ctx.t("pts", (dv > 0 ? "+" : "") + fv(dv).replace("%", "").trim())
        : (dv > 0 ? "+" : "") + fv(dv),
    );
    // ponytail: a points move already says it all; the relative percent is left out (it clips "vs ..." inside a ring).
    const chg =
      wasV === null
        ? ""
        : isPts
          ? ctx.t("vs", `${arrow} ${amount}`, name)
          : ctx.t("change", arrow, amount, minus(pct.format(wasV ? dv / Math.abs(wasV) : 0)), name);
    if ((status && !above) || chg) {
      const lead = status && !above ? status + (chg ? ", " : "") : "";
      // ponytail: inside a ring the row is cut to the chord at its height (5.8 px a character), not measured.
      const fit = wide ? Math.floor((2 * Math.sqrt(Math.max(0, ri * ri - 400))) / 5.8) : 99;
      const part = (t: string, tn: string | null) =>
        el("tspan", { "data-tone": tn }, esc(clip(t, fit)));
      labels += el(
        "text",
        { x: r(cx), y: r(wide ? vy + 20 : cy + 32), "text-anchor": "middle", "font-size": 11 },
        (lead ? part(lead, tone) : "") +
          (chg ? part(chg, dv ? (dv > 0 === (g?.better !== "lower") ? "good" : "bad") : null) : ""),
      );
    }
    return { marks: marks + out, hits, labels, grid };
  },
};

register("gauge", gauge);
