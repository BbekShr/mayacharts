import { dtf } from "./format.ts";
import { bandScale, linearScale, timeScale } from "./scale.ts";
import { el, esc, r } from "./svg.ts";
import { niceTicks, timeTicks } from "./ticks.ts";
import type { Axis, Box, LinearScale, ResolvedSpec, Scale, TimeScale } from "./types.ts";

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
  /** Right linear scale (third axis); null when the mark asks for none. */
  y2: LinearScale | null;
  grid: string;
  /** Inner markup of the axis-y and axis-x groups. */
  ay: string;
  ax: string;
  /** svg attributes: data-plot, data-n | data-xd + data-yd, data-t (time axis). */
  attrs: Record<string, string | number | boolean | null>;
}

type Fmt = (field: string, v: unknown, step?: number) => string;

/** Ticks of a linear axis; an explicit domain (yDomain, xDomain) replaces the nice one. */
function ticks(spec: ResolvedSpec, a: Extract<NonNullable<Axis>, { kind: "linear" }>, fmt: Fmt) {
  const fixed = (a.field === spec.y ? spec.yDomain : spec.xDomain) ?? null;
  const [d0, d1] = fixed ?? a.domain;
  // A reversed yDomain ([hi, lo]) keeps its order for the scale; ticks are computed low to high.
  const [lo, hi] = d0 > d1 ? [d1, d0] : [d0, d1];
  const tk = niceTicks(lo, hi);
  const values = fixed ? tk.values.filter((v) => v >= lo && v <= hi) : tk.values;
  // A fixed domain end at the top of the axis (rank 1 on [15, 1]) gets its tick when it is not
  // within half a step of a neighbour.
  if (fixed && !values.some((v) => Math.abs(v - d1) < tk.step / 2)) {
    values.push(d1);
    values.sort((a, b) => a - b);
  }
  return {
    domain: fixed ?? tk.domain,
    values,
    labels: values.map((v) => fmt(a.field, v, tk.step)),
  };
}

/** Per-unit default label formats (UTC); the first tick and each January of a month axis add the year. */
const TIME_FMT = (u: string): Intl.DateTimeFormatOptions =>
  u === "year"
    ? { year: "numeric" }
    : u === "quarter" || u === "month"
      ? { month: "short" }
      : u === "week" || u === "day"
        ? { month: "short", day: "numeric" }
        : { hour: "numeric", minute: "2-digit", second: u === "second" ? "2-digit" : undefined };

/**
 * Calendar ticks of a time axis, about `target` of them; `spec.format` on the axis field wins
 * over the unit defaults. Sub-day ticks at UTC midnight and the first tick carry the date.
 */
function timeAxis(
  spec: ResolvedSpec,
  a: Extract<NonNullable<Axis>, { kind: "time" }>,
  fmt: Fmt,
  target: number,
) {
  const tk = timeTicks(a.t[0] ?? 0, a.t.at(-1) ?? 0, target, true);
  const mk = (o: Intl.DateTimeFormatOptions) => dtf(spec.locale, { timeZone: "UTC", ...o });
  const plain = mk(TIME_FMT(tk.unit));
  const yeared = mk({ month: "short", year: "numeric" });
  const dated = mk({ month: "short", day: "numeric" });
  const datedTime = mk({ ...TIME_FMT("day"), ...TIME_FMT(tk.unit) });
  const custom = spec.format.has(a.field);
  const month = tk.unit === "quarter" || tk.unit === "month";
  const sub = tk.unit === "hour" || tk.unit === "minute" || tk.unit === "second";
  const labels = tk.values.map((v, i) =>
    custom
      ? fmt(a.field, v)
      : (month && (i === 0 || new Date(v).getUTCMonth() === 0)
          ? yeared
          : sub && v % 864e5 === 0
            ? dated
            : sub && i === 0
              ? datedTime
              : plain
        ).format(v),
  );
  return {
    values: tk.values,
    labels,
    end: (v: number) => (custom ? fmt(a.field, v) : dated.format(v)),
  };
}

