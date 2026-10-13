import { nf } from "../format.ts";
import { bandScale } from "../scale.ts";
import { colorVals } from "../shape.ts";
import { el, esc, hit, key, OTHER, r, tw } from "../svg.ts";
import type {
  Annotate,
  Axis,
  BandScale,
  LinearScale,
  Mark,
  MarkCtx,
  ResolvedSpec,
  Row,
  Shaped,
} from "../types.ts";

const MAX_BAR = 72;

/** A value label over a mark's own fill (no halo); `a` carries the ink (theme.ts). Also used by heatmap. */
export const inText = (
  x: number,
  y: number,
  text: string,
  a: Record<string, string | boolean | null | undefined>,
) =>
  el(
    "text",
    {
      x: r(x),
      y: r(y),
      "text-anchor": "middle",
      "dominant-baseline": "middle",
      "data-in": true,
      ...a,
    },
    esc(text),
  );

/** spec.tooltip.fields as `data-more`: "title\tvalue" lines (the data-f grammar), formatted by `format`; null when none has a value. */
export const more = (ctx: MarkCtx, val: (f: string, i: number) => unknown) =>
  ctx.spec.tipFields
    .flatMap((f, i) => {
      const v = val(f, i);
      // Tabs and newlines are the grammar: a cell holding them must not add rows.
      const t = (x: string) => x.replace(/[\t\n]/g, " ");
      return v == null ? [] : [`${t(ctx.spec.titles.get(f) ?? f)}\t${t(ctx.fmt(f, v))}`];
    })
    .join("\n") || null;

/** The value of a tooltip field in one row (scatter, beeswarm): a `{ field, ratio }` item is that row's num / den. */
export const rowTip = (ctx: MarkCtx, row: Row) => (f: string) => {
  const t = ctx.spec.tipRatio.get(f);
  if (!t) return row[f];
  const [a, b] = [row[t[0]], row[t[1]]];
  return typeof a === "number" && typeof b === "number" && b !== 0 ? a / b : null;
};

/**
 * spec.annotate for every mark, through `place` (true when it placed the label): each `{ x, text }` note
 * on the first group's item at that x that takes it, then per group (a series) its max, min, first and
 * last, each item once (first on ties).
 */
export function marked<T>(
  ctx: MarkCtx,
  groups: T[][],
  x: (t: T) => unknown,
  v: (t: T) => number,
  place: (t: T, a: Annotate | "note", text?: string) => boolean,
  want = ctx.spec.annotate,
) {
  for (const n of ctx.spec.notes)
    groups.some((g) => {
      const t = g.find((t) => String(x(t)) === String(n.x));
      return t !== undefined && place(t, "note", n.text);
    });
  for (const g of groups) {
    const vs = g.map(v);
    const at = [vs.indexOf(Math.max(...vs)), vs.indexOf(Math.min(...vs)), 0, vs.length - 1];
    const seen = new Set<number>();
    (["max", "min", "first", "last"] as const).forEach((a, i) => {
      const j = at[i]!;
      if (g.length && want.includes(a) && !seen.has(j)) (seen.add(j), place(g[j]!, a));
    });
  }
}

/** A label over the mark's own fill: theme.ts reads the fill from the same attributes and picks the ink (data-ink="a"). */
export const inkOf = (d: Record<string, any>) => ({
  "data-ink": "a",
  "data-s": d["data-s"],
  "data-tone": d["data-tone"],
  "data-other": d["data-other"],
  "data-total": d["data-total"],
  "data-q": d["data-q"],
});

interface Item {
  ci: number;
  si: number;
  y0: number;
  y1: number;
  /** Raw value shown (waterfall total: the running total). */
  v: number;
  /** data-s: series slot; waterfall 0 up / 1 down / 2 total. */
  s: number;
}

