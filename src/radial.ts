// mayacharts/radial: polar bars. Imports only registry, svg, scale, ticks and types.
import { register } from "./core/registry.ts";
import { TAU } from "./core/scale.ts";
import { clip, el, esc, key, OTHER, r } from "./core/svg.ts";
import { niceTicks } from "./core/ticks.ts";
import type { Mark } from "./core/types.ts";

const W = 7.2; // estimated glyph width at 12px, the same estimate core layout uses

export const radial: Mark = {
  noun: "Radial bar",
  draw(ctx) {
    const { spec, shaped, plot } = ctx;
    const n = shaped.categories.length;
    if (!n || !shaped.cells.length) return { marks: "", hits: "" };

    // Stack outward per category; negatives and nulls draw nothing.
    const segs = shaped.cells.map((c) => ({ c, v: Math.max(0, c.value ?? 0), y0: 0, y1: 0 }));
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
        "data-f": ctx.fmt(spec.y, s.c.value),
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
        tipText += spoke(nm, R0 + 7, a, { "data-in": true, "data-dark": true, "data-name": "" });
      }
      if (out) tipText += spoke(f, rt + 6, a, { "data-tip": "" });
      else if (len >= w + (both ? nm.length * 6.6 + 8 : 0))
        tipText += spoke(
          f,
          rt - 6,
          a,
          { "data-in": true, "data-dark": true, "data-name": "" },
          true,
        );
    });

    // Disc and rings; the outermost ring always shows, every other one below it (at most 3).
    let grid = el("circle", { cx: r(cx), cy: r(cy), r: r(R), "data-disc": true });
    let labels = "";
    const vals = ticks.values.filter((v) => v > 0);
    const k = vals.length;
    const rings = vals.filter((_, i) => (k > 3 ? (k - 1 - i) % 2 === 0 : true));
    for (const v of rings) {
      grid += el("circle", { cx: r(cx), cy: r(cy), r: r(rad(v)), fill: "none" });
      labels += el(
        "text",
        {
          x: r(cx),
          y: r(cy - rad(v)),
          "text-anchor": "middle",
          "dominant-baseline": "middle",
          "data-ring": "",
        },
        esc(ctx.fmt(spec.y, v)),
      );
    }

    // Centre: the grand total under the measure's name.
    const tt = spec.titles.get(spec.y) ?? spec.y;
    const f = fv(total);
    const inner = R0 * 1.5;
    const fs = Math.max(12, Math.min(R0 * 0.4, 26, inner / (f.length * 0.62)));
    const sub = R0 > 30 && fs * 1.7 + 14 < R0 * 2;
    // A keyed text mark, so the element counts the total up on first draw and on change.
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
      const [x, y] = [cx + (R + 6) * Math.sin(a), cy - (R + 6) * Math.cos(a)];
      const sx = Math.sin(a);
      const anchor = Math.abs(sx) < 0.2 ? "middle" : sx > 0 ? "start" : "end";
      const w = name.length * W;
      const l = anchor === "middle" ? x - w / 2 : anchor === "start" ? x : x - w;
      if (boxes.some((b) => l < b[2]! && l + w > b[0]! && y - 7 < b[3]! && y + 7 > b[1]!)) return;
      boxes.push([l, y - 7, l + w, y + 7]);
      labels += el(
        "text",
        {
          x: r(x),
          y: r(y),
          "text-anchor": anchor,
          "dominant-baseline": "middle",
          "data-cat": "",
        },
        esc(name),
      );
    });
    return { marks, hits, labels, grid };
  },
};

register("radial", radial);
