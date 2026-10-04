import { bandScale, linearScale } from "./scale.ts";
import { el, esc, r } from "./svg.ts";
import { niceTicks } from "./ticks.ts";
import type { Axis, Box, ResolvedSpec, Scale } from "./types.ts";

const wide = (c: number) =>
  (c >= 0x1100 && c <= 0x115f) ||
  (c >= 0x2e80 && c <= 0xa4cf) ||
  (c >= 0xac00 && c <= 0xd7a3) ||
  (c >= 0xf900 && c <= 0xfaff) ||
  (c >= 0xfe30 && c <= 0xfe4f) ||
  (c >= 0xff00 && c <= 0xff60) ||
  (c >= 0xffe0 && c <= 0xffe6);

// ponytail: no text measurement in Node; 0.6 em per code point, 1 em for East-Asian-wide ones.
const tw = (s: string) => {
  let n = 0;
  let k = 0;
  for (const ch of s) wide(ch.codePointAt(0)!) ? k++ : n++;
  return n * 7.2 + k * 12;
};
const w = (s: string) => tw(s) + 8;
const maxW = (a: readonly string[]) => a.reduce((m, s) => Math.max(m, w(s)), 0);

/** Cut `s` to `max` px (by code point), ending in an ellipsis. */
function clip(s: string, max: number): string {
  if (tw(s) <= max) return s;
  let o = "";
  let n = 0;
  for (const ch of s) {
    n += tw(ch);
    if (n + 7.2 > max) break;
    o += ch;
  }
  return o + "…";
}

export interface Frame {
  plot: Box;
  /** Bottom and left scales; null when the mark has no such axis. */
  x: Scale | null;
  y: Scale | null;
  grid: string;
  /** Inner markup of the axis-y and axis-x groups. */
  ay: string;
  ax: string;
  /** svg attributes: data-plot, data-n | data-xd + data-yd. */
  attrs: Record<string, string | number | null>;
}

type Fmt = (field: string, v: unknown, step?: number) => string;

/** Ticks of a linear axis; an explicit domain (yDomain, xDomain) replaces the nice one. */
function ticks(spec: ResolvedSpec, a: Extract<NonNullable<Axis>, { kind: "linear" }>, fmt: Fmt) {
  const fixed = (a.field === spec.y ? spec.yDomain : spec.xDomain) ?? null;
  const [lo, hi] = fixed ?? a.domain;
  const tk = niceTicks(lo, hi);
  const values = fixed ? tk.values.filter((v) => v >= lo && v <= hi) : tk.values;
  return {
    domain: fixed ?? tk.domain,
    values,
    labels: values.map((v) => fmt(a.field, v, tk.step)),
  };
}

