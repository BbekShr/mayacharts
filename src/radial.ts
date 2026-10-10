// mayacharts/radial: polar bars and the gauge. Imports only registry, svg, scale, ticks and types.
//
// gauge contract: one value, every row of spec.y combined by spec.aggregate (no x, no series, one
// y). Dial range: spec.yDomain, else 0 to a nice max over the value, colorBy target and warn and
// spec.was. Thresholds come resolved in spec.colorBy (target, warn, better; null when unset) and
// ctx.tone(v) gives "good" | "warn" | "bad" | null for data-tone. spec.was is the previous value.
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

// Gauge: a 180 degree dial. The track is a rounded sector, the value a stroked circle (see below);
// bands, target tick and was marker are unkeyed (outside marks).
const num = (v: unknown) => (typeof v === "number" ? v : null);
const PI = Math.PI;

export const gauge: Mark = {
  noun: "Gauge",
  draw(ctx) {
    const { spec, plot } = ctx;
    const col = (f: string) => ctx.agg(spec.aggregate)(spec.data.map((row) => num(row[f])));
    const value = col(spec.y);
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
    const vs = [0, value, target ?? 0, warn ?? 0, wasV ?? 0];
    const nd = niceTicks(Math.min(...vs), Math.max(...vs), 5).domain;
    const [lo, hi] = spec.yDomain ?? nd;
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
    const below = 18 + (wasV !== null || status ? 16 : 0); // the row under the dial: change, and the status when it cannot sit above the value
    const top = target === null ? 6 : 18;
    const side = 6 + ex + (target === null ? 0 : Math.min(plot.w * 0.2, tl.length * 6.2));
    const R = Math.max(14, Math.min(plot.w / 2 - side, plot.h - below - top - ex));
    const t = Math.min(26, Math.max(6, R * 0.2));
    const [cx, cy] = [
      plot.x + plot.w / 2,
      plot.y + Math.max(0, (plot.h - R - ex - top - below) / 2) + top + ex + R,
    ];
    const ri = R - t;
    const pt = (rr: number, a: number) => `${r(cx + rr * Math.sin(a))} ${r(cy - rr * Math.cos(a))}`;
    const at = (f: number) => (f - 0.5) * PI;
    // Annular sector over fractions f0..f1 of the dial; h > 0 rounds both ends (they stay inside f0..f1).
    const ring = (r0: number, r1: number, f0: number, f1: number, h: number) => {
      const d = h / ((r0 + r1) / 2);
      const a0 = at(f0) + d;
      const a1 = Math.max(at(f1) - d, a0);
      return (
        `M${pt(r1, a0)}A${r(r1)} ${r(r1)} 0 0 1 ${pt(r1, a1)}A${r(h)} ${r(h)} 0 0 1 ${pt(r0, a1)}` +
        `A${r(r0)} ${r(r0)} 0 0 0 ${pt(r0, a0)}A${r(h)} ${r(h)} 0 0 1 ${pt(r1, a0)}Z`
      );
    };

    let grid = el("path", { "data-kpi": "track", d: ring(ri, R, 0, 1, t / 2) });
    if (bands) {
      const [a, b] = [Math.min(lo, hi), Math.max(lo, hi)];
      const lower = g!.better === "lower";
      const cuts = lower ? [a, target, warn, b] : [a, warn, target, b];
      cuts.slice(0, 3).forEach((_, i) => {
        const [f0, f1] = [fr(cuts[i]!), fr(cuts[i + 1]!)].sort();
        if (f1! > f0!)
          grid += el("path", {
            fill: "var(--maya-fg)",
            "fill-opacity": [0.2, 0.12, 0.06][lower ? 2 - i : i],
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
    };
    // The value is a stroked circle like a sunburst slice (pathLength 360, dash = angle) so a change
    // sweeps along the track; the round caps sit inside the same inset as the track's rounded ends.
    const [rm, cap] = [(ri + R) / 2, (t / 2 / ((ri + R) / 2)) * (180 / PI)];
    const sweep = Math.max(0, fr(value) * 180 - 2 * cap);
    const marks = el("circle", {
      "data-maya": "mark",
      "data-key": "v",
      ...d,
      cx: r(cx),
      cy: r(cy),
      r: r(rm),
      "data-depth": 1, // borrows the sunburst ring paint: no fill, stroke var(--c)
      "stroke-width": r(t),
      "stroke-linecap": "round",
      pathLength: 360,
      "stroke-dasharray": `${r(sweep)} ${r(360 - sweep)}`,
      "stroke-dashoffset": r(180 - cap),
    });
    const hits = el("path", {
      "data-maya": "hit",
      "data-key": "v",
      ...d,
      fill: "transparent",
      d: ring(ri, R, 0, 1, t / 2),
    });
    // Value centred in the dial; it counts up as a keyed text mark.
    const fs = Math.max(12, Math.min(ri * 0.55, 44, (ri * 1.5) / (f.length * 0.62)));
    const out = el(
      "text",
      {
        "data-maya": "mark",
        "data-key": "t",
        ...d,
        "data-tone": null,
        "data-total": "",
        x: r(cx),
        y: r(cy - 4),
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
          y: r(cy - 4 - fs - 6),
          "text-anchor": "middle",
          "font-size": 12,
          "font-weight": 600,
        },
        esc(status),
      );
    const end = (x: number, a: string, s: string) =>
      el(
        "text",
        { "data-kpi": "of", x: r(x), y: r(cy + 14), "text-anchor": a, "font-size": 11 },
        esc(s),
      );
    labels += end(cx - R, "start", ctx.fmt(spec.y, lo)) + end(cx + R, "end", ctx.fmt(spec.y, hi));
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
    if (target !== null) {
      labels += tick(target, ri - 2, R + 3 + ex, { "data-kpi": "target", "stroke-width": 2 });
      const [an, rr] = [at(fr(target)), R + ex + 9];
      const sx = Math.sin(an);
      labels += el(
        "text",
        {
          "data-kpi": "of",
          x: r(cx + rr * sx),
          y: r(cy - rr * Math.cos(an) + (sx > 0.9 || sx < -0.9 ? 4 : 0)),
          "text-anchor": Math.abs(sx) < 0.25 ? "middle" : sx > 0 ? "start" : "end",
          "font-size": 11,
        },
        esc(tl),
      );
    }
    if (bands) labels += tick(warn, R + 2, R + 7, { stroke: "var(--maya-fg-muted)" });
    const dv = wasV === null ? 0 : value - wasV;
    const nf = (o: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat(spec.locale, {
        maximumFractionDigits: 1,
        signDisplay: "exceptZero",
        ...o,
      });
    const minus = (s: string) => s.replace("-", "\u2212");
    const chg =
      wasV === null
        ? ""
        : ctx.t(
            "change",
            dv > 0 ? "\u25B2" : dv < 0 ? "\u25BC" : "\u25AC",
            minus(
              fv(1).includes("%")
                ? ctx.t("pts", (dv > 0 ? "+" : "") + fv(dv).replace("%", "").trim())
                : (dv > 0 ? "+" : "") + fv(dv),
            ),
            minus(
              nf({ style: "percent", notation: "compact" }).format(wasV ? dv / Math.abs(wasV) : 0),
            ),
            spec.titles.get(spec.was!) ?? spec.was!,
          );
    if ((status && !above) || chg) {
      const lead = status && !above ? status + (chg ? ", " : "") : "";
      const part = (t: string, tn: string | null) => el("tspan", { "data-tone": tn }, esc(t));
      labels += el(
        "text",
        { x: r(cx), y: r(cy + 32), "text-anchor": "middle", "font-size": 11 },
        (lead ? part(lead, tone) : "") +
          (chg ? part(chg, dv ? (dv > 0 === (g?.better !== "lower") ? "good" : "bad") : null) : ""),
      );
    }
    return { marks: marks + out, hits, labels, grid };
  },
};

register("gauge", gauge);
