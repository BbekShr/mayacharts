/*
 * Public signatures take `ChartSpec<R> | ChartSpec`: R is inferred from `data` so typed rows
 * get field autocomplete, while spreading a Row-typed spec with new rows still compiles.
 *
 * mayaCharts core — design note (the contract every module and the element layer follow)
 * =====================================================================================
 *
 * Pipeline: validateSpec -> resolve(spec, view) -> shape -> niceTicks -> format -> layout
 *           -> scales -> Mark.draw(ctx) -> assemble. Pure, synchronous, deterministic (same
 *           input, same bytes). `src/core/**` never imports `src/element/**` and never
 *           touches window/document (a test deletes globalThis.window and imports it).
 *
 * State: interaction state is not in the spec. RenderOptions.view = { measure, drill, window,
 *   hidden } and RenderOptions.selected = Sel[] (raw values). resolve() applies measure
 *   (active y, measures[] kept for the control) and drill (filter rows, advance x/path).
 *   shape() applies, in order: aggregate -> time order -> sort -> limit -> window -> reduce ->
 *   hidden. SSR can therefore render any state.
 *
 * Time axis: line, area and vertical bar (not waterfall) whose categories are all ISO 8601
 *   dates, unsorted and unlimited (spec.xType "auto"), or any x under xType "time" (epoch ms
 *   numbers allowed; null x rows dropped), get Shaped.time (UTC ms per category) and the
 *   categories sorted by time. Axis { kind: "time" } -> timeScale: band centres sit at their
 *   time, bandwidth is 0.8 of the smallest gap (at most 72 px); marks read cat.at(i) as ever.
 *   When every time is a UTC month start (so quarter and year starts too), centres follow the
 *   calendar month index instead of ms: even spacing, a missing month leaves one empty slot.
 *   Epoch ms beyond +-8.64e15 are invalid-date. Ticks are calendar-aligned (timeTicks), about
 *   plot.w / 80 of them (min 2); a year, quarter or month boundary less than half an interval
 *   outside the data is kept and clamped to the first or last centre (so "Jan 2025" labels the
 *   origin of data starting Jan 1 00:18). If the pixel gap would still drop a label the count
 *   falls by one until none does, so ticks stay evenly spaced. Sub-day ticks at UTC midnight and
 *   the first tick show the date. No vertical grid. Line and area paths break where the gap to
 *   the previous non-null point exceeds 5x the series' median gap (fixed factor). The svg
 *   carries data-t (empty) beside data-n; line hit rects and bar marks (y2 points too) carry
 *   data-i, the category's index in the time-ordered list before window and reduction (the
 *   index space of view.window). Without spec.format for x, labels use a preset from
 *   the smallest gap (year, month, date, datetime); tick labels use per-unit defaults.
 *   Downsampling: line and area on a time axis with more categories than min(MAX_POINTS,
 *   floor(plot width / 2), 4000 / series) (one point per 2 px: a narrower band cannot be
 *   hovered; the plot width is estimated as width - 56, shape runs before layout) run
 *   largest-triangle-three-buckets per series (keeping first, last, min, max
 *   and one marker per gap), after the window; a union still over the target is thinned to
 *   first, last and evenly spaced indexes. Kept categories keep their keys; Shaped.reduced
 *   = [kept, before], and the description says so. view.window indexes the time-ordered list
 *   before reduction. Scatter is exempt from the pre-draw mark cap (it bins its own rows).
 *   Scatter's Shaped has empty categories and cells: its marks draw from rows.
 *   Thinning in the mark (kpi, ridgeline; shape.thin): above one hover target per 4 px (kpi
 *   sparkline) or 6 px (ridgeline plot width) the mark draws only the kept categories: first,
 *   last, each bucket's lowest and highest value per series and every gap edge, at most the
 *   target. Points, dots and keyless band hits exist for kept categories only (a hit spans to
 *   the midpoints of its neighbours); the kpi headline, delta and the data table use all rows.
 *   Both skip the pre-draw category cap (only the post-draw mark count applies). Beeswarm and
 *   parallel draw one mark per row (parallel: one per row and measure), so they keep the
 *   5000-mark error; a reduction would be a different chart (bin with scatter, or limit).
 *
 * Marks: `CORE[type] ?? MODULES.get(type)`. CORE is the static map below; modules
 *   (hierarchy, flow, geo) call registry.register() on import. A Mark is
 *   { noun, axes?(spec, shaped): [bottom, left], check?(spec, fail), draw(ctx) }.
 *   draw() may return `note`, one sentence appended to the auto description.
 *   MarkCtx closures: fmt(field, v, step?), label(x, y, text, place, rotate?), tone(v), agg(kind),
 *   fail(code, path, headline, ...details), t(key, ...args); plus spec, shaped, width,
 *   height, plot, x (bottom-axis scale), y (left-axis scale). Modules import only
 *   registry.ts, svg.ts, scale.ts, ticks.ts and types.
 *
 * Outputs
 *   render(spec, opts)      standalone `<svg class="maya-root">` with an embedded <style>.
 *                           Works as a file, in <img>, or rasterized by the hosted API.
 *   renderShell(spec, opts) `<maya-chart>` with Declarative Shadow DOM + JSON spec child.
 *                           The JSON child is the spec with rows projected to referenced
 *                           fields only (x y series size name path colorBy, format and
 *                           titles keys). `opts.nonce` lands on the shell's <style>.
 *   renderParts(spec, opts) the pieces (svg without <style>, legend, controls, crumbs, table,
 *                           title, override style + vars, warnings).
 *   The element renders in a microtask after a property set, and in the next frame after a
 *   resize or while it waits for its JSON spec child.
 *
 * Shadow content (identical from renderShell and the element, built by `shellInner`).
 * Slot order is fixed:
 *   <style>CSS</style>
 *   <div class="maya" style="OVERRIDES">
 *     TITLE  CONTROLS  LEGEND  CRUMBS
 *     <div class="maya-box">SVG</div>
 *     TABLE
 *     <div class="maya-sr" data-maya="live" aria-live="polite"></div>  static, never replaced
 *     <div class="maya-probe" data-maya="probe"></div>
 *     <div class="maya-tip" popover="manual" role="tooltip"></div>
 *   </div>
 *
 * SVG structure (render/renderParts):
 *   <svg class="maya-svg" viewBox="0 0 W H" width="W" height="H" role="img"
 *        aria-labelledby="maya-t" aria-describedby="maya-d" [tabindex="0" in parts only]
 *        data-plot="x y w h" data-n="categories" [data-xd="lo hi" data-yd="lo hi" for
 *        linear-x types instead of data-n] [data-dir="h" when horizontal]
 *        [data-drill when a click can drill one level further]>
 *     <title id="maya-t">  <desc id="maya-d">
 *     <g data-maya="grid">     lines perpendicular to the value axis
 *     <g data-maya="axis-y">   tick labels (text-anchor end), axis title when titles has it
 *     <g data-maya="axis-x">   category labels (thinned to fit), axis title
 *     <g data-maya="marks">    only [data-key] children, one tag per key
 *     <g data-maya="labels">   value labels (text), from ctx.label
 *     <g data-maya="cross">    crosshair (line/area), moved via CSSOM transform
 *     <g data-maya="hits">     invisible enlarged targets (see below)
 *   Empty data: grid/axes/groups omitted, `<text data-maya="empty">` (text.noData) centered.
 *   Marks group attributes are synced on patch.
 *
 * Hydration contract — the ONLY selectors the element layer may rely on:
 *   [data-maya="mark"]  attrs: data-key, data-c (category index; unique per mark for non-band
 *                       types), data-s (palette slot = series index % 8), data-x (formatted
 *                       category), data-y (raw value), data-series (series key, "" when
 *                       none), data-f (formatted value). data-neg when value < 0.
 *                       Optional: data-tone="good|bad", data-q (ramp step), data-other
 *                       (limit roll-up), data-depth, data-selected.
 *                       bar + y2: one `path[data-maya=line]` plus a point circle mark per
 *                       non-null category, data-s = series count % 8, data-series = the
 *                       y2 title; hits are 24px squares round each point.
 *                       Line: point circles are marks (hidden until active) plus one
 *                       keyless full-height band hit per category, each band running to the
 *                       midpoints with its neighbours (svg.ts bands()).
 *                       Radial: data-c is the category (a stack lights together); the
 *                       centre total is a text mark keyed `t` with no data-c (counts up).
 *                       Scatter: data-gx/data-gy (formatted x, y) fill the hover guides in
 *                       the cross group; only written when the point has a name or size,
 *                       otherwise data-x and data-f already are the formatted x and y.
 *                       Scatter writes no data-series when there is no series. Sankey/chord: data-n (node index), data-a (node
 *                       indices whose hover lights this link or node), data-neu (neutral
 *                       outer-level step, no data-s).
 *   [data-maya="hit"]   same payload as its mark (incl. data-key). Emitted only when the
 *                       mark is narrower or shorter than 24px: the mark's rect grown to
 *                       >= 24px in that dimension, centered. fill="transparent".
 *                       Scatter and beeswarm emit none: the tooltip and select pick the nearest
 *                       mark centre within 12px of the pointer. Parallel's hit paths share
 *                       their stroke through a wrapping <g> in the hits group.
 *                       Beeswarm writes no data-series when there is no series.
 *   [data-maya="probe"] / .maya-tip  tooltip anchor probe + popover (shell only).
 *   [data-maya="live"]  the static polite live region; written via textContent only.
 *   [data-maya="legend"] buttons: <button type="button" data-si="i" data-s="i%8"
 *                       data-key="KEY" aria-pressed="true|false"><i></i>KEY</button>
 *                       With y2 the legend also holds non-button <span data-s data-line>
 *                       entries (the line; the bar measure too when there is no series).
 *                       Ramp/tone legends are non-button <div data-maya="ramp|tone">.
 *   The tooltip reads its content from these attributes; the element never sees rows.
 *
 * Key grammar (svg.ts key(...parts)): each part encodeURIComponent'ed with `~` -> %7E,
 *   joined by `~`. Band `S~C`; line/area `l~S`/`a~S`; scatter `S~name(#n)` or index;
 *   bar y2 line `l~\u0000y2`, its points `\u0000y2~C` (NUL cannot be a series key prefix);
 *   hierarchy `h~p0~p1…`; sankey node `n~depth~name`, link `k~depth~src~dst` (depth in the whole path, so a drill keeps them); hexmap
 *   `g~CODE`; limit roll-up category is the sentinel OTHER ("\u0000other").
 *   The element diffs marks by data-key (and tagName), never by index.
 *
 * CSS hooks theme.ts styles (interaction modules never touch theme.ts):
 *   .maya-ctl [role=radio][aria-checked]  .maya-crumbs  .maya-reset  .maya-err
 *   [data-maya=brush]  [data-maya=cross] (scatter: guide lines + text pills, --x/--y)
 *   [data-maya=link]  [data-depth]  [data-selected]
 *   svg[data-drill]  [data-tone]  [data-q]  [data-other]  [data-dir=h]  [data-maya=line|area] (path marks)
 *   .maya-ctl carries data-n (option count, 2..4) and data-i (checked index) for the sliding
 *   indicator; line point circles are hidden until active under `svg[data-n]`.
 *
 * Keyboard (one keydown dispatcher in maya-chart.ts; handlers return "handled"):
 *   Escape priority: pinned tooltip -> brush in progress -> selection -> zoom window -> drill
 *   pop. Enter activates drill, else select, on the tooltip's active mark; Space pins.
 *
 * Colors: never inline. CSS rules `[data-s="0"]..[data-s="7"]` map to --maya-series-1..8;
 *   --maya-series-1 defaults to var(--maya-accent) so single-series charts use the
 *   accent. spec.colors / spec.theme become custom properties in `Parts.vars` (applied
 *   with style.setProperty by the element) and `Parts.style` (style attribute in render()
 *   and renderShell() output only). Every value passes the CSS allowlist in validate.ts.
 *
 * Animation contract (element/animate.ts): marks get
 *   `transform-box: fill-box; transform-origin: 0 0` from CSS. The element commits new
 *   geometry attributes immediately and animates transform/opacity, plus three exceptions:
 *     update: from translate(oldX-newX, oldY-newY) scale(oldW/newW, oldH/newH) to none,
 *             delayed by data-c (stagger, at most 320 ms across all categories)
 *     enter:  positive bar from translate(0, h) scale(1, 0); negative from scale(1, 0);
 *             circles pop from their centre; other paths scale from 0.6 about their own
 *             centre; plus opacity 0 -> 1
 *     exit:   reverse of enter, then remove on finish. Leaving nodes lose data-key and get
 *             data-ghost (styled, not hit-testable) until removed.
 *     paths:  a path whose `d` changed morphs through CSS `d` when the browser interpolates
 *             it and the command letters are unchanged (exception 1); else the old outline
 *             crossfades out over the new one.
 *     text:   a text mark whose number changed counts to it with rAF, replacing digits in
 *             place so the formatter's separators survive (exception 2).
 *     drill:  rect marks zoom (transform/opacity): in, the branch's marks map onto the plot,
 *             children start inside the branch's box, the rest is pushed out; out reverses
 *             it. The marks group is clipped to the plot meanwhile. Flows morph instead.
 *     rings:  sunburst slices are `circle[pathLength=360]` whose stroke dash is the arc; they
 *             tween the CSS properties r, stroke-width, stroke-dasharray and
 *             stroke-dashoffset, which sweeps in angle space (exception 3). On a drill the
 *             centre disk carries the drilled branch's key, so the clicked slice grows into
 *             it; slices outside that branch fold to its nearer edge, entering ones unfold.
 *     first draw (no server-rendered svg): grid and axes fade in; marks enter by kind:
 *             "wipe" (clip-path inset on the marks group: line, area, sankey, ridgeline,
 *             parallel), "bloom" (rotate + scale of the marks group about the plot centre:
 *             sunburst, chord, radial) or per mark (everything else); labels fade in last.
 *   Guard zero sizes (use 1e-6). Skip entirely under prefers-reduced-motion or
 *   spec.animate === false.
 *
 * Hover (element/tooltip.ts): the active mark gets data-active and the marks of its
 *   category (its tooltip rows, plus hierarchy ancestors) data-lit; CSS dims the rest.
 *   Bar types get an element-owned `<rect data-maya="band">` before the marks group,
 *   moved with a CSSOM transform; it and the crosshair glide once they carry data-on.
 *   Charts with a crosshair anchor the tooltip beside it (data-side on .maya-tip).
 *   The tooltip glides between marks (FLIP on its own box, transform only).
 *
 * Fills: non-stacked area and kpi carry `<defs>` in the grid group with one
 *   linearGradient per visible slot (`maya-a0`..`maya-a7`, data-s for its colour). The svg
 *   carries data-stack when stacked (separated bar segments, opaque stacked areas).
 *
 * Layout (layout.ts frame()): no text measurement exists in Node, so axis label widths are
 *   estimated as 0.6 em per code point (1 em for East-Asian-wide) * 12 + 8, value labels
 *   (ctx.label) as chars * 7.2 + 4. Only a mark that fits its own label may rotate it (sunburst,
 *   along the radius); axis labels are never rotated. Band axes draw every nth label
 *   (bottom: by width, left: 14 px per step); left band labels are cut at 40% of the width.
 *   Coordinates are rounded to 2 decimals (`r()` in svg.ts).
 *
 * Legend and title are HTML, not SVG (free wrapping and font metrics). render() — the
 * bare SVG — therefore has no legend; renderShell() is the full-fidelity output.
 */
