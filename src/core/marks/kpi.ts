import { colorVals, thin } from "../shape.ts";
import { clip, el, esc, key, plotHit, r } from "../svg.ts";
import type { Cell, Mark, MarkCtx } from "../types.ts";

const PAD = 12;
// One hover target per 4 px of sparkline; a denser series keeps each bucket's low and high.
const PX = 4;
const MIN_TILE = 140;
const num = (v: unknown) => (typeof v === "number" ? v : null);
const STATUS = { good: "onTrack", warn: "atRisk", bad: "offTrack" } as const;

/** One measure's tile in the box X,Y,W,H: title, headline, comparisons, sparkline, bullet. */
function tile(ctx: MarkCtx, f: string, si: number, multi: boolean, B: number[]) {
  const { spec, shaped } = ctx;
  const [X, Y, W, H] = B as [number, number, number, number];
  const cats = spec.x ? shaped.categories : [];
  const cells: Cell[] = spec.x ? shaped.cells.filter((c) => c.si === si) : [];
  const live = cells.filter((c) => c.value !== null);
  const last = live[live.length - 1];
  const sum = (field: string) => ctx.agg(spec.aggregate)(spec.data.map((row) => num(row[field])));
  const value = spec.x ? (last?.value ?? null) : sum(f);
  const L = X + PAD;
  const iw = W - 2 * PAD;
  const text = (a: Parameters<typeof el>[1], s: string) =>
    el("text", { ...a, "dominant-baseline": "hanging", x: L }, s);
  const title = multi
    ? text(
        { "data-kpi": "of", y: Y + PAD, "font-size": 12 },
        esc(clip(spec.titles.get(f) ?? f, Math.floor(iw / 6.6))),
      )
    : "";
  if (value === null)
    return {
      spark: "",
      head: "",
      labels:
        title +
        text(
          { "data-kpi": "of", y: Y + PAD + (multi ? 22 : 0), "font-size": 12 },
          esc(ctx.t("noData")),
        ),
      grid: "",
      hits: "",
    };

  const ci = last?.ci ?? 0;
  const period = spec.x ? ctx.fmt(spec.x, cats[ci]) : "";
  const fv = ctx.fmt(f, value);
  const cap = multi ? 32 : 72;
  const fs0 = Math.min(H * (multi ? 0.28 : 0.32), cap, iw / (fv.length * 0.62));
  // No data-c: the headline and bullet are not the last sparkline dot's tooltip group.
  const goal = spec.goals.get(f);
  const target = goal?.target ?? null;
  const dir = goal?.better === "lower" ? -1 : 1;
  const status = target === null ? null : ctx.tone(value, f);
  const sKey = (p: string) => (multi ? key(p, f) : p);
  // Colour means status only: a multi tile draws every sparkline in one accent unless spec.colors is set.
  const sc = multi && !spec.colors ? 0 : si % 8;
  const label = multi ? (spec.titles.get(f) ?? f) : null;
  const payload = {
    "data-s": sc,
    "data-series": multi ? f : null,
    "data-label": label,
    "data-x": period,
    "data-y": value,
    "data-f": fv,
  };

  // Comparisons, most useful first: the previous period, the `was` field, the target.
  const pct = new Intl.NumberFormat(spec.locale, {
    style: "percent",
    notation: "compact",
    maximumFractionDigits: 1,
    signDisplay: "exceptZero",
  });
  const prev = live[live.length - 2];
  const wasV = !spec.was
    ? null
    : spec.x
      ? last
        ? colorVals(spec, spec.was)(cats[last.ci]!, "")
        : null
      : sum(spec.was);
  const e: unknown = spec.format.get(f);
  const isPct =
    e === "percent" ||
    (typeof e === "string" && e.endsWith(":percent}")) ||
    (typeof e === "object" && e !== null && (e as { style?: string }).style === "percent");
  const pts = new Intl.NumberFormat(spec.locale, {
    maximumFractionDigits: 1,
    signDisplay: "exceptZero",
  });
  const lines: { s: string; tone: string | null }[] = [];
  const compare = (
    ref: number | null | undefined,
    label: string,
    tone?: string | null,
    short = label,
  ) => {
    if (!ref) return; // no baseline, or a zero one: a percent of nothing
    const d = value - ref;
    const arrow = d > 0 ? "▲" : d < 0 ? "▼" : "→";
    const p = pct.format(d / Math.abs(ref)).replace("-", "−");
    // A percent measure states the absolute move in points, the relative one in brackets.
    const amount = isPct
      ? ctx.t("pts", pts.format(d * 100).replace("-", "−"))
      : (d > 0 ? "+" : "") + ctx.fmt(f, d).replace("-", "−");
    let s = ctx.t("change", arrow, amount, p, label);
    // A narrow tile keeps the percent and the label, then cuts to fit (12px text is about 6.6px a character).
    // ponytail: text fit is a fixed 6.6 px per character estimate, not measured; wide glyphs can still overflow a tile.
    if (s.length * 6.6 > iw) s = clip(`${arrow} ${ctx.t("vs", p, short)}`, Math.floor(iw / 6.6));
    lines.push({
      s,
      tone: tone === undefined ? (d * dir > 0 ? "good" : d * dir < 0 ? "bad" : null) : tone,
    });
  };
  if (last && prev) compare(prev.value, ctx.fmt(spec.x, cats[prev.ci]));
  if (spec.was) compare(wasV, spec.titles.get(spec.was) ?? spec.was);
  if (target !== null)
    compare(target, `${ctx.t("target")} ${ctx.fmt(f, target)}`, status, ctx.t("target"));

  // A small box drops comparisons from the bottom, then shrinks the headline to what is left,
  // then drops the status word (18 px) rather than let the headline fall under 16 px. Never overlap.
  let showStatus = target !== null;
  const room = () =>
    H - 2 * PAD - (multi ? 20 : 0) - (target === null ? 0 : showStatus ? 32 : 14) - 4;
  let k = lines.length;
  while (k && fs0 + 16 * k > room()) k--;
  if (Math.min(fs0, room()) < 16) showStatus = false;
  const fs = r(Math.max(16, Math.min(fs0, room())));

  let spark = "";
  let labels = title;
  let grid = "";
  let hits = "";
  let top = Y + PAD + (multi ? 20 : 0);
  let head = text(
    {
      "data-maya": "mark",
      "data-key": sKey("v"),
      ...payload,
      "data-tone": status,
      "font-size": fs,
      y: top,
    },
    esc(fv),
  );
  top += fs + 4;
  lines.slice(0, k).forEach((c, i) => {
    // The arrow carries the tone; the first comparison is toned throughout, the rest are quiet.
    const arrow = c.s.slice(0, 1);
    labels += text(
      {
        "data-kpi": i ? "of" : "delta",
        "data-tone": i ? null : c.tone,
        y: r(top),
        "font-size": 12,
      },
      (i && c.tone
        ? `<tspan data-tone="${c.tone}" aria-hidden="true" dominant-baseline="hanging">${arrow}</tspan>`
        : esc(arrow)) + esc(c.s.slice(1)),
    );
    top += 16;
  });
  const rowTop = top; // where the period caption sits when there is no sparkline to anchor it to
  top += 18;

  let bottom = Y + H - PAD;
  const hasSpark = cats.length >= 3 && bottom - (target === null ? 0 : 38) - top >= 28;
  let lim = bottom; // the caption of a sparkline-less tile must end above this
  if (target !== null) {
    const [lo, hi] = spec.yDomain
      ? [Math.min(...spec.yDomain), Math.max(...spec.yDomain)]
      : [0, Math.max(target, goal!.warn ?? 0) * 1.2]; // the dial must reach a lower-is-better warn line
    // `|| 0`: a span past Number.MAX_VALUE divides Infinity by Infinity.
    const pos = (v: number) => Math.min(Math.max((v - lo) / (hi - lo || 1) || 0, 0), 1);
    const bands = goal!.warn !== null;
    // A banded bullet: tall faint good/warn/bad zones with a thinner bar across them.
    // Both bullets sit in one 14 px row, so tiles side by side align. A multi tile with no
    // sparkline lifts it under the comparisons instead of leaving a gap.
    const by =
      multi && !hasSpark
        ? Math.min(bottom - 14, (period ? top : rowTop + 2) + (showStatus ? 18 : 0))
        : bottom - 14;
    const bar = bands ? 6 : 8;
    // Unkeyed parts live outside the marks group (the element diffs marks by data-key).
    if (bands) {
      const a = pos(target);
      const b = pos(goal!.warn!);
      const edges = dir > 0 ? [0, b, a, 1] : [0, a, b, 1];
      const tones = dir > 0 ? ["bad", "warn", "good"] : ["good", "warn", "bad"];
      tones.forEach((t, i) => {
        const [p, q] = [edges[i]!, edges[i + 1]!];
        if (q > p)
          grid += el("rect", {
            "data-kpi": "band",
            "data-tone": t,
            fill: "var(--maya-fg)",
            "fill-opacity": [0.06, 0.12, 0.2][dir > 0 ? 2 - i : i],
            x: r(L + iw * p),
            y: by,
            width: r(iw * (q - p)),
            height: 14,
          });
      });
      // The warn edge: a hairline, so the zone boundary reads without a hue.
      grid += el("line", {
        "data-kpi": "warn",
        stroke: "var(--maya-fg-muted)",
        "stroke-width": 1,
        x1: r(L + iw * b),
        x2: r(L + iw * b),
        y1: by,
        y2: by + 14,
      });
    } else
      grid = el("rect", { "data-kpi": "track", x: L, y: by + 3, width: r(iw), height: 8, rx: 4 });
    spark += el("rect", {
      "data-maya": "mark",
      "data-key": sKey("b"),
      ...payload,
      "data-kpi": "fill",
      "data-dir": "h", // grows left to right on entrance
      "data-tone": status,
      x: L,
      y: by + (14 - bar) / 2,
      width: r(iw * pos(value)),
      height: bar,
      rx: bar / 2,
    });
    const tick = (v: number, d: number, a: Parameters<typeof el>[1]) =>
      el("line", {
        ...a,
        x1: r(L + iw * pos(v)),
        x2: r(L + iw * pos(v)),
        y1: by - d,
        y2: by + 14 + d,
      });
    labels += tick(target, 3, { "data-kpi": "target", "stroke-width": 2 });
    if (showStatus)
      labels += text(
        {
          "data-kpi": "status",
          "data-tone": status,
          y: by - 18,
          "font-size": 12,
          "font-weight": 600,
        },
        esc(ctx.t(STATUS[status as keyof typeof STATUS])),
      );
    lim = by - (showStatus ? 18 : 0);
    bottom = by - 24;
  }

  // ponytail: sparkline needs 28px; with a target bullet and a short box the bullet wins.
  // A long series arrives thinned (shape.ts): x positions come from the kept categories' own indexes.
  const total = shaped.reduced?.[1] ?? cats.length;
  const at = (ci: number) => shaped.index?.[ci] ?? ci;
  if (hasSpark) {
    const vs = live.map((c) => c.value!);
    const lo = vs.reduce((a, b) => Math.min(a, b)); // not Math.min(...vs): that throws on long series
    const span = vs.reduce((a, b) => Math.max(a, b)) - lo || 1;
    const step = iw / (total - 1);
    const px = (i: number) => r(L + at(i) * step);
    const py = (v: number) => r(bottom - ((v - lo) / span) * (bottom - top - 4) - 2);
    const shown = thin([cells.map((c) => c.value)], Math.floor(iw / PX)).map((k) => cells[k]!);
    let d = "";
    let dots = ""; // before the headline and bullet in the DOM: a keyboard walk starts on the first dot
    let gap = true;
    shown.forEach((c) => {
      if (c.value === null) return void (gap = true);
      d += `${gap ? "M" : "L"}${px(c.ci)} ${py(c.value)}`;
      gap = false;
      dots += el("circle", {
        "data-maya": "mark",
        "data-key": key(multi ? f : "", cats[c.ci]),
        "data-c": c.ci,
        "data-s": sc,
        "data-series": multi ? f : null,
        "data-label": label,
        "data-x": ctx.fmt(spec.x, cats[c.ci]),
        "data-y": c.value,
        "data-f": ctx.fmt(f, c.value),
        "data-neg": c.value < 0,
        "data-last": c === last,
        "data-tone": ctx.tone(c.value, f),
        r: 3,
        cx: px(c.ci),
        cy: py(c.value),
      });
    });
    // Unbroken sparkline: a soft area under it (render.ts adds the fading gradient).
    spark =
      (live.length === cells.length
        ? el("path", {
            "data-maya": "area",
            "data-key": key("a", multi ? f : ""),
            "data-s": sc,
            d: `${d}L${px(last!.ci)} ${r(bottom)}L${px(live[0]!.ci)} ${r(bottom)}Z`,
          })
        : "") +
      el("path", {
        "data-maya": "line",
        "data-key": key("l", multi ? f : ""),
        "data-s": sc,
        pathLength: 1,
        d: d || null,
      }) +
      dots +
      spark;
    hits = plotHit({ x: X, y: top, w: W, h: bottom - top });
    // The headline's period names the sparkline's last point: right-aligned above it, in the
    // row reserved for it, so the line (whose peak may be that point) never touches it.
    if (period)
      labels += el(
        "text",
        {
          "data-kpi": "period",
          x: px(last!.ci),
          y: Math.max(
            rowTop,
            Math.min(
              ...shown
                .filter(
                  (c) => c.value !== null && +px(c.ci) > +px(last!.ci) - period.length * 6 - 6,
                )
                .map((c) => +py(c.value!)),
            ) - 18,
          ),
          "font-size": 11,
          "text-anchor": "end",
          "dominant-baseline": "hanging",
        },
        esc(period),
      );
  } else if (period && rowTop + 14 <= lim)
    labels += text({ "data-kpi": "period", y: r(rowTop), "font-size": 11 }, esc(period));
  return { spark, head: head + "", labels, grid, hits };
}