/** Axes, grid, plot box and scales for the two axes a mark asks for. */
export function frame(
  spec: ResolvedSpec,
  [bx, ly, ry]: [Axis, Axis, Axis?],
  size: { width: number; height: number },
  fmt: Fmt,
): Frame {
  const { width: W, height: H } = size;
  const bt = bx && bx.kind === "linear" ? ticks(spec, bx, fmt) : null;
  // The plot is not known yet: size the first tick set from the full width (only its end labels matter here).
  const tt =
    bx && bx.kind === "time" ? timeAxis(spec, bx, fmt, Math.max(2, Math.round(W / 80))) : null;
  const edge = bt ?? tt; // tick labels centred on the plot's ends need half their width as margin
  const lt = ly && ly.kind === "linear" ? ticks(spec, ly, fmt) : null;
  // Band labels go through the field's format (month presets on x); left ones are cut at 40%.
  const bLab =
    bx && !bt && !tt ? (bx.domain as readonly string[]).map((c) => fmt(bx.field, c)) : [];
  const lFull = ly && !lt ? (ly.domain as readonly string[]).map((c) => fmt(ly.field, c)) : [];
  const lLab = lt ? lt.labels : lFull.map((c) => clip(c, W * 0.4 - 8));
  const rt = ry && ry.kind === "linear" ? ticks(spec, ry, fmt) : null;
  const rTitle = rt && ry && spec.titles.get(ry.field);
  const yTitle = ly && spec.titles.get(ly.field);
  const xTitle = bx && spec.titles.get(bx.field);
  // Without a left axis, still leave room for half of the first bottom tick label.
  const left = Math.max(
    (spec.yAxis && ly ? maxW(lLab) + 10 : 8) + (yTitle ? 18 : 0),
    edge ? tw(edge.labels[0] ?? "") / 2 + 2 : 0,
  );
  const bottom = (spec.xAxis && bx ? 24 : 8) + (xTitle ? 18 : 0);
  const plot = {
    x: left,
    y: 10,
    // Room for half of the last bottom tick label, which is centred on the plot's right edge.
    w: Math.max(
      1,
      W -
        left -
        (rt
          ? (spec.yAxis ? maxW(rt.labels) + 4 : 8) + (rTitle ? 18 : 0)
          : Math.max(12, edge ? tw(edge.labels.at(-1) ?? "") / 2 + 2 : 0)),
    ),
    h: Math.max(1, H - 10 - bottom),
  };
  const x: Scale | null = bx
    ? bx.kind === "band"
      ? bandScale(bx.domain, [plot.x, plot.x + plot.w])
      : bx.kind === "time"
        ? timeScale(bx.domain, bx.t, [plot.x, plot.x + plot.w])
        : linearScale(bt!.domain, [plot.x, plot.x + plot.w])
    : null;
  const y: Scale | null = ly
    ? ly.kind === "band"
      ? bandScale(ly.domain, [plot.y, plot.y + plot.h])
      : linearScale(lt!.domain, [plot.y + plot.h, plot.y])
    : null;

  const y2 = rt ? linearScale(rt.domain, [plot.y + plot.h, plot.y]) : null;

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
      lFull.forEach((c, i) => {
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

  if (rt && y2) {
    if (spec.yAxis)
      rt.values.forEach((v, i) => {
        ay += el(
          "text",
          {
            x: r(plot.x + plot.w + 6),
            y: r(y2.of(v)),
            "text-anchor": "start",
            "dominant-baseline": "middle",
          },
          esc(rt.labels[i]!),
        );
      });
    if (rTitle) {
      const [tx, cy] = [W - 9, r(plot.y + plot.h / 2)];
      ay += el(
        "text",
        { x: tx, y: cy, "text-anchor": "middle", transform: `rotate(90 ${tx} ${cy})` },
        esc(rTitle),
      );
    }
  }

  let ax = "";
  if (spec.xAxis && bx) {
    const ty = r(plot.y + plot.h + 16);
    if (tt && bx.kind === "time") {
      // Ticks sit at their time, clamped to the first and last band centres. If the pixel gap would
      // still drop a label, retry with one tick fewer (down to 2) so the ticks stay evenly spaced.
      const sc = x as TimeScale;
      const [lo, hi] = [sc.of(bx.t[0] ?? 0), sc.of(bx.t.at(-1) ?? 0)];
      let target = Math.max(2, Math.round(plot.w / 80));
      for (;;) {
        const t = timeAxis(spec, bx, fmt, target);
        let right = -Infinity;
        let out = "";
        let dropped = false;
        t.values.forEach((v, i) => {
          const px = Math.min(hi, Math.max(lo, sc.of(v)));
          const half = w(t.labels[i]!) / 2;
          if (px - half < right) return void (dropped = true);
          right = px + half;
          out += el("text", { x: r(px), y: ty, "text-anchor": "middle" }, esc(t.labels[i]!));
        });
        ax += out;
        // Narrow plot: fewer than 2 ticks survived, so label the first and last point at the plot edges.
        if (target <= 2 && out.split("<text").length < 3 && bx.t.length > 1)
          ax =
            ax.slice(0, ax.length - out.length) +
            el("text", { x: r(lo), y: ty, "text-anchor": "start" }, esc(t.end(bx.t[0]!))) +
            el("text", { x: r(hi), y: ty, "text-anchor": "end" }, esc(t.end(bx.t.at(-1)!)));
        if (!dropped || target <= 2) break;
        ax = ax.slice(0, ax.length - out.length);
        target--;
      }
    } else if (bt) {
      // Linear ticks are thinned like band labels when they would overlap.
      const every = Math.max(
        1,
        Math.ceil(maxW(bt.labels) / (plot.w / Math.max(1, bt.values.length - 1))),
      );
      bt.values.forEach((v, i) => {
        if (i % every) return;
        ax += el(
          "text",
          { x: r((x as { of(v: number): number }).of(v)), y: ty, "text-anchor": "middle" },
          esc(bt.labels[i]!),
        );
      });
    } else {
      const b = x as { at(i: number): number; bandwidth: number };
      // Up to 8 categories are never thinned: each label is cut to its slot instead.
      const few = bLab.length <= 8;
      const every = few ? 1 : Math.max(1, Math.ceil(maxW(bLab) / (plot.w / bLab.length)));
      bLab.forEach((c, i) => {
        if (i % every) return;
        const t = few ? clip(c, plot.w / bLab.length - 8) : c;
        ax += el(
          "text",
          { x: r(b.at(i) + b.bandwidth / 2), y: ty, "text-anchor": "middle" },
          esc(t) + (t === c ? "" : el("title", {}, esc(c))),
        );
      });
    }
  }
  if (xTitle)
    ax += el("text", { x: r(plot.x + plot.w / 2), y: H - 4, "text-anchor": "middle" }, esc(xTitle));

  const both = bt && lt;
  const band = bx?.kind === "band" || bx?.kind === "time" ? bx : ly?.kind === "band" ? ly : null;
  return {
    plot,
    x,
    y,
    y2,
    grid,
    ay,
    ax,
    attrs: {
      "data-plot": `${r(plot.x)} ${r(plot.y)} ${r(plot.w)} ${r(plot.h)}`,
      "data-n": both || !band ? null : band.domain.length,
      "data-t": tt ? true : null,
      "data-xd": both ? bt.domain.join(" ") : null,
      "data-yd": both ? lt.domain.join(" ") : null,
    },
  };
}