import { dataTable, describe, titleText } from "./a11y.ts";
import { formatter } from "./format.ts";
import { frame } from "./layout.ts";
import { bar } from "./marks/bar.ts";
import { beeswarm } from "./marks/beeswarm.ts";
import { dumbbell } from "./marks/dumbbell.ts";
import { heatmap } from "./marks/heatmap.ts";
import { kpi } from "./marks/kpi.ts";
import { parallel } from "./marks/parallel.ts";
import { ridgeline } from "./marks/ridgeline.ts";
import { area, line } from "./marks/line.ts";
import { scatter } from "./marks/scatter.ts";
import { table } from "./marks/table.ts";
import { MODULES } from "./registry.ts";
import { agg, shape } from "./shape.ts";
import { t } from "./strings.ts";
import { css } from "../styles/theme.ts";
import { el, esc, OTHER, r } from "./svg.ts";
import { ALL_Y, fail, MAX_MARKS, resolve, validateOptions, validateSpec } from "./validate.ts";
import type {
  Aggregate,
  ChartSpec,
  LabelPlace,
  Mark,
  MarkCtx,
  Parts,
  RenderOptions,
  Row,
} from "./types.ts";

const CORE: Readonly<Record<string, Mark>> = {
  bar,
  waterfall: bar,
  line,
  area,
  scatter,
  heatmap,
  kpi,
  dumbbell,
  ridgeline,
  beeswarm,
  parallel,
  table,
};

