// mayacharts/radial: polar bars. Imports only registry, svg, scale, ticks and types.
import { register } from "./core/registry.ts";
import { el, esc, key, OTHER, r } from "./core/svg.ts";
import { niceTicks } from "./core/ticks.ts";
import type { Mark } from "./core/types.ts";

const TAU = Math.PI * 2;
const CAP = 11;

export const radial: Mark = {
  noun: "Radial bar",
  draw(ctx) {
    const { spec, shaped, plot } = ctx;
    const n = shaped.categories.length;
    if (!n || !shaped.cells.length) return { marks: "", hits: "" };

    // Stack outward per category; negatives and nulls draw nothing.
    const segs = shaped.cells.map((c) => ({ c, v: Math.max(0, c.value ?? 0), y0: 0, y1: 0 }));
    const totals = new Array<number>(n).fill(0);
    for (const s of segs) {
      s.y0 = totals[s.c.ci]!;
      s.y1 = totals[s.c.ci] = s.y0 + s.v;
    }
    const max = Math.max(0, ...totals);
    const ticks = niceTicks(0, max, 5);
    const top = ticks.domain[1];

    // Room for category labels outside the outer radius (truncated at CAP chars).
    const names = shaped.categories.map((c) => {
      const f = ctx.fmt(spec.x, c);
      return f.length > CAP ? f.slice(0, CAP - 1) + "…" : f;
    });
    const lw = Math.max(...names.map((s) => s.length)) * 7.2 + 6;
    const [cx, cy] = [plot.x + plot.w / 2, plot.y + plot.h / 2];
    const R = Math.max(10, Math.min(plot.w / 2 - lw, plot.h / 2 - 16));
    const R0 = R * 0.25;
    const rad = (v: number) => R0 + (v / top) * (R - R0);
    const pt = (rr: number, a: number) => `${r(cx + rr * Math.sin(a))} ${r(cy - rr * Math.cos(a))}`;
    // A clear wedge at 12 o'clock holds the ring labels, so they never sit on a bar.
    const G = n > 1 ? 0.35 : 0;
    const step = (TAU - G) / n;
    const gap = Math.min(step * 0.1, 0.04);
    const sector = (r0: number, r1: number, a0: number, a1: number) => {
      const e = Math.min(a1, a0 + (TAU * 359.99) / 360);
      const big = e - a0 > Math.PI ? 1 : 0;
      return (
        `M${pt(r1, a0)}A${r(r1)} ${r(r1)} 0 ${big} 1 ${pt(r1, e)}` +
        `L${pt(r0, e)}A${r(r0)} ${r(r0)} 0 ${big} 0 ${pt(r0, a0)}Z`
      );
    };

    let marks = "";
    let hits = "";
    segs.forEach((s, i) => {
      const cname = shaped.categories[s.c.ci]!;
      const ser = shaped.series[s.c.si]!;
      const [a0, a1] = [G / 2 + s.c.ci * step + gap, G / 2 + (s.c.ci + 1) * step - gap];
      const [r0, r1] = [rad(s.y0), rad(s.y1)];
      const d = {
        "data-key": key(ser, cname),
        "data-c": i,
        "data-s": s.c.si % 8,
        "data-x": ctx.fmt(spec.x, cname),
        "data-series": ser,
        "data-y": s.c.value,
        "data-f": ctx.fmt(spec.y, s.c.value),
        "data-tone": ctx.tone(s.v),
        "data-other": cname === OTHER,
      };
      marks += el("path", { "data-maya": "mark", ...d, d: sector(r0, r1, a0, a1) });
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
          d: sector(h0, h1, am - half, am + half),
          fill: "transparent",
        });
    });

    // Rings: faint circles with value labels along the 12 o'clock spoke.
    let grid = "";
    let labels = "";
    // At most 3 rings: thin every other tick when the scale has more.
    const vals = ticks.values.filter((v) => v > 0);
    for (const v of vals.length > 3 ? vals.filter((_, i) => i % 2) : vals) {
      grid += el("circle", { cx: r(cx), cy: r(cy), r: r(rad(v)), fill: "none" });
      labels += el(
        "text",
        { x: r(cx), y: r(cy - rad(v) + 4), "text-anchor": "middle", "data-ring": "" },
        esc(ctx.fmt(spec.y, v)),
      );
    }

    // Category labels anchored by angle; one that overlaps a placed label is skipped.
    const boxes: number[][] = [];
    names.forEach((name, i) => {
      const a = G / 2 + (i + 0.5) * step;
      const [x, y] = [cx + (R + 6) * Math.sin(a), cy - (R + 6) * Math.cos(a)];
      const sx = Math.sin(a);
      const anchor = Math.abs(sx) < 0.2 ? "middle" : sx > 0 ? "start" : "end";
      const w = name.length * 7.2;
      const l = anchor === "middle" ? x - w / 2 : anchor === "start" ? x : x - w;
      if (boxes.some((b) => l < b[2]! && l + w > b[0]! && y - 7 < b[3]! && y + 7 > b[1]!)) return;
      boxes.push([l, y - 7, l + w, y + 7]);
      labels += el(
        "text",
        { x: r(x), y: r(y), "text-anchor": anchor, "dominant-baseline": "middle", "data-cat": "" },
        esc(name),
      );
    });
    return { marks, hits, labels, grid };
  },
};

register("radial", radial);