/** Waterfall: delta bars float on the running total; `totals` categories draw it from 0. */
function steps(shaped: Shaped): Item[] {
  const by: (typeof shaped.cells)[number][] = [];
  for (const c of shaped.cells) by[c.ci] = c;
  const si = shaped.visible[0] ?? 0;
  let run = 0;
  const out: Item[] = [];
  shaped.categories.forEach((_, ci) => {
    const c = by[ci];
    if (!c) return;
    if (shaped.totals[ci]) {
      // A total before any step opens at its own value (last year's figure); later ones are the running sum.
      if (!out.length && c.value !== null) run = c.value;
      return void out.push({ ci, si, y0: 0, y1: run, v: run, s: 2 });
    }
    if (c.value === null) return;
    out.push({ ci, si, y0: run, y1: (run += c.value), v: c.value, s: c.value < 0 ? 1 : 0 });
  });
  return out;
}

const items = (spec: ResolvedSpec, shaped: Shaped): Item[] =>
  spec.type === "waterfall"
    ? steps(shaped)
    : shaped.cells.flatMap((c) =>
        c.value === null
          ? []
          : [{ ci: c.ci, si: c.si, y0: c.y0, y1: c.y1, v: c.value, s: c.si % 8 }],
      );

export const bar: Mark = {
  noun: "Bar",
  axes(spec, shaped) {
    let [lo, hi] = shaped.extent;
    // The limit roll-up is drawn clipped at the plot edge: it never sets the value domain.
    const all = items(spec, shaped);
    const rows = all.filter((i) => shaped.categories[i.ci] !== OTHER);
    if (spec.type === "waterfall" || (rows.length && rows.length < all.length)) {
      lo = hi = 0;
      for (const i of rows) ((lo = Math.min(lo, i.y0, i.y1)), (hi = Math.max(hi, i.y0, i.y1)));
    }
    // A ghost is part of the data: the previous values widen the domain so none is clipped.
    if (spec.was !== null) {
      const w = colorVals(spec, spec.was);
      for (const i of rows) {
        const v = w(shaped.categories[i.ci]!, shaped.series[i.si]!);
        if (v !== null) ((lo = Math.min(lo, v)), (hi = Math.max(hi, v)));
      }
    }
    const cat: Axis = shaped.time
      ? { kind: "time", field: spec.x, domain: shaped.categories, t: shaped.time }
      : { kind: "band", field: spec.x, domain: shaped.categories };
    const val: Axis = { kind: "linear", field: spec.y, domain: [lo, hi] };
    if (spec.y2 !== null) {
      const v2 = shaped.y2.filter((v): v is number => v !== null);
      const right: Axis = {
        kind: "linear",
        field: spec.y2,
        domain: [Math.min(0, ...v2), Math.max(0, ...v2)],
      };
      return [cat, val, right];
    }
    return spec.horizontal ? [val, cat] : [cat, val];
  },
  draw(ctx) {
    const { spec, shaped } = ctx;
    const hz = spec.horizontal;
    const cat = (hz ? ctx.y : ctx.x) as BandScale;
    const val = (hz ? ctx.x : ctx.y) as LinearScale;
    const pl = ctx.plot;
    const mv = spec.tipFields.map((f) => colorVals(spec, f));
    const keys = shaped.visible.map((j) => shaped.series[j]!);
    const inner = bandScale(keys, [0, cat.bandwidth], 0.1, 0);
    const cvOf = colorVals(spec);
    // spec.was: a ghost bar at the previous value over each bar (key "%00was~" + the bar's key).
    const wasOf = spec.was === null ? null : colorVals(spec, spec.was);
    let ghosts = "";
    const moves: [string, number][] = [];
    // A bar past the plot edge (the Other roll-up, a yDomain) is cut there; its label keeps the real value.
    const [e0, e1] = hz ? [pl.x, pl.x + pl.w] : [pl.y, pl.y + pl.h];
    const clip = (v: number) => Math.min(Math.max(v, e0), e1);
    let marks = "";
    let hits = "";
    let labels = "";
    let brk = "";
    const wf = spec.type === "waterfall";
    const tags: [Item, number, number, number, number, Record<string, any>][] = [];
    const grid: (typeof tags)[] = [];
    for (const c of items(spec, shaped)) {
      const k = shaped.visible.indexOf(c.si);
      const full = spec.stack || spec.type === "waterfall" ? cat.bandwidth : inner.bandwidth;
      // ponytail: bars stop growing at MAX_BAR px and sit centred in their slot.
      const th = Math.min(full, MAX_BAR);
      const pos =
        cat.at(c.ci) +
        (spec.stack || spec.type === "waterfall" ? 0 : inner.at(k)) +
        (full - th) / 2;
      const [a, b] = [clip(val.of(c.y0)), clip(val.of(c.y1))];
      const lo = Math.min(a, b);
      // Clipped end: two slanted gaps in the page colour mark the break (CSS: [data-brk]).
      const cut = val.of(c.y1) !== b ? b : val.of(c.y0) !== a ? a : null;
      const len = Math.abs(a - b);
      const [x, y, w, h] = hz ? [lo, pos, len, th] : [pos, lo, th, len];
      if (cut !== null)
        for (const o of [8, 13]) {
          // Into the plot, whichever end is cut (a value below the domain is a zero-length bar at the far edge).
          const mid = hz ? pl.x + pl.w / 2 : pl.y + pl.h / 2;
          const q = cut + (cut < mid ? o : -o);
          brk += hz
            ? `M${r(q)} ${r(y + h + 1)}l5 ${r(-h - 2)}`
            : `M${r(x - 1)} ${r(q)}l${r(w + 2)} -5`;
        }
      const cname = shaped.categories[c.ci]!;
      const ser = shaped.series[c.si]!;
      const cv = cvOf(cname, ser);
      const wv = wasOf?.(cname, ser) ?? null;
      if (wv !== null) {
        const [g0, g1] = [clip(val.of(0)), clip(val.of(wv))];
        const gl = Math.min(g0, g1);
        const gn = Math.abs(g0 - g1);
        // Grouped bars (series): a tick across the bar at the old value, not a box beside its neighbours.
        const tick = spec.series !== null && !spec.stack;
        const [ga, gb] = tick ? [g1 - 1, 2] : [gl, gn];
        ghosts += el("rect", {
          "data-key": key("\u0000was", ser, cname),
          "data-past": true,
          "data-tick": tick,
          "data-c": c.ci,
          "data-s": c.s,
          "data-neg": wv < 0,
          fill: "none", // until the theme's [data-past] rule paints it
          ...(hz
            ? { x: r(tick ? ga! : gl), y: r(pos), width: r(tick ? gb! : gn), height: r(th) }
            : { x: r(pos), y: r(tick ? ga! : gl), width: r(th), height: r(tick ? gb! : gn) }),
        });
        if (wv)
          moves.push([ctx.fmt(spec.x, cname) + (ser && " " + ser), (c.v - wv) / Math.abs(wv)]);
      }
      const d = {
        "data-key": key(ser, cname),
        "data-c": c.ci,
        "data-i": shaped.index?.[c.ci],
        "data-s": c.s,
        "data-x": ctx.fmt(spec.x, cname),
        "data-series": ser,
        "data-f": ctx.fmt(spec.y, c.v),
        "data-y": c.v,
        "data-neg": c.v < 0,
        "data-tone": ctx.tone(c.v),
        "data-q": cv === null ? null : ctx.q(cv),
        "data-was": wv === null ? null : ctx.t("was", ctx.fmt(spec.y, wv)),
        "data-other": cname === OTHER,
        "data-more": more(ctx, (_, k) => mv[k]!(cname, ser)),
        // waterfall start and running total: neutral, so colour keeps one meaning (up or down)
        "data-total": shaped.totals[c.ci] || (wf && !tags.length),
      };
      marks += el("rect", {
        "data-maya": "mark",
        ...d,
        // Waterfall direction for the theme's up, down and total tokens (not on the hit).
        "data-way": wf ? (d["data-total"] ? "total" : c.v < 0 ? "down" : "up") : null,
        x: r(x),
        y: r(y),
        width: r(w),
        height: r(h),
      });
      hits += hit(d, x, y, w, h);
      // A clipped Other bar would otherwise show its total only on hover: print it at the break.
      if (cut !== null && cname === OTHER && !spec.labels)
        ctx.label(
          hz ? cut - 20 : x + w,
          hz ? y + h / 2 : cut + 28,
          ctx.fmt(spec.y, c.v),
          "end",
          d["data-key"],
        );
      tags.push([c, x, y, w, h, d]);
      // 128 px column buckets by left edge + MAX_BAR (bars are at most that wide): a plain label only meets the bars in the
      // columns it spans.
      // (A label left of the svg is dropped anyway, so a negative slice start costs nothing.)
      (grid[(x + MAX_BAR) >> 7] ??= []).push(tags.at(-1)!);
    }
    // A label at the bar's end: outside when it fits (a negative bar's stays off the axis labels), else
    // inside the end (the cut roll-up clear of its break mark); false when neither has room.
    const atEnd = (
      [c, x, y, w, h, d]: (typeof tags)[number],
      text: string,
      a?: Annotate | "note",
    ) => {
      const [neg, est, k] = [c.v < 0, tw(text), d["data-key"]];
      if (
        hz
          ? (!neg || x - 4 - est >= pl.x) &&
            ctx.label(neg ? x - 4 : x + w + 4, y + h / 2, text, neg ? "end" : "start", k, a)
          : (!neg || y + h + 14 <= pl.y + pl.h) &&
            ctx.label(x + w / 2, neg ? y + h : y, text, neg ? "below" : "above", k, a)
      )
        return true;
      if (!(hz ? est + 8 <= w && h >= 10 : est <= w && h >= 16)) return false;
      labels += inText(
        hz ? (neg ? x + 4 : x + w - (d["data-other"] ? 14 : 4)) : x + w / 2,
        hz ? y + h / 2 : neg ? y + h - 9 : y + 9,
        text,
        {
          ...inkOf(d),
          "data-key": k,
          "data-ann": a,
          "text-anchor": hz ? (neg ? "start" : "end") : "middle",
        },
      );
      return true;
    };
    // spec.annotate: notes, then per series the max, min, first and last bar (not the Other roll-up),
    // ahead of the plain value labels. ponytail: not on stacks (a segment's end is not a value to read).
    const noted = new Set<string>();
    if ((spec.annotate.length || spec.notes.length) && !spec.stack)
      marked(
        ctx,
        shaped.visible.map((si) =>
          tags.filter(([c, , , , , d]) => c.si === si && !d["data-other"]),
        ),
        (t) => shaped.categories[t[0].ci],
        (t) => t[0].v,
        (t, a, said) =>
          atEnd(t, said ?? ctx.fmt(spec.y, t[0].v), a) && !!noted.add(t[5]["data-key"]),
      );
    if (spec.labels && tags.length) {
      // The first and last bar (a waterfall's start and Total) claim their room first; a waterfall
      // step label must fit inside its own column or it is dropped.
      // ponytail: a grouped label wider than its bar sits above it and is dropped only when it collides with another label; a waterfall step wider than its column is dropped (the first and the Total hug their edge).
      const first = tags[0]!;
      const last = tags.at(-1)!;
      // Horizontal bars label inside only when every label fits, else all outside (one rule per chart, not per bar).
      const all =
        hz &&
        !spec.stack &&
        tags.every(([c, , , w, h]) => tw(ctx.fmt(spec.y, c.v)) <= w && h >= 14);
      for (const t of wf ? new Set([first, last, ...tags]) : tags) {
        const [c, x, y, w, h, d] = t;
        const dk = d["data-key"];
        if (noted.has(dk)) continue;
        // Inside when it fits, else outside the bar end (collisions are dropped by ctx.label).
        const text = ctx.fmt(spec.y, c.v);
        const est = tw(text);
        if (wf && est > cat.step && t !== first && t !== last) continue;
        const [cx, cy] = [x + w / 2, y + h / 2];
        const neg = c.v < 0;
        if (hz && !spec.stack ? all : est <= w && h >= (hz ? 14 : 16)) {
          // At the bar's end, where the eye reads a value; a stack segment keeps its middle.
          // A bar cut at the plot edge keeps the middle, clear of its break slashes.
          const pin =
            !spec.stack &&
            (hz ? x + w < pl.x + pl.w - 0.5 && est + 16 <= w : y > pl.y + 0.5 && h >= 22);
          labels += inText(
            pin && hz ? (neg ? x + 8 : x + w - 8) : cx,
            pin && !hz ? (neg ? y + h - 10 : y + 10) : cy,
            text,
            {
              ...inkOf(d),
              "data-key": dk,
              "text-anchor": pin && hz ? (neg ? "start" : "end") : "middle",
            },
          );
        } else if (spec.stack && !neg)
          continue; // ponytail: a positive segment too small for its value drops it (outside lands on its neighbour); a negative one keeps its label below, assuming one negative series
        else if (hz) atEnd(t, text);
        else {
          const ey = neg ? y + h : y;
          // A waterfall's first and last tag hug their column's outer edge instead of straddling a step.
          const end = t === last;
          const edge = wf && (end || t === first);
          const ax = edge ? (end ? x + w : x) : cx;
          const l0 = edge ? (end ? ax - est : ax) : cx - est / 2;
          const t0 = neg ? ey + 3 : ey - 16; // the label's band is 13 px tall
          // One scan of the column's neighbours. Not an edge tag: a taller neighbour under the label
          // drops it. An edge tag clears a neighbour poking into its band by sitting beyond its end.
          let e = ey;
          let over = false;
          // some() skips the empty buckets, copies nothing and stops at the first cover of a plain tag.
          grid.slice(l0 >> 7, ((l0 + est + MAX_BAR) >> 7) + 1).some((g) =>
            g.some(([, bx, by, bw, bh]) => {
              if (bx !== x && l0 < bx + bw && l0 + est > bx) {
                over ||= t0 < by + bh && t0 + 13 > by;
                const g = neg ? e : e - 16; // the 16 px band the label would occupy
                if (by + bh > g && by < g + 16) e = neg ? by + bh : by;
              }
              return over && !edge;
            }),
          );
          if (edge) ctx.label(ax, neg ? e + 9 : e - 9, text, end ? "end" : "start", dk);
          else if (!over) ctx.label(cx, ey, text, neg ? "below" : "above", dk);
        }
      }
    }
    if (ctx.y2 && spec.y2 !== null && shaped.y2.length) {
      // y2 line over the bars: unique keys (key("l", NUL+"y2") / key(NUL+"y2", category)).
      const f2 = spec.y2;
      const slot = shaped.series.length % 8;
      const name = spec.titles.get(f2) ?? f2;
      let d = "";
      let gap = true;
      let dots = "";
      shaped.y2.forEach((v, ci) => {
        if (v === null) {
          gap = true;
          return;
        }
        const px = r(cat.at(ci) + cat.bandwidth / 2);
        const py = r(ctx.y2!.of(v));
        d += `${gap ? "M" : "L"}${px} ${py}`;
        gap = false;
        const cname = shaped.categories[ci]!;
        const p = {
          "data-key": key("\u0000y2", cname),
          "data-c": ci,
          "data-i": shaped.index?.[ci],
          "data-s": slot,
          "data-x": ctx.fmt(spec.x, cname),
          "data-series": name,
          "data-f": ctx.fmt(f2, v),
          "data-y": v,
          "data-neg": v < 0,
        };
        dots += el("circle", { "data-maya": "mark", ...p, r: 3, cx: px, cy: py });
        hits += hit(p, +px - 3, +py - 3, 6, 6);
        if (spec.labels) ctx.label(+px, +py, ctx.fmt(f2, v), "above", p["data-key"]);
      });
      marks +=
        el("path", {
          "data-maya": "line",
          "data-key": key("l", "\u0000y2"),
          "data-s": slot,
          pathLength: 1,
          d: d || null,
        }) + dots;
    }
    // The 2 largest relative moves, largest first (ties: data order).
    const pct = nf(spec.locale, {
      style: "percent",
      signDisplay: "exceptZero",
      maximumFractionDigits: 0,
    });
    const top = moves.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 2);
    return {
      marks: marks + ghosts, // ghosts on top: a fall shows past the bar, a rise as a dashed box inside it
      hits,
      labels: labels + (brk ? el("path", { "data-brk": true, d: brk }) : ""),
      note: top.length
        ? ctx.t(
            "since",
            spec.titles.get(spec.was!) ?? spec.was!,
            top.map(([n, v]) => `${n} ${pct.format(v)}`).join(", "),
          ) + "."
        : "",
    };
  },
};