const kebab = (s: string) => s.replace(/[A-Z]|\d+/g, (c) => "-" + c.toLowerCase());

function build(spec: ChartSpec, opts: RenderOptions | undefined, sheet: string | null): Parts {
  validateSpec(spec);
  if (opts !== undefined) validateOptions(opts);
  // validateSpec guarantees the type is core or registered.
  const mark = (Object.hasOwn(CORE, spec.type) ? CORE[spec.type] : MODULES.get(spec.type))!;
  const s0 = resolve(spec, opts?.view);
  const W = opts?.width ?? 640;
  const H = opts?.height ?? 320;
  // ponytail: plot width is only known after shape (tick labels set the margins); W - 56 is the
  // usual plot of a 4-digit y axis, and the point budget needs no more than that.
  const shaped = shape(s0, { ...opts?.view, plotWidth: W - 56 });
  // Time axis without a format for x: the preset follows the smallest gap between categories.
  let s = s0;
  if (shaped.time && !s0.format.has(s0.x)) {
    let gap = Infinity;
    shaped.time.forEach((v, i, a) => i && v > a[i - 1]! && (gap = Math.min(gap, v - a[i - 1]!)));
    const day = 864e5;
    const preset =
      gap >= 365 * day ? "year" : gap >= 28 * day ? "month" : gap >= day ? "date" : "datetime";
    s = { ...s0, format: new Map(s0.format).set(s0.x, preset) };
  }
  const cap = (n: number) =>
    n > MAX_MARKS &&
    fail(
      "too-many-marks",
      "data",
      `${n} marks exceed the limit of ${MAX_MARKS}.`,
      "Use spec.limit to keep the top N categories, or aggregate the rows first.",
    );
  // Scatter draws from rows and bins past MAX_MARKS; kpi and ridgeline thin their own points.
  if (!["scatter", "kpi", "ridgeline"].includes(s.type)) cap(shaped.cells.length);

  // Formatters are cached per (field, step): marks call fmt once per value.
  const fmts = new Map<string, (v: unknown) => string>();
  // Time categories are strings: format them from their parsed ms (a bare date-time is UTC).
  const ms = new Map(shaped.time?.map((v, i) => [shaped.categories[i]!, v]));
  const fmt = (field: string, v: unknown, step?: number) => {
    if (v === OTHER) return t(s, "other");
    if (field === s.x && typeof v === "string") v = ms.get(v) ?? v;
    const k = field + "\0" + step;
    let f = fmts.get(k);
    if (!f) fmts.set(k, (f = formatter(s, field, step)));
    return f(v);
  };

  // colorBy: sign/target give tone; a numeric field gives a 0..9 bucket over its extent.
  const cb = s.colorBy;
  let lo = Infinity;
  let hi = -Infinity;
  if (typeof cb === "string" && cb !== "sign")
    for (const row of s.data) {
      const v = row[cb];
      if (typeof v === "number") ((lo = Math.min(lo, v)), (hi = Math.max(hi, v)));
    }
  const tone = (v: number): "good" | "bad" | null =>
    cb === "sign"
      ? v < 0
        ? "bad"
        : "good"
      : cb && typeof cb === "object"
        ? v >= cb.target
          ? "good"
          : "bad"
        : null;
  const toneWord = (n: "good" | "bad") =>
    t(s, cb === "sign" ? (n === "good" ? "positive" : "negative") : n === "good" ? "above" : "below");
  const toneText = (v: number) => {
    const n = tone(v);
    return n && toneWord(n);
  };

  // Value labels: estimated boxes, a later label that overlaps a placed one (or leaves the svg) is dropped.
  const boxes: number[][] = [];
  let labels = "";
  const label = (x: number, y: number, text: string, place: LabelPlace, rotate?: number) => {
    // Rotated labels skip the overlap scan: the mark has already fitted them inside itself.
    if (rotate !== undefined) {
      labels += el(
        "text",
        {
          x: r(x),
          y: r(y),
          transform: `rotate(${r(rotate)} ${r(x)} ${r(y)})`,
          "text-anchor": "middle",
          "dominant-baseline": "middle",
          "data-in": true,
        },
        esc(text),
      );
      return true;
    }
    const w = text.length * 7.2 + 4;
    const l = place === "start" ? x : place === "end" ? x - w : x - w / 2;
    const tp = place === "above" ? y - 16 : place === "below" ? y + 2 : y - 7;
    // ponytail: O(n^2) overlap scan; MAX_MARKS bounds it.
    if (
      l < 0 ||
      tp < 0 ||
      l + w > W ||
      tp + 14 > H ||
      boxes.some((b) => l < b[2]! && l + w > b[0]! && tp < b[3]! && tp + 14 > b[1]!)
    )
      return false;
    boxes.push([l, tp, l + w, tp + 14]);
    labels += el(
      "text",
      {
        x: r(x),
        y: r(place === "above" ? y - 4 : place === "below" ? y + 13 : y),
        "text-anchor": place === "start" || place === "end" ? place : "middle",
        "dominant-baseline": place === "above" || place === "below" ? null : "middle",
        "data-in": place === "center", // sits on a mark: no halo
      },
      esc(text),
    );
    return true;
  };

  const f = mark.axes ? frame(s0, mark.axes(s, shaped), { width: W, height: H }, fmt) : null;
  const plot = f?.plot ?? { x: 0, y: 0, w: W, h: H };
  const ctx: MarkCtx = {
    spec: s,
    shaped,
    width: W,
    height: H,
    plot,
    x: f?.x ?? null,
    y: f?.y ?? null,
    y2: f?.y2 ?? null,
    fmt,
    label,
    tone,
    // Ramp bucket 0..9 over the colorBy field's extent (ctx.q; types.ts MarkCtx has no slot yet).
    q: (v) => (hi > lo ? Math.min(9, Math.max(0, Math.floor(((v - lo) / (hi - lo)) * 10))) : 9),
    agg: (kind: Aggregate) => (vs) => {
      const a = agg(kind);
      for (const v of vs) if (typeof v === "number") a.add(v);
      return a.value();
    },
    fail,
    t: (k, ...a) => t(s, k, ...a),
  };
  mark.check?.(spec, fail);

  let markLegend: string | null = null;
  let note = "";
  let body = "";
  if (s.data.length === 0) {
    body = el(
      "text",
      {
        "data-maya": "empty",
        x: W / 2,
        y: H / 2,
        "text-anchor": "middle",
        "dominant-baseline": "middle",
      },
      esc(t(s, "noData")),
    );
  } else {
    const g = (name: string, c: string) => el("g", { "data-maya": name }, c);
    const m = mark.draw(ctx);
    cap(m.marks.split(' data-maya="mark"').length - 1); // scatter and modules draw per row/node
    markLegend = m.legend ?? null;
    note = m.note ?? "";
    // Area fills fade toward the baseline: one gradient per visible slot, kept in the grid group
    // (the marks group holds keyed marks only). ponytail: fixed ids, see NON-FEATURES.
    const fades =
      (s.type === "area" && !s.stack) || s.type === "kpi"
        ? el(
            "defs",
            {},
            [...new Set(shaped.visible.map((i) => i % 8))]
              .map((n) =>
                el(
                  "linearGradient",
                  { id: `maya-a${n}`, "data-s": n, x1: 0, y1: 0, x2: 0, y2: 1 },
                  `<stop offset="0" stop-opacity=".34"/><stop offset="1" stop-opacity=".02"/>`,
                ),
              )
              .join(""),
          )
        : "";
    body =
      g("grid", fades + (m.grid ?? f?.grid ?? "")) +
      g("axis-y", f?.ay ?? "") +
      g("axis-x", f?.ax ?? "") +
      g("marks", m.marks) +
      g("labels", (m.labels ?? "") + labels) +
      g("cross", m.cross ?? "") +
      g("hits", m.hits);
  }

  const vars: [string, string][] = [];
  if (Array.isArray(s.colors))
    (s.colors as readonly string[]).forEach((c, i) => vars.push([`--maya-series-${i + 1}`, c]));
  else if (s.colors)
    // ponytail: slot = the series' first-appearance index, so reordered rows move colours.
    // Waffle slots follow categories (data-s = category index), so its keys map against those.
    for (const [k, c] of s.colors as ReadonlyMap<string, string>) {
      const j = (s.type === "waffle" ? shaped.categories : shaped.series).indexOf(k);
      if (j >= 0) vars.push([`--maya-series-${(j % 8) + 1}`, c]);
    }
  for (const k in s.theme) vars.push([`--maya-${kebab(k)}`, s.theme[k as keyof typeof s.theme]!]);
  const style = vars.map(([k, v]) => `${k}:${v};`).join("");

  const svg = el(
    "svg",
    {
      class: sheet === null ? "maya-svg" : "maya-root maya-svg",
      viewBox: `0 0 ${W} ${H}`,
      width: W,
      height: H,
      // A table has focusable sort headers, which an img role would hide (children presentational).
      role: s.type === "table" ? "figure" : "img",
      // Standalone SVGs may share a page, so they can't use fixed ids; shadow roots scope them.
      "aria-label": sheet === null ? null : titleText(s),
      "aria-labelledby": sheet === null ? "maya-t" : null,
      "aria-describedby": sheet === null ? "maya-d" : null,
      tabindex: sheet === null ? "0" : null,
      style: sheet === null ? null : style || null,
      "data-plot": `${r(plot.x)} ${r(plot.y)} ${r(plot.w)} ${r(plot.h)}`,
      ...f?.attrs,
      "data-dir": s.horizontal ? "h" : null,
      "data-stack": s.stack || null,
      // A click can drill further (pointer cursor on marks).
      "data-drill":
        (s.drill && s.path.length > (s.type === "sankey" || s.type === "chord" ? 2 : 1)) || null,
    },
    (sheet ? `<style>${sheet}</style>` : "") +
      el("title", { id: sheet === null ? "maya-t" : null }, esc(titleText(s))) +
      el(
        "desc",
        { id: sheet === null ? "maya-d" : null },
        esc(
          describe(s, shaped, fmt, mark.noun) + (note && s.description === null ? " " + note : ""),
        ),
      ) +
      body,
  );

  let legend = "";
  if (markLegend !== null && spec.legend !== false) legend = markLegend;
  else if ((s.series !== null || s.y2 !== null) && s.legend)
    legend =
      `<div class="maya-legend" data-maya="legend">` +
      (s.series === null && s.y2 !== null
        ? `<span data-s="0"><i></i>${esc(s.titles.get(s.y) ?? s.y)}</span>`
        : "") +
      (s.series === null ? [] : shaped.series)
        .map((k, i) =>
          el(
            "button",
            {
              type: "button",
              "data-si": i,
              "data-s": i % 8,
              "data-key": k,
              "aria-pressed": String(shaped.visible.includes(i)),
            },
            `<i></i>${esc(k)}`,
          ),
        )
        .join("") +
      (s.y2 === null
        ? ""
        : `<span data-s="${shaped.series.length % 8}" data-line><i></i>${esc(s.titles.get(s.y2) ?? s.y2)}</span>`) +
      `</div>`;
  else if (spec.legend !== false && cb !== null && s.series === null && s.type !== "kpi")
    legend =
      cb === "sign" || typeof cb === "object"
        ? `<div class="maya-legend" data-maya="tone">` +
          (["good", "bad"] as const)
            .map(
              (n) =>
                `<span data-tone="${n}"><i></i>${esc(toneWord(n))}</span>`,
            )
            .join("") +
          `</div>`
        : hi > lo
          ? `<div class="maya-legend" data-maya="ramp"><b>${esc(s.titles.get(cb) ?? cb)}</b><span>${esc(fmt(cb, lo))}</span><i></i><span>${esc(fmt(cb, hi))}</span></div>`
          : "";
  return {
    svg,
    legend,
    controls:
      s.measures.length > 1 && !ALL_Y.includes(s.type)
        ? `<div class="maya-ctl" role="radiogroup" aria-label="${esc(t(s, "measures"))}" data-n="${s.measures.length}" data-i="${s.measure}">` +
          s.measures
            .map(
              (m, i) =>
                `<button type="button" role="radio" aria-checked="${i === s.measure}" data-i="${i}" tabindex="${i === s.measure ? 0 : -1}">${esc(s.titles.get(m) ?? m)}</button>`,
            )
            .join("") +
          `</div>`
        : "",
    crumbs:
      s.drilled.length > 0
        ? `<nav class="maya-crumbs" aria-label="${esc(t(s, "crumbs"))}"><button type="button" data-depth="0">${esc(t(s, "back"))}</button>` +
          s.drilled
            .map(
              (v, i) =>
                `<span aria-hidden="true">›</span><button type="button" data-depth="${i + 1}"${i === s.drilled.length - 1 ? ' aria-current="page"' : ""}>${esc(String(v))}</button>`,
            )
            .join("") +
          `</nav>`
        : s.drill
          ? `<div class="maya-crumbs" aria-hidden="true"></div>` // holds the row: no shift on drill
          : "",
    table: s.table ? dataTable(s, shaped, fmt, toneText) : "",
    title: s.title === null ? "" : `<div class="maya-title">${esc(s.title)}</div>`,
    style,
    vars,
    warnings: [],
  };
}