/** Axes, grid, plot box and scales for the two axes a mark asks for. */
export function frame(
  spec: ResolvedSpec,
  [bx, ly]: [Axis, Axis],
  size: { width: number; height: number },
  fmt: Fmt,
): Frame {
  const { width: W, height: H } = size;
  const bt = bx && bx.kind === "linear" ? ticks(spec, bx, fmt) : null;
  const lt = ly && ly.kind === "linear" ? ticks(spec, ly, fmt) : null;
  // Left band labels are cut at 40% of the width; the full text goes in a <title>.
  const lLab = ly
    ? lt
      ? lt.labels
      : (ly.domain as readonly string[]).map((c) => clip(c, W * 0.4 - 8))
    : [];
  const yTitle = ly && spec.titles.get(ly.field);
  const xTitle = bx && spec.titles.get(bx.field);
  const left = (spec.yAxis && ly ? maxW(lLab) + 10 : 8) + (yTitle ? 18 : 0);
  const bottom = (spec.xAxis && bx ? 24 : 8) + (xTitle ? 18 : 0);
  const plot = {
    x: left,
    y: 10,
    w: Math.max(1, W - left - 12),
    h: Math.max(1, H - 10 - bottom),
  };
  const x: Scale | null = bx
    ? bx.kind === "band"
      ? bandScale(bx.domain, [plot.x, plot.x + plot.w])
      : linearScale(bt!.domain, [plot.x, plot.x + plot.w])
    : null;
  const y: Scale | null = ly
    ? ly.kind === "band"
      ? bandScale(ly.domain, [plot.y, plot.y + plot.h])
      : linearScale(lt!.domain, [plot.y + plot.h, plot.y])
    : null;

  // Grid is perpendicular to each linear axis: one linear = value axis; two = both; none = none.
  let grid = "";
  if (spec.grid) {
    const x2 = r(plot.x + plot.w);
    if (lt)
      for (const v of lt.values) {
        const p = r((y as { of(v: number): number }).of(v));
        grid += el("line", { x1: r(plot.x), x2, y1: p, y2: p });
      }
    if (bt)
      for (const v of bt.values) {
        const p = r((x as { of(v: number): number }).of(v));
        grid += el("line", { x1: p, x2: p, y1: r(plot.y), y2: r(plot.y + plot.h) });
      }
  }

  let ay = "";
  if (spec.yAxis && ly) {
    if (lt)
      lt.values.forEach((v, i) => {
        ay += el(
          "text",
          {
            x: r(plot.x - 6),
            y: r((y as { of(v: number): number }).of(v)),
            "text-anchor": "end",
            "dominant-baseline": "middle",
          },
          esc(lt.labels[i]!),
        );
      });
    else {
      const b = y as { at(i: number): number; bandwidth: number };
      const every = Math.max(1, Math.ceil(14 / (plot.h / Math.max(1, ly.domain.length))));
      (ly.domain as readonly string[]).forEach((c, i) => {
        if (i % every) return;
        const t = lLab[i]!;
        ay += el(
          "text",
          {
            x: r(plot.x - 6),
            y: r(b.at(i) + b.bandwidth / 2),
            "text-anchor": "end",
            "dominant-baseline": "middle",
          },
          esc(t) + (t === c ? "" : el("title", {}, esc(c))),
        );
      });
    }
  }
  if (yTitle) {
    const cy = r(plot.y + plot.h / 2);
    ay += el(
      "text",
      { x: 9, y: cy, "text-anchor": "middle", transform: `rotate(-90 9 ${cy})` },
      esc(yTitle),
    );
  }

  let ax = "";
  if (spec.xAxis && bx) {
    const ty = r(plot.y + plot.h + 16);
    if (bt)
      bt.values.forEach((v, i) => {
        ax += el(
          "text",
          { x: r((x as { of(v: number): number }).of(v)), y: ty, "text-anchor": "middle" },
          esc(bt.labels[i]!),
        );
      });
    else {
      const b = x as { at(i: number): number; bandwidth: number };
      const dom = bx.domain as readonly string[];
      const every = Math.max(1, Math.ceil(maxW(dom) / (plot.w / Math.max(1, dom.length))));
      dom.forEach((c, i) => {
        if (i % every === 0)
          ax += el(
            "text",
            { x: r(b.at(i) + b.bandwidth / 2), y: ty, "text-anchor": "middle" },
            esc(c),
          );
      });
    }
  }
  if (xTitle)
    ax += el("text", { x: r(plot.x + plot.w / 2), y: H - 4, "text-anchor": "middle" }, esc(xTitle));

  const both = bt && lt;
  const band = bx?.kind === "band" ? bx : ly?.kind === "band" ? ly : null;
  return {
    plot,
    x,
    y,
    grid,
    ay,
    ax,
    attrs: {
      "data-plot": `${r(plot.x)} ${r(plot.y)} ${r(plot.w)} ${r(plot.h)}`,
      "data-n": both || !band ? null : band.domain.length,
      "data-xd": both ? bt.domain.join(" ") : null,
      "data-yd": both ? lt.domain.join(" ") : null,
    },
  };
}