/** Headline, changes against the previous period, `was` and target, sparkline, target bullet. A `y` array lays one tile per measure side by side. No axes: everything from width/height. */
function draw(ctx: MarkCtx) {
  const { spec, width: W, height: H } = ctx;
  const ms = spec.measures;
  // Balanced grid: as many columns as fit (MIN_TILE each), then no more than the rows need.
  const cols0 = Math.max(1, Math.min(ms.length, Math.floor(W / MIN_TILE)));
  const rows = Math.ceil(ms.length / cols0);
  const cols = Math.ceil(ms.length / rows);
  const tw = W / cols;
  const th = H / rows;
  const out = ms.map((f, i) =>
    tile(ctx, f, i, ms.length > 1, [(i % cols) * tw, Math.floor(i / cols) * th, tw, th]),
  );
  if (ms.length === 1 && !out[0]!.head)
    return {
      marks: "",
      hits: "",
      labels: el(
        "text",
        { "data-maya": "empty", x: r(W / 2), y: r(H / 2), "text-anchor": "middle" },
        esc(ctx.t("noData")),
      ),
    };
  const all = (k: "spark" | "head" | "labels" | "grid" | "hits") => out.map((o) => o[k]).join("");
  return {
    marks: all("spark") + all("head"),
    hits: all("hits"),
    labels: all("labels"),
    grid: all("grid"),
  };
}

export const kpi: Mark = { noun: "KPI", draw };
