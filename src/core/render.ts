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
 *   hidden, sortBy, frame, form } and RenderOptions.selected = Sel[] (raw values). view.form
 *   indexes the units spec.forms (ResolvedSpec.forms/form, clamped); for units without colorBy
 *   resolve() also makes x the series, so the legend and view.hidden toggle groups. It applies
 *   measure (active y, measures[] kept for the control), frame (keep the rows of one distinct
 *   spec.frame value, data order; view.frame indexes them, default and clamp: the last) and
 *   drill (filter rows, advance x/path). shape() applies, in order: aggregate -> time order ->
 *   sort -> limit -> window -> reduce -> hidden. SSR can therefore render any state.
 *
 * Frames (spec.frame): the title becomes text.frameOf(title or auto title, fmt(frame field,
 *   value)), so the svg <title> and the visible title name the frame; the auto description
 *   adds text.frame(n, count). Every linear axis spans all frames (each frame is resolved and
 *   shaped, mark.axes() unioned) so axes hold still; a yDomain/xDomain still wins. A scatter
 *   size scale uses the largest |size| over every frame (ctx.sizeMax), so one size is one radius
 *   in all frames and the size key holds still. Keys do not
 *   include the frame, so a frame change is an ordinary keyed update (bars race, points move).
 *   The element owns playback: it steps view.frame on a timer.
 *
 * Percent stacks (stack: "percent"): shape() divides each cell's value and its running
 *   y0/y1 by the category's visible sum of magnitudes, so values are shares (axis 0..1, an
 *   all-positive stack tops out at exactly 1) and everything downstream (labels, data-f,
 *   data-y, table, rules) is in share units. resolve() formats each measure "percent" unless
 *   spec.format sets it. "mean" rules average the segment shares. The svg carries
 *   data-stack="percent".
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
 *   carries data-t (empty) beside data-n; line and area points and bar marks (y2 points too)
 *   carry data-i, the category's index in the time-ordered list before window and reduction
 *   (the index space of view.window). Without spec.format for x, labels use a preset from
 *   the smallest gap (year, month, date, datetime); tick labels use per-unit defaults.
 *   Downsampling: line and area on a time axis with more categories than min(MAX_POINTS,
 *   floor(plot width / 2), 4000 / series) (one point per 2 px: a narrower band cannot be
 *   hovered; the plot width is estimated as width - 56, shape runs before layout) run
 *   largest-triangle-three-buckets per series (keeping first, last, min, max
 *   and one marker per gap), after the window; a union still over the target is thinned to
 *   first, last and evenly spaced indexes. Kept categories keep their keys; Shaped.reduced
 *   = [kept, before], and the description says so. view.window indexes the time-ordered list
 *   before reduction. A line or area on a category axis thins the same way, but only past
 *   MAX_POINTS categories; its kept categories carry their position in the full list in
 *   Shaped.index (data-i). A kpi with more than MAX_POINTS categories is thinned in shape to
 *   floor((plot width + 32) / 4) - 2 points plus its last two live values (kpi.ts reads the
 *   kept categories' x from Shaped.index and the full count from Shaped.reduced). Auto roll-up: a bar (not a waterfall) with
 *   categories x series above MAX_MARKS and no spec.limit keeps the top N by total, N =
 *   10 * floor(plot width / 40) (at most MAX_MARKS / series - 1), and sums the rest into Other
 *   (Shaped.capped = [N, before]; a time axis never rolls up); a warning says so. Every other
 *   chart that still has more than MAX_MARKS marks throws too-many-marks, naming the count,
 *   the cap and the row count. A table is exempt (it draws the rows that fit the height).
 *   Row-pass cache (svg.ts memo): shape's grouping and aggregation, the time parse, the sorted
 *   and limited category list, a reduction, validate's row scan, scatter's typed columns and the
 *   table's groups are computed once per (data array identity, the fields they read, array
 *   length) and kept in a WeakMap while the array lives, 256 keys per array, least recently
 *   used out (a page of charts shares one array). The modules use the same memo: hierarchy
 *   (treemap, sunburst) its tree, flow (sankey, chord) its graph, stats (boxplot) and beeswarm
 *   their scans. A resize, legend toggle, zoom or view change re-renders without another pass
 *   over the rows; hidden, window and plot width apply after the cache. A changed length,
 *   first row or last row also drops the entries (shift/push ring buffers and a replaced last
 *   row heal); a host that edits a middle row in place must pass a new array. Cached results
 *   are shared: never mutate them.
 *   Scatter is exempt from the pre-draw mark cap (it bins its own rows).
 *   Scatter's and units' Shaped has empty categories and cells: their marks draw from rows.
 *   Thinning in the mark (kpi, ridgeline; shape.thin): above one hover target per 4 px (kpi
 *   sparkline) or 6 px (ridgeline plot width) the mark draws only the kept categories, picked
 *   as on a time axis (shape.thin calls reduceTime): first, last, largest-triangle-three-buckets
 *   per run, each series' minimum and maximum and every gap edge, at most the target. Points and dots exist for kept categories only; the kpi headline, delta and the data table use all rows.
 *   Both skip the pre-draw category cap (only the post-draw mark count applies). Beeswarm and
 *   parallel draw one mark per row (parallel: one per row and measure), so they keep the
 *   10000-mark error; a reduction would be a different chart (bin with scatter, or limit).
 *
 * Marks: `CORE[type] ?? MODULES.get(type)`. CORE is the static map below; modules
 *   (hierarchy, flow, geo, radial, stats, weave, units, orbit, constellation) call
 *   registry.register() on import; each module file's header comment is its mark's contract. A Mark is
 *   { noun, axes?(spec, shaped): [bottom, left], check?(spec, fail), draw(ctx) }.
 *   draw() may return `note`, one sentence appended to the auto description, and `table`,
 *   { head, rows } of plain strings that replaces the hidden data table (boxplot five numbers,
 *   funnel steps; first cell of a row is its header; a11y.ts escapes and caps it). Boxplot
 *   reads raw rows from spec.data (shaped gives categories and series; its cells are sums the
 *   mark ignores) and its description counts rows. Funnel with a `y` array and no `x` (wide
 *   form): shape makes one category per measure (label = field name, value = the measure's
 *   rows combined by aggregate, one series ""), and the y array is never a measure toggle.
 *   MarkCtx closures: fmt(field, v, step?), label(x, y, text, place, rotate?), tone(v), agg(kind),
 *   fail(code, path, headline, ...details), t(key, ...args); plus spec, shaped, width,
 *   height, plot, x (bottom-axis scale), y (left-axis scale). Modules import only
 *   registry.ts, svg.ts, scale.ts, ticks.ts and types.
 *
 * Memory (spec.was, bar): the was field aggregated per (category, series) like colorBy. Each bar
 *   with a was value gets a ghost `<rect data-past>` in the marks group after every bar (so
 *   on top: a fall reads past the bar end, a rise as a dashed box inside it), keyed `\u0000was~S~C` (key("\u0000was", series, category)), carrying
 *   data-c, data-s, data-neg and fill="none" (the theme's [data-past] rule
 *   paints it) but no data-maya: not a mark, never hit-tested or counted. The bar
 *   and its hit carry data-was = text.was with the formatted previous value (the tooltip line).
 *   The data table adds a column after each value column; the note is text.since with the was
 *   title and the 2 largest relative moves (y - was) / |was| (zero or null was skipped, ties in
 *   data order), e.g. "Since Last week: North +12%, West -10%.". The element may treat a ghost's
 *   geometry as its bar's previous state on first paint.
 *
 * Outputs
 *   render(spec, opts)      standalone `<svg class="maya-root">` with an embedded <style>.
 *                           Works as a file, in <img>, or rasterized by the hosted API.
 *   renderShell(spec, opts) `<maya-chart>` with Declarative Shadow DOM + JSON spec child.
 *                           The JSON child is the spec with rows projected to referenced
 *                           fields only (x y series y2 was frame size name path colorBy,
 *                           format and titles keys). `opts.nonce` lands on the shell's <style>.
 *   renderParts(spec, opts) the pieces (svg without <style>, legend, controls, crumbs, table,
 *                           title, override style + vars, warnings). `table` is a getter that
 *                           builds the data table on first read (the element reads it idle).
 *   The element renders in a microtask after a property set, and in the next frame after a
 *   resize or while it waits for its JSON spec child.
 *
 * Shadow content (identical from renderShell and the element, built by `shellInner`).
 * Slot order is fixed:
 *   <style>CSS</style>
 *   <div class="maya">
 *     TITLE  CONTROLS  LEGEND  CRUMBS
 *     CONTROLS = the measure radiogroup (.maya-ctl), then for units with 2+ forms the form
 *       radiogroup (.maya-ctl data-maya="form", aria-label text.forms, options text.waffle /
 *       bars / swarm, data-i = view.form; measure handlers must skip it), then with spec.frame and 2+ frames
 *       <button type="button" class="maya-play" data-maya="play">text.play</button>
 *       (the same for every frame, so the element can relabel it text.pause while playing).
 *       Parts.frame = [index shown, frame count] with spec.frame, absent otherwise.
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
 *        [data-drill when a click can drill one level further] [data-pt when the body holds a
 *        [data-maya=line] path: its point circles are hidden until active]>
 *     <title id="maya-t">  <desc id="maya-d">
 *     <g data-maya="grid">     lines perpendicular to the value axis
 *     <g data-maya="axis-y">   tick labels (text-anchor end), axis title when titles has it
 *     <g data-maya="axis-x">   category labels (thinned to fit), axis title. Band-axis tick <text>
 *                              (either axis) carries data-key = key(category), the category part of
 *                              the mark keys, so a rank swap moves names with bars. Value ticks: none.
 *     <g data-maya="marks">    only [data-key] children, one tag per key
 *     <g data-maya="rules">    only with spec.rules, after marks: per drawn rule a <line>
 *                              across the value axis, then its <text text-anchor=end> (label and value, or the
 *                              value alone) above the line at the plot end (vertical line: beside it at the top). Labels dodge nothing, not
 *                              value labels either. "mean" averages the visible plotted values
 *                              (stacked: the category totals; Other left out). Numeric rules widen
 *                              the value domain; a yDomain wins and hides rules outside it. No
 *                              data-key: animate.ts diffs only marks, so the group crossfades with
 *                              the other non-mark groups.
 *     <g data-maya="labels">   value labels (text), from ctx.label and the marks' own m.labels. A label
 *                              carries data-key = the data-key of the mark it labels (bar and
 *                              waterfall incl. y2 dots, heatmap, dumbbell, scatter, beeswarm, ridgeline
 *                              peak, line/area point labels); a line/area/parallel end label carries
 *                              its path's key (l~SERIES, l~ROW). Unkeyed (the element falls back to
 *                              index): kpi, table, parallel axis ticks and titles, rule labels, the
 *                              hierarchy, flow, radial and geo modules, density-bin plots, leaders.
 *     <g data-maya="cross">    crosshair (line/area), moved via CSSOM transform
 *     <g data-maya="hits">     invisible enlarged targets (see below)
 *   Empty: no row holds a number in any measure or y2. Grid/axes/groups
 *   omitted, `<text data-maya="empty">` (text.noData) centered. Judged on the data, not on what
 *   drew: a hidden series or a zoom window over nothing keeps its axes and legend.
 *   Marks group attributes are synced on patch.
 *
 * Hydration contract — the ONLY selectors the element layer may rely on:
 *   [data-maya="mark"]  attrs: data-key, data-c (category index; unique per mark for non-band
 *                       types), data-s (palette slot = series index % 8), data-x (formatted
 *                       category), data-y (raw value), data-series (series key, "" when
 *                       none), data-f (formatted value). data-neg when value < 0.
 *                       Optional: data-tone="good|bad", data-q (ramp step), data-other
 *   [data-maya=labels] text and band tick text in axis-x/axis-y: data-key only (see the groups above)
 *                       (limit roll-up), data-depth, data-selected.
 *                       bar + y2: one `path[data-maya=line]` plus a point circle mark per
 *                       non-null category, data-s = series count % 8, data-series = the
 *                       y2 title; hits are 24px squares round each point.
 *                       Line, area, kpi and ridgeline: point circles are marks (line and
 *                       area: hidden until active) plus ONE keyless hit rect over the plot
 *                       (svg.ts plotHit(), no data-c); the element resolves it to the point
 *                       at the category nearest the pointer's x, then nearest its y
 *                       (tooltip.ts pick(), also what select and drill click). A keyless
 *                       hit WITH data-c (parallel) stands for that category's mark nearest
 *                       the pointer's y.
 *                       Radial: data-c is the category (a stack lights together); the
 *                       centre total is a text mark keyed `t` with no data-c (counts up).
 *                       Scatter: data-gx/data-gy (formatted x, y) fill the hover guides in
 *                       the cross group; only written when the point has a name or size,
 *                       otherwise data-x and data-f already are the formatted x and y.
 *                       Scatter writes no data-series and no data-s when there is no series
 *                       (the marks group colours those points); a dense plot (over 100
 *                       unsized points) marks only its first point data-dense. Sankey/chord: data-n (node index), data-a (node
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
 *   [data-maya="play"]  the frame Play button in the controls slot (see Shadow content).
 *   [data-maya="legend"] buttons: <button type="button" data-si="i" data-s="i%8"
 *                       data-key="KEY" aria-pressed="true|false"><i></i>KEY</button>
 *                       With y2 the legend also holds non-button <span data-s data-line>
 *                       entries (the line; the bar measure too when there is no series).
 *                       Ramp/tone legends are non-button <div data-maya="ramp|tone">.
 *                       spec.was (unless legend:false) appends <div class="maya-legend">
 *                       <span data-past><i></i>WAS TITLE</span></div>, the ghosts' key.
 *   The tooltip reads its content from these attributes; the element never sees rows.
 *
 * Key grammar (svg.ts key(...parts)): each part encodeURIComponent'ed with `~` -> %7E,
 *   joined by `~`. Band `S~C`; line/area `l~S`/`a~S`; scatter `S~name(#n)` or index;
 *   bar y2 line `l~\u0000y2`, its points `\u0000y2~C` (NUL cannot be a series key prefix); bar
 *   was ghost `\u0000was~S~C`; weave segment `w~S~i`; units dot `u~NAME`; constellation star `c~NAME`;
 *   hierarchy `h~p0~p1…`; sankey node `n~depth~name`, link `k~depth~src~dst` (depth in the whole path, so a drill keeps them); hexmap
 *   `g~CODE`; limit roll-up category is the sentinel OTHER ("\u0000other").
 *   The element diffs marks by data-key (and tagName), never by index.
 *
 * CSS hooks theme.ts styles (interaction modules never touch theme.ts):
 *   .maya-ctl [role=radio][aria-checked]  .maya-play  .maya-crumbs  .maya-reset  .maya-err
 *   [data-maya=brush]  [data-maya=cross] (scatter: guide lines + text pills, --x/--y)
 *   [data-maya=link]  [data-depth]  [data-selected]  [data-past] (was ghosts)
 *   [data-maya=rules] line|text  svg[data-drill]  [data-tone]  [data-q]  [data-other]  [data-dir=h]  [data-maya=line|area] (path marks)
 *   .maya-ctl carries data-n (option count, 2..4) and data-i (checked index) for the sliding
 *   indicator; line point circles are hidden until active under `svg[data-pt]`, scatter styles
 *   key on `svg[data-xd]` (both axes linear). Rules whose subject is a mark avoid a `:has()` on
 *   an ancestor, which is checked once per mark: selection dims through `--o`, set once on the
 *   marks group, and legend hover through `--d` and `--h<slot>` on `.maya`.
 *
 * Keyboard (one keydown dispatcher in maya-chart.ts; handlers return "handled"):
 *   Escape priority: pinned tooltip -> brush in progress -> selection -> zoom window -> drill
 *   pop. Enter activates drill, else select, on the tooltip's active mark; Space pins.
 *
 * Colors: never inline. CSS rules `[data-s="0"]..[data-s="7"]` map to --maya-series-1..8;
 *   --maya-series-1 defaults to var(--maya-accent) so single-series charts use the
 *   accent. spec.colors / spec.theme become custom properties in `Parts.vars` (applied
 *   with style.setProperty by the element) and `Parts.style` (the standalone svg's style attribute in
 *   render(); a `.maya{...}` rule in the shell's <style> in renderShell(), never an attribute). Every value passes the CSS allowlist in validate.ts.
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
 *   category (its tooltip rows, plus hierarchy ancestors, plus for a flow node every link and
 *   node whose data-a lists it) data-lit; CSS dims the rest.
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
 *   (ctx.label) as chars * 7.2 + 4. Axis labels are never rotated. Band axes draw every nth label
 *   (bottom: by width, left: 14 px per step); left band labels are cut at 40% of the width.
 *   Coordinates are rounded to 2 decimals (`r()` in svg.ts).
 *   Direct end labels: a mark with `ends(spec, shaped, fmt)` returning [name, last value] pairs
 *   (line and area: 2 to 8 series, all visible, no value labels, no y2) gets a right gutter of
 *   endGutter() px (30% of the width at most; 0 below 400 px). It draws <text data-end data-s>
 *   (and a <line data-lead> when nudged more than 3 px) into the labels group, and the legend is
 *   dropped unless the spec sets legend:true explicitly (then both show). A hidden series, narrow
 *   width or labels:true keep the legend and draw no end labels; endLabels:false turns them off.
 *
 * Legend and title are HTML, not SVG (free wrapping and font metrics). render() — the
 * bare SVG — therefore has no legend; renderShell() is the full-fidelity output.
 */
import { dataTable, describe, titleText } from "./a11y.ts";
import { formatter } from "./format.ts";
import { endGutter, frame } from "./layout.ts";
import { bar } from "./marks/bar.ts";
import { beeswarm } from "./marks/beeswarm.ts";
import { dumbbell } from "./marks/dumbbell.ts";
import { heatmap } from "./marks/heatmap.ts";
import { kpi } from "./marks/kpi.ts";
import { parallel } from "./marks/parallel.ts";
import { ridgeline } from "./marks/ridgeline.ts";
import { area, line } from "./marks/line.ts";
import { points, scatter } from "./marks/scatter.ts";
import { table } from "./marks/table.ts";
import { MODULES } from "./registry.ts";
import { agg, shape } from "./shape.ts";
import { t } from "./strings.ts";
import { css } from "../styles/theme.ts";
import { el, esc, OTHER, r, tw } from "./svg.ts";
import {
  ALL_Y,
  fail,
  MAX_FRAMES,
  MAX_MARKS,
  resolve,
  validateOptions,
  validateSpec,
} from "./validate.ts";
import type {
  Aggregate,
  Axis,
  ChartSpec,
  LabelPlace,
  Mark,
  MarkCtx,
  MarkOut,
  Parts,
  RenderOptions,
  ResolvedSpec,
  Row,
  Shaped,
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

/** Numeric rules widen the value axis (a target above the data stays visible); a yDomain still wins. */
function withRules(s: ResolvedSpec, axes: [Axis, Axis, Axis?]): [Axis, Axis, Axis?] {
  const n = s.rules.flatMap((u) => (u.y === "mean" ? [] : [u.y]));
  if (!n.length) return axes;
  return axes.map((a) =>
    a?.kind === "linear" && a.field === s.y
      ? { ...a, domain: [Math.min(a.domain[0], ...n), Math.max(a.domain[1], ...n)] }
      : a,
  ) as [Axis, Axis, Axis?];
}

/**
 * "mean" for rules: the average of the plotted values of the active measure (visible series,
 * window and measure applied, the limit's Other left out); stacked: of the category totals.
 * Scatter averages y over the points it draws. NaN when nothing is plotted.
 */
function average(s: ResolvedSpec, shaped: Shaped): number {
  const by = new Map<number, number>();
  const add = (k: number, v: number) => by.set(k, (by.get(k) ?? 0) + v);
  if (s.type === "scatter") points(s, shaped).forEach((p, i) => add(i, p.y));
  else
    shaped.cells.forEach((c, i) => {
      if (c.value !== null && shaped.categories[c.ci] !== OTHER)
        add(s.stack === true ? c.ci : i, c.value);
    });
  return [...by.values()].reduce((a, b) => a + b, 0) / by.size;
}

/** A `.maya-ctl` radiogroup (the measure toggle, the units form control). */
const radios = (tag: string, label: string, names: string[], i: number) =>
  `<div class="maya-ctl" role="radiogroup"${tag} aria-label="${esc(label)}" data-n="${names.length}" data-i="${i}">` +
  names
    .map(
      (m, j) =>
        `<button type="button" role="radio" aria-checked="${j === i}" data-i="${j}" tabindex="${j === i ? 0 : -1}">${esc(m)}</button>`,
    )
    .join("") +
  `</div>`;

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
      `${n} marks exceed the limit of ${MAX_MARKS} (${s.data.length} rows).`,
      "Use spec.limit to keep the top N categories, or aggregate the rows first.",
    );
  // Scatter and beeswarm draw from rows and bin past MAX_MARKS; kpi and ridgeline thin their own
  // points; a table draws the rows that fit.
  if (!["scatter", "beeswarm", "kpi", "ridgeline", "table"].includes(s.type))
    cap(shaped.cells.length);

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
  // frame: the title (and so the accessible name) names the frame shown.
  const fr = s.frame;
  // ponytail: frames x rows is the cost of shared axes, so cap frames; bin the field past it.
  if (fr && fr[1].length > MAX_FRAMES)
    fail(
      "too-many-marks",
      "frame",
      `${fr[1].length} frames exceed the limit of ${MAX_FRAMES}.`,
      "Aggregate or bin the frame field (year instead of day) so it has fewer distinct values.",
    );
  const fv = fr?.[1].length ? fmt(fr[0], fr[1][fr[2]]) : null;
  if (fv !== null) s = { ...s, title: t(s, "frameOf", titleText(s), fv) };

  // colorBy: sign/target give tone; a numeric field gives a 0..9 bucket over its extent.
  const cb = s.colorBy;
  let lo = Infinity;
  let hi = -Infinity;
  if (typeof cb === "string" && cb !== "sign")
    for (const row of s.data) {
      const v = row[cb];
      if (typeof v === "number") ((lo = Math.min(lo, v)), (hi = Math.max(hi, v)));
    }
  const tone = (v: number): "good" | "bad" | "zero" | null =>
    cb === "sign"
      ? v < 0
        ? "bad"
        : v > 0
          ? "good"
          : "zero"
      : cb && typeof cb === "object"
        ? v >= cb.target
          ? "good"
          : "bad"
        : null;
  const toneWord = (n: "good" | "bad") =>
    t(
      s,
      cb === "sign" ? (n === "good" ? "positive" : "negative") : n === "good" ? "above" : "below",
    );
  const toneText = (v: number) => {
    const n = tone(v);
    return n && n !== "zero" ? toneWord(n) : "";
  };

  // Value labels: estimated boxes, a later label that overlaps a placed one (or leaves the svg) is dropped.
  const boxes: number[][] = [];
  let labels = "";
  const label = (x: number, y: number, text: string, place: LabelPlace, k?: string) => {
    const w = tw(text);
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
        "data-key": k,
      },
      esc(text),
    );
    return true;
  };

  // No rows, no axes: the svg is the "no data" text (and the element's slots-only first pass).
  const ends = spec.endLabels === false ? null : mark.ends?.(s, shaped, fmt);
  const gutter = ends?.length ? endGutter(ends, W) : 0;
  const empty = !s.data.some((r) => [...s.measures, s.y2].some((m) => typeof r[m!] === "number"));
  const ax = mark.axes && !empty ? mark.axes(s, shaped) : null;
  // frame: each value axis spans every frame, so it holds still during playback.
  // ponytail: shapes every frame on every render (frames x rows); cache per spec if it shows.
  if (ax)
    fr?.[1].forEach((_, k) => {
      const sk = resolve(spec, { ...opts?.view, frame: k });
      // Same mark, so the same axis kinds; axes() builds fresh objects, safe to widen in place.
      mark.axes!(sk, shape(sk, opts?.view)).forEach((a, i) => {
        const b = ax[i] as Extract<Axis, { kind: "linear" }>;
        if (a?.kind === "linear")
          b.domain = [Math.min(a.domain[0], b.domain[0]), Math.max(a.domain[1], b.domain[1])];
      });
    });
  const f = ax ? frame(s0, withRules(s, ax), { width: W, height: H, gutter }, fmt) : null;
  const plot = f?.plot ?? { x: 0, y: 0, w: W, h: H };
  const ctx: MarkCtx = {
    spec: s,
    shaped,
    width: W,
    height: H,
    plot,
    gutter,
    // ponytail: raw rows of every frame (ignores hidden series and windows), so the size scale holds still.
    sizeMax:
      fr && s.size
        ? spec.data.reduce((m, r) => {
            const v = r[s.size!];
            return fr[0] in r && r[fr[0]] != null && typeof v === "number"
              ? Math.max(m, Math.abs(v))
              : m;
          }, 0)
        : null,
    ends: gutter ? ends! : [],
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
  let markTable: MarkOut["table"];
  let note = "";
  // rule sentences for the auto description, after the frame's
  let said = fv === null ? "" : ` ${t(s, "frame", fr![2] + 1, fr![1].length)}.`;
  let body = "";
  if (empty) {
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
    // Reference lines, drawn over the marks.
    // ponytail: value axis only, at most 4, no bands or x rules; labels dodge nothing (NON-FEATURES).
    let rules = "";
    const v = s.horizontal ? f?.x : f?.y;
    if (v && !("bandwidth" in v))
      s.rules.forEach((u) => {
        const at = u.y === "mean" ? average(s, shaped) : u.y;
        // outside a yDomain, or NaN (no data)
        if (!((at - v.domain[0]) * (at - v.domain[1]) <= 0)) return;
        const p = r(v.of(at));
        const name = u.label ?? (u.y === "mean" ? t(s, "mean") : null);
        const val = fmt(s.y, at);
        const text = name ? `${name} ${val}` : val;
        said += ` ${name ?? t(s, "rule")}: ${val}.`;
        const [x0, y0] = [r(plot.x + plot.w), r(plot.y)];
        rules +=
          el(
            "line",
            s.horizontal
              ? { x1: p, x2: p, y1: y0, y2: r(plot.y + plot.h) }
              : { x1: r(plot.x), x2: x0, y1: p, y2: p },
          ) +
          // above the line at its end; beside the line at the top for a vertical one
          el(
            "text",
            {
              x: s.horizontal ? p - 4 : x0,
              y: s.horizontal ? y0 + 10 : p - 4,
              "text-anchor": "end",
            },
            esc(text),
          );
      });
    const m = mark.draw(ctx);
    // Scatter and modules draw per row/node. Counted in place: a split would copy every mark.
    let nm = 0;
    for (let i = 0; (i = m.marks.indexOf(' data-maya="mark"', i) + 1);) nm++;
    cap(nm);
    markLegend = m.legend ?? null;
    markTable = m.table;
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
      (rules && g("rules", rules)) +
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
      // Units have no axes in the waffle and bars forms; data-n keeps the element's stagger on.
      ...(s.type === "units" && !f?.attrs["data-n"] ? { "data-n": shaped.series.length } : {}),
      "data-dir": s.horizontal ? "h" : null,
      "data-stack": s.stack || null,
      // A line path: its point circles are hidden until active (one search, not a CSS :has).
      "data-pt": body.includes('data-maya="line"') || null,
      // ponytail: over 500 marks the svg is data-still: hover dim and glide are instant (theme.ts, NON-FEATURES.md).
      "data-still": body.split('data-maya="mark"').length > 501 || null,
      // A click can drill further (pointer cursor on marks).
      "data-drill": (s.drill && s.path.length > (s.type === "sankey" ? 2 : 1)) || null,
    },
    (sheet ? `<style>${sheet}</style>` : "") +
      el("title", { id: sheet === null ? "maya-t" : null }, esc(titleText(s))) +
      el(
        "desc",
        { id: sheet === null ? "maya-d" : null },
        esc(
          describe(s, shaped, fmt, mark.noun) +
            (s.description === null ? (note && " " + note) + said : ""),
        ),
      ) +
      body,
  );

  let legend = "";
  let tbl: string | undefined;
  if ((s.series !== null || s.y2 !== null) && s.legend && (!gutter || spec.legend))
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
          // Orbit and constellation colour by a measure the reader cannot guess: name it.
          (cb === "sign" && (s.type === "orbit" || s.type === "constellation")
            ? `<b>${esc(s.titles.get(s.y2 ?? s.y) ?? s.y2 ?? s.y)}</b>`
            : "") +
          (["good", "bad"] as const)
            .map((n) => `<span data-tone="${n}"><i></i>${esc(toneWord(n))}</span>`)
            .join("") +
          `</div>`
        : hi > lo
          ? `<div class="maya-legend" data-maya="ramp"><b>${esc(s.titles.get(cb) ?? cb)}</b><span>${esc(fmt(cb, lo))}</span><i></i><span>${esc(fmt(cb, hi))}</span></div>`
          : "";
  // A mark legend replaces the normal one, except scatter's size key, which stacks below it.
  if (markLegend !== null && spec.legend !== false)
    legend = s.type === "scatter" ? legend + markLegend : markLegend;
  // spec.was: a dashed swatch named by the was title says what the ghosts are.
  if (s.was !== null && spec.legend !== false)
    legend += `<div class="maya-legend"><span data-past><i></i>${esc(s.titles.get(s.was) ?? s.was)}</span></div>`;
  return {
    svg,
    legend,
    controls:
      (s.measures.length > 1 && !ALL_Y.includes(s.type)
        ? radios(
            "",
            t(s, "measures"),
            s.measures.map((m) => s.titles.get(m) ?? m),
            s.measure,
          )
        : "") +
      (s.forms.length > 1
        ? radios(
            ' data-maya="form"',
            t(s, "forms"),
            s.forms.map((f) => t(s, f)),
            s.form,
          )
        : "") +
      (fr && fr[1].length > 1
        ? `<button type="button" class="maya-play" data-maya="play">${esc(t(s, "play"))}</button>`
        : ""),
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
    // Built on first read: the element inserts the table when the browser is idle.
    get table() {
      return (tbl ??= s.table ? dataTable(s, shaped, fmt, toneText, markTable) : "");
    },
    title: s.title === null ? "" : `<div class="maya-title">${esc(s.title)}</div>`,
    style,
    vars,
    warnings: [
      ...(shaped.capped
        ? [
            `${s.type}: ${shaped.capped[1]} categories: the top ${shaped.capped[0]} are drawn, the rest are in Other. Set spec.limit to choose.`,
          ]
        : []),
    ],
    ...(fr && { frame: [fr[2], fr[1].length] as const }),
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
  const n = nonce ? ` nonce="${esc(nonce)}"` : "";
  // Overrides ride in the nonce'd <style>, not a style attribute (blocked without style-src-attr).
  // Raw text, so esc would corrupt quoted fonts; the allowlist already bars `<`, escaped anyway.
  const sheet = css + (parts.style ? `.maya{${parts.style.replace(/</g, "\\3c ")}}` : "");
  return (
    `${sheet ? `<style${n}>${sheet}</style>` : ""}<div class="maya">${parts.title}${parts.controls}${parts.legend}${parts.crumbs}` +
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
    spec.was,
    spec.frame,
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