export function renderParts<R extends object = Row>(
  spec: ChartSpec<R> | ChartSpec,
  opts?: RenderOptions,
): Parts {
  return build(spec as unknown as ChartSpec, opts, null);
}

/** Standalone SVG string with an embedded stylesheet. */
export function render<R extends object = Row>(
  spec: ChartSpec<R> | ChartSpec,
  opts?: RenderOptions,
): string {
  return build(spec as unknown as ChartSpec, opts, css).svg;
}

/** Inner shadow-root markup, shared by renderShell and the element. Fixed slot order. */
export function shellInner(parts: Parts, css: string, nonce?: string): string {
  const st = parts.style ? ` style="${esc(parts.style)}"` : "";
  const n = nonce ? ` nonce="${esc(nonce)}"` : "";
  return (
    `${css ? `<style${n}>${css}</style>` : ""}<div class="maya"${st}>${parts.title}${parts.controls}${parts.legend}${parts.crumbs}` +
    `<div class="maya-box">${parts.svg}</div>${parts.table}` +
    `<div class="maya-sr" data-maya="live" aria-live="polite"></div>` +
    `<div class="maya-probe" data-maya="probe"></div><div class="maya-tip" popover="manual" role="tooltip"></div></div>`
  );
}

/** Rows cut to the fields the spec references (no data leakage into SSR HTML). */
function project(spec: ChartSpec): ChartSpec {
  const keep = (o: object | string | undefined) => (typeof o === "object" ? Object.keys(o) : []);
  const fields = new Set<unknown>([
    spec.x,
    ...(typeof spec.y === "string" ? [spec.y] : spec.y),
    spec.series,
    spec.y2,
    spec.size,
    spec.name,
    ...(spec.path ?? []),
    typeof spec.colorBy === "string" ? spec.colorBy : undefined,
    ...keep(spec.format),
    ...keep(spec.titles),
  ]);
  return {
    ...spec,
    data: spec.data.map((row) =>
      Object.fromEntries(Object.entries(row).filter(([k]) => fields.has(k))),
    ),
  };
}

/** `<maya-chart>` with Declarative Shadow DOM. JSON child escapes `<` as <. */
export function renderShell<R extends object = Row>(
  spec: ChartSpec<R> | ChartSpec,
  opts?: RenderOptions,
): string {
  const p = renderParts(spec, opts);
  const json = JSON.stringify(project(spec as unknown as ChartSpec)).replace(/</g, "\\u003c");
  return `<maya-chart><template shadowrootmode="open">${shellInner(p, css, opts?.nonce)}</template><script type="application/json">${json}</script></maya-chart>`;
}
