/*
 * Public signatures take `ChartSpec<R> | ChartSpec`: R is inferred from `data` so typed rows
 * get field autocomplete, while spreading a Row-typed spec with new rows still compiles.
 *
 * mayaCharts core — design note (the contract every module and the element layer follow)
 * =====================================================================================
 *
 * Pipeline: validateSpec -> resolve(spec, view) -> shape -> niceTicks -> format -> layout
 *           -> scales -> Mark.draw(ctx) -> assemble. A top-level option set to null is unset
 *           (validate.ts unset(), applied by build, validateSpec and resolve; not type or data). Pure, synchronous, deterministic (same
 *           input, same bytes). `src/core/**` never imports `src/element/**` and never
 *           touches window/document (a test deletes globalThis.window and imports it).
 *
 * State: interaction state is not in the spec. RenderOptions.view = { measure, drill, window,
 *   hidden, sortBy, frame, form, stack, face, brush, peers, xDrill, expanded, page, filter, facetScale, params } and RenderOptions.selected = Sel[] (raw values). view.form
 *   indexes the units spec.forms (ResolvedSpec.forms/form, clamped); for units without colorBy
 *   resolve() also makes x the series, so the legend and view.hidden toggle groups. It applies
 *   measure (active y, measures[] kept for the control), frame (keep the rows of one distinct
 *   spec.frame value, data order; view.frame indexes them, default and clamp: the last) and
 *   drill (filter rows, advance x/path). shape() applies, in order: aggregate -> time order ->
 *   sort -> limit -> window -> reduce -> hidden. SSR can therefore render any state.
 *
 * Frames (spec.frame): the title becomes text.frameOf(title or auto title, fmt(frame field,
 *   value)), so the svg aria-label and the visible title name the frame; the auto description
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
 *   spec.format sets it (a currency format gives way to percent). "mean" rules average the segment shares. The svg carries
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
 *   plot.w / 80 of them (min 2); a tick more than 4 px outside the first or last band centre is
 *   dropped (it would label the wrong bar); one within 4 px stays at its time (so "Jan 2025"
 *   labels the origin of data starting Jan 1 00:18). If the pixel gap would still drop a label the count
 *   falls by one until none does, so ticks stay evenly spaced. Sub-day ticks at UTC midnight and
 *   the first tick show the date. No vertical grid. Line and area paths break where the gap to
 *   the previous non-null point exceeds 5x the series' median gap (fixed factor); a thinned series breaks where kept points sit more
 *   than 6 mean steps apart (line.ts). The svg
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
 *   MarkCtx closures: fmt(field, v, step?), label(x, y, text, place, rotate?), tone(v, field?), agg(kind),
 *   fail(code, path, headline, ...details), t(key, ...args); plus spec, shaped, width,
 *   height, plot, x (bottom-axis scale), y (left-axis scale). Modules import only
 *   registry.ts, svg.ts, scale.ts, ticks.ts and types.
 *
 * Thresholds (colorBy { target?, warn?, better? }): resolve() gives ResolvedSpec.goals, one
 *   ResolvedGoal { target, warn, better } per measure (the object form applies to every measure,
 *   a kpi's keyed form to its keys), and colorBy = the active measure's goal or null. ctx.tone(v,
 *   field = active measure): "sign" as before; else null without a target; better "higher": v >=
 *   target good, v >= warn warn, else bad; "lower" mirrors it. Tone words: good is text.above
 *   (text.below when lower is better), bad the other, warn text.near. The tone legend lists
 *   good, warn (only with a warn threshold) and bad; none for kpi or a goal without a target.
 *   kpi and gauge status words: text.onTrack (good), atRisk (warn), offTrack (bad); the kpi
 *   tooltip uses them too.
 *
 * kpi with a `y` array (ALL_Y; with spec.toggle a measure toggle instead, see the M3 paragraph): one tile per measure. shape() makes each
 *   measure a series (Shaped.series = measures, cell.si = measure index) and thins them together
 *   (the last two categories kept). Tile parts carry data-s = measure index % 8 and keys with the
 *   measure field as the series part: headline `v~FIELD`, bullet `b~FIELD`, dots `FIELD~C`, line
 *   `l~FIELD`, area `a~FIELD`. A single y keeps `v`, `b`, `~C`, `l~`, `a~`. The data table has
 *   one column per measure, each toned by its own goal.
 *
 * gauge (radial module): one value, rows combined by spec.aggregate; one y (a y array only with
 *   spec.toggle: the measure control picks it), no x, no series.
 *   Dial range yDomain, else 0 to a nice max over the value, target, warn and was. Its tone is
 *   ctx.tone(value); the full mark contract is the header of radial.ts.
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
 *   Long form (was: { by, current?, previous? }): resolve() calls shape.ts pivotWas, which keeps
 *   two periods and writes the previous period's value under the key `by`, so ResolvedSpec.was =
 *   by and marks read the wide form unchanged; titles default `by` to the previous period
 *   formatted by format[by] (ResolvedSpec.wasBy keeps the field and the explicit periods).
 *   Calendar form (heatmap, by = series): shape.ts pivotPrevSeries instead; each cell reads the same
 *   x under the previous series value (time order for dates, else data order) as ResolvedSpec.was.
 *
 * Contract #69-#72 (where it differs, this paragraph wins over the older text below):
 *   Ratio: ResolvedSpec.ratio = [num, den] with aggregate "sum": wherever rows of y combine
 *   (shape groups, Other, drill levels, kpi, gauge, table, "mean" rules, title tokens) the value
 *   is sum(num) / sum(den), null when sum(den) is 0; rows read num and den, not y. renderShell's
 *   JSON child projects both fields. Modules use ctx.agg("sum") on each and divide.
 *   An aggregate keyed by y field (a y array that toggles the measure, #76) is resolved by
 *   resolve() to the active measure's rule (validate.ts aggOf; unlisted fields "sum"), so
 *   ResolvedSpec.aggregate and ratio are always one rule and marks never see the map.
 *   Drill + select: click/Enter select; double-click, Shift+Enter and the
 *   pinned tooltip's text.drillInto button drill. The drill gesture on a mark that cannot drill
 *   further dispatches maya-drill-leaf { path } (bubbles, composed, not cancelable): drilled
 *   values then the mark's own level values. Flows: only once drilled to their last branch.
 *   Drill types: table and marimekko take x from path, heatmap takes series (rows) from it.
 *   Flows (sankey, chord) drill to path.length - 1 values and draw full.slice(drilled - 1): the
 *   drilled node stays as the first column; a click drills into a node of the next undrilled
 *   column. ResolvedSpec.slots numbers names first-seen over all rows, before drill (a flow
 *   numbers its second column first, then its first, then the rest, so a sankey's palette starts
 *   where it always did). Path types colour by it: data-s = slot % 8
 *   of the path[0] value (treemap, sunburst) or of the coloured node (flows); a colors map sets
 *   --maya-series-(slot % 8 + 1) per key found in slots. treemap depth: levels drawn below the
 *   branch, parents carry their name strip; sunburst minAngle: fold threshold in degrees.
 *   Title tokens resolve in render.ts before the title is used (a11y.ts resolveTokens): only the
 *   exact names are replaced, other brace text stays as written. Without a selector max, min,
 *   first and last read one drawn point (stacked: category totals) and total sums every series;
 *   a selector {max.y:2025} reads only that series value (String compare), an unknown one stays
 *   as written. Scatter reads its drawn points: max/min by y, first/last by x, .x the x value or
 *   the name field. With no rows to draw a title or subtitle holding a token is dropped (null).
 *   A sankey with a colors map that misses a root keeps neutral roots and map colours under
 *   drill (the drilled-root hue rule needs every root mapped). theme.axisSize scales layout's
 *   label-width estimate (px; em and rem as 16 px).
 *   Rules group: an { x } rule is <line data-xrule> plus its <text>; a band is <rect data-band>
 *   (drawn first, under the lines) plus its <text>; a slope adds intercept b and its label
 *   reads "label text.perX" (slope by format[y], x title), placed by ctx.label at the upper end,
 *   lower end or middle, the first clear of marks; the description says the same. ctx.label ann
 *   "note" writes data-ann="note" for an annotate { x, text } item. Title tokens are resolved in
 *   a11y.ts titleText (aria-label and visible title both); Parts.title = .maya-title then
 *   <p class="maya-sub"> (subtitle; bare render() leaves it out). Compact: the element sets
 *   data-compact on the host under 200 px clientHeight; CSS clamps .maya-title to one line with
 *   an ellipsis (full text in its title attribute) and hides .maya-sub. Parts.legendAt goes on
 *   .maya as data-legend="bottom|right" (absent for top); slot order never changes, CSS moves
 *   it. Theme titleSize, titleWeight, axisSize are --maya-title-size, --maya-title-weight,
 *   --maya-axis-size. The current crumb is a non-button span with aria-current="page".
 *
 * Contract #86-#88 (M2; where it differs, this paragraph wins over the older text):
 *   Themes: spec.theme is tokens, a name or [name, overrides]. Names live in registry.ts THEMES
 *   (a second version-keyed global table, shared by every bundle); registerTheme (validate.ts,
 *   exported from the index and on the global maya) checks the tokens and adds one, replacing a
 *   name; importing themes.ts adds its named themes without replacing a name already there, and
 *   maya.global.js ships them as maya.themes. Both dispatch maya-register (connected charts
 *   re-render). resolve() merges name then overrides into ResolvedSpec.theme; an unknown name is
 *   invalid-theme listing the registered names. Every token becomes --maya-<kebab> in Parts.vars
 *   (numeric "tabular" is written "tabular-nums"; rampMidValue, a number, as its string).
 *   ResolvedSpec.rampMid = theme.rampMidValue ?? 0 when the theme sets rampMid (diverging), else
 *   null. Token readers: theme.ts (CSS), and the marks for geometry (cellGap, cellRadius are px).
 *   Colour precedence: colors map key > colorBy tone > theme series1..8 > colors array > accent;
 *   a value ramp ignores the map. The svg carries data-mapped="0 3" (slots a map key set) so
 *   theme.ts can let the key beat a tone, and data-sign under colorBy "sign" (also on the tone
 *   legend) so tones read as directions (theme up, down; total for waterfall totals). Waterfall
 *   bars carry data-way="up|down|total" (theme-only hook) for the same tokens.
 *   Ramps: scale.ts ramp(values, spec.colorScale, spec.rampMid) gives data-q 0..9, the legend
 *   `breaks`, `labels` (rank: lowest, median, highest) and `steps` (quantile: the data-q of each
 *   class swatch, ties collapsed so there may be fewer than five; null for a gradient legend). stack "stream" (area): shape.ts wiggle baseline (cells keep
 *   value, y0/y1 are offset); resolve() defaults yAxis and grid off. sort "change" (dumbbell):
 *   to minus from, descending, in shape. Tooltip ratio fields: ResolvedSpec.tipRatio, combined by
 *   shape.ts colorVals as sum(num) / sum(den); tipFields keeps their names. { y2 } rules: a
 *   <line data-y2> across the right axis, labelled by format[y2], in the rules group (a rule label
 *   that already contains the formatted value is printed alone, for every rule kind); they widen
 *   the right axis. Beeswarm "mean" rules average the visible rows. Legend buttons of a spec.emphasis
 *   series carry data-em. slots: also tint with path (path values) and a weave's group colorBy
 *   (groups), so a colors map keys those. View: brush ([field, lo, hi] per parallel axis, kept in
 *   ResolvedSpec.brush when spec.brush) and peers (select { peers }: the selected mark's peers
 *   value, ResolvedSpec.peers); the element owns both gestures and reports them in maya-view.
 *
 * Contract #82-#83 (M3; where it differs, this paragraph wins over the older text):
 *   Toggle: spec.toggle (kpi, gauge, needs a y array) gives ResolvedSpec.toggle; the measure
 *   radiogroup shows and view.measure picks the active y as on bar. A toggled kpi is not "wide"
 *   (shape.ts wide(): one series, keys `v`, `b`, `~C`, `l~`, `a~` as a single y; the description
 *   and data table name the active measure only); kpi.ts draws only spec.y when spec.toggle.
 *   Options keyed by y field resolve to the active measure like aggregate: yDomain
 *   ({ field: [lo, hi] }, kpi and gauge; ResolvedSpec.domains per measure, yDomain the active
 *   entry or null), colorBy (kpi and gauge; goals as before), was ({ field: wasField } with a y
 *   array, bar kpi gauge heatmap; ResolvedSpec.wasOf per measure, was the active entry or null,
 *   so a measure without one draws no ghosts). An object was with a string `by` is the long
 *   form. A wide kpi (no toggle) reads wasOf.get(field) and domains.get(field) per tile; its
 *   data table has a was column after each measure that has one. was with series (bar): one
 *   ghost per grouped bar (it always was; nothing refuses it).
 *   kpi: compare (ResolvedSpec.compare, default ["previous", "was", "target"], [] = none) picks
 *   the change lines in that order; frame works as on other types (resolve keeps one frame's
 *   rows, the title names it, the Play button shows); select and numberMotion are accepted
 *   (numberMotion is element-only, read from the spec: "roll" rolls digit columns instead of
 *   counting; core writes nothing for it). back: a spec without data, any type but kpi,
 *   validated as a spec over the kpi's rows (errors name back.<path>). With view.face "back",
 *   build() renders { ...back, data: the front's resolved rows (frame applied) } with the same
 *   view minus face, and appends the flip button (pressed) to its controls: the shell holds one
 *   face at a time, so SSR renders either and the element turns the card by re-rendering with
 *   view.face. renderShell's JSON child keeps the fields back references.
 *   gauge: arc (180 | 270 | 360, ResolvedSpec.arc, default 180) is the dial sweep;
 *   tooltip.fields are combined over every row by aggregate (ratio items too).
 *   Stack modes: spec.stack may be an array of 2+ distinct modes (false, true, "percent",
 *   "stream"); ResolvedSpec.stacks lists them and stack is view.stack's entry (clamped, default
 *   0), so everything downstream sees one mode. It counts as stacked for the was and ratio
 *   refusals; "stream" anywhere in it needs area. The svg's data-stack reflects the active mode.
 *
 * Contract #79 #81 #84 (M4; where it differs, this paragraph wins over the older text):
 *   View adds xDrill (heatmap column branch), expanded (open table row or list move, raw x; ""
 *   = none), page (table pages added) and filter (table search text); all ride in maya-view.
 *   Drill: validate.ts drillDepth(spec) is how many values view.drill may hold (path and
 *   seriesPath: levels - 1; chord with 3 levels: 1, the target; marimekko without series:
 *   levels - 2; drillTo: 1). ResolvedSpec.drillOn says what the gesture pushes next: "x" (the
 *   mark's category or branch, as before), "series" (the mark's data-series: seriesPath,
 *   drillTo) or null; the svg writes it as data-drill="" or data-drill="series" (absent: null),
 *   so the element reads the gesture from the svg, never from the spec. New x-from-path types:
 *   radial, waffle, hexmap, waterfall (PATHX). A drilled hexmap resolves to type "bar",
 *   horizontal, sort "desc" (build() picks the mark after resolve), so its children draw as bars.
 *   ResolvedSpec.levels is the full path length: only a 3-level chord re-keys its targets to level 2
 *   when drilled and marks (data-dr, branchOf) its targets, not its sources, as the drillable nodes.
 *   The heatmap Total band is the sentinel TOTAL (svg.ts), labelled text.total like OTHER; it never drills.
 *   An open table row draws a rule (line[data-rule] in the grid group) above its expand box.
 *   Chord with 3 levels: view.drill = [target]; rows keep path[1] = target; ResolvedSpec.path is
 *   [path[0], path[1]] at the root and [path[0], path[2]] drilled, so the chord mark always sees
 *   two levels. Marimekko without series: x = path[d], series = path[d + 1]. seriesPath: series =
 *   seriesPath[d], rows filtered by the drilled series values, x unchanged; not with path or
 *   series. heatmap xPath: x = xPath[view.xDrill.length], rows filtered by both drills; the svg
 *   carries data-xdrill while columns can drill (the element drills from a column header,
 *   [data-maya=axis-x] text[data-key], decoding its key); its breadcrumb is a second
 *   <nav class="maya-crumbs" data-axis="x" aria-label=text.crumbsX> after the rows' one (with
 *   xPath the rows' root button is named by path[0]'s title, not text.back), root
 *   button named by xPath[0]'s title; maya-drill-leaf from a last-level column carries
 *   { path: xPath values, axis: "x" }. Escape pops columns first, then rows.
 *   waterfall start: the start x is a total (first of ResolvedSpec.totals) and its rows move to
 *   the front, so the leading-total rule draws it at its own y. Drilled (any waterfall with
 *   path): resolve() replays the running sum up to the drilled value (start or a leading total
 *   set it, later totals keep it, steps add) and frames the children with an opening total
 *   text.before(value) at that sum and a closing total text.after(value) (y null: drawn as the
 *   running total). Marks never see the replay. heatmap totals: true: Shaped.margins holds the
 *   column, row and grand totals (aggregate over the rows of visible series; Other's column
 *   holds the rest); categories and series stay as they were, so the ramp, table and
 *   description ignore them unless the mark draws them.
 *   table: resolve() applies view.filter (case-insensitive substring of x or a columns field)
 *   before anything else sees the rows; ResolvedSpec.shown caps the rows drawn (page *
 *   (view.page + 1), 1000 with scroll); scroll (page or scroll) makes the svg as tall as its
 *   content through MarkOut.height and adds data-scroll (the box scrolls; the element holds the
 *   header group at the top with a CSSOM transform). The controls slot gains, before Play,
 *   <input type="search" class="maya-filter" data-maya="filter" aria-label placeholder=text.filter
 *   value=view.filter>. Controls order: params, then one <div class="maya-ctls"> row (a lone control stands
 *   without the wrapper) of the measure, form, stack and facetScale radiogroups, the filter, the frame
 *   control and the kpi flip button. bars (per measure), columns and cells (shape.ts strips(): per strip title
 *   the kept by labels and per row label the values) are the mark's to draw. expand (a spec):
 *   the mark returns MarkOut.expand, the box under the open row; build() renders
 *   { ...subSpec(expand), data: rows whose x is the open row } at that size as a nested
 *   <svg data-maya="expand" data-row x y> appended after the hits group (no class, no ids, no
 *   tabindex; data-row is the open row's x, so a switch to another row crossfades the box);
 *   a sub-chart error leaves the row shut and lands in Parts.warnings. The svg carries
 *   data-expand when rows can open (table expand, list with an evidence level).
 *   line drillTo: with view.drill = [series value], build() renders the sub-spec over that
 *   series' rows (frame applied) instead of the line, with the line's crumbs (text.back, value);
 *   was "previous" is pivoted in: the previous series' y summed per x under the field "\0was",
 *   titled by that series' name. A sub-spec (expand, drillTo) without x or path takes the

 *   parent's x (validate.ts subSpec). Every sub-spec, and the kpi back face, takes the parent's
 *   format, titles, locale, currency and theme unless it sets them; a back face with a limit
 *   defaults other to false. A sub-spec may not set drill, zoom, frame, expand, drillTo, back,
 *   page, scroll or filter; its errors name spec.expand.<path> / spec.drillTo.<path>.
 *   list (core Mark, marks/list.ts): x = spec.x or path[0]; ResolvedSpec.evidence = path[1],
 *   body, rowFormat, bars (y -> "bar" with bars: true), expanded (view.expanded, else spec.expand
 *   "first" (default) / "all" / "none"). shape.ts moves(s) groups rows by x in data order: the
 *   first row without an evidence value is the move's own (value, format, body), the rest are its
 *   evidence; shape() uses only own rows, so cells, tokens and the description never sum
 *   evidence. format.ts formatAs(s, field, rowFormat value, v) formats one row. Keys: move m~X,
 *   evidence e~X~NAME. maya-select on a move: { x: raw move }.
 *
 * Contract #78 #80 #85 (M5; where it differs, this paragraph wins over the older text):
 *   View adds facetScale ("shared" | "own") and params ({ id: value }); both ride in maya-view,
 *   and maya-view also reports frame when the viewer picks one (slider, tabs, select).
 *   params: resolve() first runs validate.ts applyParams(spec, view): each value is view.params
 *   [id] (unknown ids ignored) clamped to [min, max], else the spec value; every { param } ref
 *   (colorBy target and warn, keyed too; rules y, y2, x, band ends) becomes that number, and
 *   scale multiplies each y field of the rows matching every `where` field by the product of
 *   (1 + p / 100) over `by` (the rows stay the same array when it is 1). So everything
 *   downstream, marks included, sees plain numbers and scaled rows; ResolvedSpec.params holds
 *   the current values. validateSpec checks refs at the spec values. Tokens: {total.base} is
 *   {total} of the spec without scale (resolved and shaped once, on first use); {count.below}
 *   and {count.above} count drawn values below / at or above the active colorBy target (Other
 *   left out; no target: as written). Controls slot, first: <div class="maya-params"
 *   data-maya="params" role="group" aria-label=text.params> holding per param <label
 *   class="maya-param"><span>label</span><input type="range" data-maya="param" data-id min max
 *   step value aria-label aria-valuetext><output>value</output></label> (value formatted by the
 *   param's format, then suffix), then <button class="maya-params-reset"
 *   data-maya="params-reset">text.resetParams</button>. Under 300 px wide the div is
 *   popover="auto" id="maya-params", opened by a preceding <button class="maya-params-btn"
 *   popovertarget="maya-params">text.params</button> (native, no script).
 *   frame: ResolvedSpec.frameControl picks the control in the Play button's place: "play" (as
 *   before), "slider" (<input type="range" class="maya-frame" data-maya="frame" min="0" max
 *   step="1" value aria-label=text.frames aria-valuetext=formatted frame>, then an aria-hidden
 *   <output data-maya="frame-value"> with the formatted frame), "both" (Play and the slider with its
 *   output in one <div class="maya-ctls">), "tabs" (a .maya-ctl radiogroup with data-maya="frame", one radio per formatted
 *   frame; a select when the chart is under 300 px wide or the tabs' estimated width passes it)
 *   or "select" (<select class="maya-frame" data-maya="frame"> of <option value=index>).
 *   frameSpeed is element-only (read from the spec, like numberMotion). other: false (any type
 *   with limit; shape.ts) keeps the top `limit` categories and drops the rest; an auto roll-up
 *   keeps its Other. scatter trail: ResolvedSpec.paths maps each name to its [x, y] per frame
 *   index (its first row in that frame, params applied); build() hands the mark
 *   MarkCtx.trails: per name the positions in frame order without the current frame, the
 *   previous `trail` frames, or every frame for a name in opts.selected; under 300 px wide only
 *   the selected names'. The mark draws them (fading dots and a line, no data-maya).
 *   facet (bar line area): resolve() keeps sort and limit in ResolvedSpec.facet (panel order and
 *   cap; Shaped categories are neither sorted nor limited) with the scale (view.facetScale over
 *   the first of a facetScale array, else the string, default "shared") and the scales the
 *   control lists. build() lays out n panels in cols = min(n, floor(W / 160), ceil(sqrt(n * W
 *   / H))) columns (fewer when floor(W / 240) columns still leave each row 150 px: panels keep axes), each W / cols wide and max(110, H / rows) tall; the svg is rows * that tall
 *   and carries data-scroll when it passes H. A panel under 240 x 150 is a sparkline (xAxis,
 *   yAxis, grid, labels off). Each panel is build() of the spec without facet, facetScale, sort,
 *   limit, other, drill, drillOut, params, scale, title, subtitle and description (refs and
 *   scale already applied) plus legend, table and endLabels false and title text.panelOf(value
 *   formatted by format[facet], total by aggregate), over its rows led by pad rows (every x
 *   value and every series value, y unset), so every panel has the same categories and series
 *   in the same order and data-c / data-s line up. shared: every panel's value axis (withRules
 *   included) is unioned, made nice and passed as yDomain (a spec yDomain wins). A panel is a
 *   nested <svg data-maya="panel" data-facet=value x y role="img" aria-label=its title
 *   tabindex="0"> after the root's hits group; every data-key inside it is prefixed with
 *   key(value) + "~". The root svg (role="figure") keeps its groups, all empty but labels,
 *   which holds one <text data-facet=value> title per panel; the description adds text.facets.
 *   Legend, data table and title tokens are the whole chart's (rows of every panel). drill:
 *   drillDepth 1; ResolvedSpec.drillOn "facet", written as svg data-drill="facet" (the gesture
 *   on a panel pushes its data-facet); view.drill = [value] renders that panel's spec full size
 *   (axes, legend and was as the spec says, title text.panelOf(value, "{total}")) with the
 *   crumbs and the params controls. Controls: a facetScale array adds a .maya-ctl radiogroup
 *   data-maya="facetScale" (aria-label text.facetScales, options text.shared / text.own) after
 *   the stack radiogroup. was on line and area: like bar it widens the value axis and adds the
 *   legend swatch; the mark draws a dashed <path data-past> per series keyed \u0000was~S (no
 *   data-maya).
 *
 * Outputs
 *   render(spec, opts)     standalone `<svg class="maya-root">` with an embedded <style>.
 *                           Works as a file, in <img>, or rasterized by the hosted API.
 *   renderShell(spec, opts) `<maya-chart>` with Declarative Shadow DOM + JSON spec child.
 *                           The JSON child is the spec with rows projected to referenced
 *                           fields only (x y series y2 was (or was.by) frame size name path
 *                           colorBy, tooltip.fields, format and titles keys). `opts.nonce` lands on the shell's <style>.
 *   renderParts(spec, opts) the pieces (svg without <style>, legend, controls, crumbs, table,
 *                           title, override style + vars, warnings). `table` is a getter that
 *                           builds the data table on first read (the element reads it idle).
 *   The element renders in a microtask after a property set, and in the next frame after a
 *   resize or while it waits for its JSON spec child. Each paint dispatches maya-render (or
 *   maya-error); maya-settled { error: null } follows once that paint's animations finish (same
 *   task when nothing animates) and maya-settled { error } follows a maya-error. el.settled is a
 *   promise for the current or next paint: it resolves on settle, rejects with the MayaSpecError.
 *
 * Shadow content (identical from renderShell and the element, built by `shellInner`).
 * Slot order is fixed:
 *   <style>CSS</style>
 *   <div class="maya">
 *     TITLE  CONTROLS  LEGEND  CRUMBS
 *     CONTROLS = params (paramCtl), then one <div class="maya-ctls"> row (a lone control has no wrapper) of: the measure
 *       radiogroup (.maya-ctl; not on ALL_Y types unless spec.toggle), for units with 2+ forms the form
 *       radiogroup (.maya-ctl data-maya="form", aria-label text.forms, options text.waffle /
 *       bars / swarm, data-i = view.form; measure handlers must skip it), with a spec.stack
 *       array the stack radiogroup (.maya-ctl data-maya="stack", aria-label text.stacks, options
 *       text.unstacked / stacked / percent / stream, data-i = view.stack), the facetScale radiogroup, the table
 *       filter input, with spec.frame and 2+ frames the frame control (a Play
 *       <button type="button" class="maya-play" data-maya="play">text.play</button>,
 *       the same for every frame, so the element can relabel it text.pause while playing),
 *       then with kpi spec.back <button type="button" class="maya-flip" data-maya="flip"
 *       aria-pressed="false|true">text.flip</button> (pressed: the back face shows). The back
 *       face's flip button sits outside the row, after its own controls.
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
 *        aria-label="title" aria-describedby="maya-d" [tabindex="0" in parts only]
 *        data-plot="x y w h" data-n="categories" [data-xd="lo hi" data-yd="lo hi" for
 *        linear-x types instead of data-n] [data-dir="h" when horizontal]
 *        [data-drill when a click can drill one level further] [data-pt when the body holds a
 *        [data-maya=line] path: its point circles are hidden until active]
 *        [data-log="x", "y" or "x y" for log axes: data-xd/data-yd stay in data units, so the
 *        element inverts pixels through log10 (zoom.ts)]>
 *     <desc id="maya-d">  (named by aria-label; standalone render() adds a <title>, no ids)
 *     <g data-maya="grid">     lines perpendicular to the value axis
 *     <g data-maya="axis-y">   tick labels (text-anchor end), axis title when titles has it
 *     <g data-maya="axis-x">   category labels (thinned to fit), axis title. Band-axis tick <text>
 *                              (either axis) carries data-key = key(category), the category part of
 *                              the mark keys, so a rank swap moves names with bars. Value ticks: none.
 *     <g data-maya="marks">    only [data-key] children, one tag per key
 *     <g data-maya="rules">    only with spec.rules, after marks: bands (<rect data-band>) first, then per drawn rule a <line>
 *                              across the value axis; then every label <text> (label and value, or the value alone),
 *                              after the marks' labels, at the first spot inside the plot's width
 *                              whose box is free in the label collision boxes: above the line at its
 *                              end, at its start, below at the end, below at the start (vertical
 *                              line: beside it at the top, left then right, stepping down); none
 *                              free, the label is dropped (#91.2). An { x } rule label tries the
 *                              full text right then left of the line (4 rows each), then the label
 *                              alone, then the value alone; none free, the shortest is drawn clamped
 *                              inside the plot at the top over whatever it covers (its halo). Labels avoid labels, not marks. "mean" averages the visible plotted values
 *                              (stacked: the category totals; Other left out). Numeric rules widen
 *                              the value domain; a yDomain wins and hides rules outside it. No
 *                              data-key: animate.ts diffs only marks, so the group crossfades with
 *                              the other non-mark groups. A scatter { slope } rule is not in
 *                              this group: its <line data-slope> (key \0slope~i, like the data-past
 *                              ghosts, no data-maya) sits in the marks group and its label in the
 *                              labels group.
 *     <g data-maya="labels">   value labels (text), from ctx.label and the marks' own m.labels. A label
 *                              carries data-key = the data-key of the mark it labels (bar and
 *                              waterfall incl. y2 dots, heatmap, dumbbell, scatter, beeswarm, ridgeline
 *                              peak, line/area point labels); a line/area/parallel end label carries
 *                              its path's key (l~SERIES, l~ROW). Unkeyed (the element falls back to
 *                              index): kpi, table, parallel axis ticks and titles, rule labels, the
 *                              hierarchy, flow, radial and geo modules, density-bin plots, leaders.
 *                              A spec.annotate label (ctx.label's ann argument) carries
 *                              data-ann="max|min|first|last" and its point's data-key; it goes
 *                              through the same collision queue, before plain value labels.
 *     <g data-maya="cross">    crosshair (line/area), moved via CSSOM transform
 *     <g data-maya="hits">     invisible enlarged targets (see below)
 *   Empty: no row holds a number in any measure or y2. Grid/axes/groups
 *   omitted, `<text data-maya="empty">` (text.noData, or text.noMatch with the table filter text when a filter is set; the filter control stays) centered; a "\n" or a line wider than the
 *   svg (estimated) breaks it into <tspan x dy> lines, one line stays plain text. Judged on the data, not on what
 *   drew: a hidden series or a zoom window over nothing keeps its axes and legend.
 *   Marks group attributes are synced on patch.
 *
 * Hydration contract — the ONLY selectors the element layer may rely on:
 *   [data-maya="mark"]  attrs: data-key, data-c (category index; unique per mark for non-band
 *                       types), data-s (palette slot = series index % 8), data-x (formatted
 *                       category), data-y (raw value), data-series (series key, "" when
 *                       none), data-f (formatted value). data-neg when value < 0.
 *                       Optional: data-tone="good|warn|bad|zero", data-q (ramp step), data-other
 *                       (limit roll-up), data-depth (breadcrumb button), data-selected (written by
 *                       the element on selected marks), data-more (spec.tooltip.fields: one
 *                       "title\tvalue" line per field, joined by "\n", the scatter data-f grammar;
 *                       on the hit too; the tooltip adds them as rows under the mark's row),
 *                       data-dash (path marks and points of a spec.dash series).
 *   [data-maya=labels] text and band tick text in axis-x/axis-y: data-key only (see the groups above)
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
 *   Also read by the element: [data-maya=sort][data-field] (table header, element/sort.ts), data-v
 *   (the number inside a text mark that counts up; the orbit group's speed), data-w (weave thread),
 *   data-total (a total's path, which enters late), data-in (a label inside its mark, tooltip.ts), and
 *   data-hot, which the element writes on the marks group for a lit flow node.
 *   [data-maya="probe"] / .maya-tip  tooltip anchor probe + popover (shell only).
 *   [data-maya="live"]  the static polite live region; written via textContent only.
 *   [data-maya="play"]  the frame Play button in the controls slot (see Shadow content).
 *   [data-maya="legend"] buttons: <button type="button" data-si="i" data-s="i%8"
 *                       data-key="KEY" aria-pressed="true|false"><i></i>KEY</button>
 *                       With y2 the legend also holds non-button <span data-s data-line>
 *                       entries (the line; the bar measure too when there is no series).
 *                       Ramp/tone legends are non-button <div data-maya="ramp|tone">.
 *                       spec.was on bar (unless legend:false) appends <div class="maya-legend">
 *                       <span data-past><i></i>WAS TITLE</span></div>, the ghosts' key (data-tick on the
 *                       span for grouped bars, whose ghosts are ticks; data-line on line and area, whose
 *                       ghosts are dashed lines).
 *                       A spec.dash series' button (and its end label) carries data-dash.
 *                       No legend at all (series, was key, tone, ramp) when the chart is empty.
 *                       Nor for a drilled marimekko (tinted segments). Heatmap xPath column labels that can drill
 *                       further end in " ›"; the row crumb root is named by path[0].
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
 *   [data-maya=link]  [data-depth]  [data-selected]  [data-past] (was ghosts)  [data-dash] (dashed
 *   series: path, legend swatch, end label)  [data-em] (emphasis series: path, legend swatch)
 *   svg[data-sign]  svg[data-mapped~="n"]  [data-ann] (annotate labels)  line[data-slope]
 *   [data-maya=rules] line|text  svg[data-drill]  svg[data-xdrill]  svg[data-scroll]
 *   svg[data-expand]  svg[data-maya=expand] (a table row's sub-chart)  .maya-filter
 *   svg[data-maya=panel] (a facet panel)  text[data-facet] (its title)  .maya-frame  .maya-params
 *   .maya-param  .maya-params-btn  .maya-params-reset
 *   .maya-crumbs[data-axis=x]  [data-tone]  [data-q]  [data-other]  [data-dir=h]  [data-maya=line|area] (path marks)
 *   Theme-only hooks (set by a mark or module, styled in theme.ts, never read by the element):
 *   data-ink data-hm data-nm data-ring data-arc data-disc data-ridge data-kpi data-polar data-radar
 *   data-hex data-last data-below data-brk data-way data-ax (in-chart axis label) data-bg (table
 *   header backing) data-body (list row body) data-centre (centred table or list cell) data-chev
 *   (drill chevron) data-d (density ramp legend) data-ev (list event name or value) data-h (label
 *   halo) data-hd (list heading) data-hero (headline number) data-hollow (open dumbbell dot) data-nil
 *   (null table cell) data-num (list row number) data-peer-mean (peer average rule) data-peer-on
 *   (selected peer) data-range (parallel axis brush span) data-sum (heatmap total cell)
 *   data-lt (tint step: the colour mixed toward the ink; 0 = the parent colour, siblings and
 *   sunburst rings use 1..7, so a child never equals its parent).
 *   Read outside the writing file: data-g (x|y cross guide; tooltip.ts skips it) data-label (series
 *   name, tooltip.ts) data-peer (peer mark, select.ts) data-to (drill depth of a nested treemap child,
 *   drill.ts) data-trail (trail path, animate.ts); the element writes data-off (brushed-out line) and
 *   data-still (animate false) for theme.ts.
 *   .maya-ctl carries data-n (option count, 2..4) and data-i (checked index) for the sliding
 *   indicator; line point circles are hidden until active under `svg[data-pt]`, scatter styles
 *   key on `svg[data-xd]` (both axes linear). Rules whose subject is a mark avoid a `:has()` on
 *   an ancestor, which is checked once per mark: selection dims through `--o`, set once on the
 *   marks group, and legend hover through `--d` and `--h<slot>` on `.maya`.
 *
 * Keyboard (one keydown dispatcher in maya-chart.ts; handlers return "handled"):
 *   Escape typed in an input or select is not handled (the filter keeps it). Escape priority: pinned tooltip -> brush in progress (zoom or parallel axis drag) -> card back
 *   face (flip.ts) -> selection (and view.peers) -> parallel brush ranges -> zoom window -> drill
 *   pop. While view.face is "back", the element's host.spec() is { ...spec.back, data }, so select,
 *   tooltip, drill and play read the back's options; a face change skips the key diff and turns the
 *   card (old svg rotateY 0 to 90deg 160 ms, swap, new -90 to 0 280 ms; reduced motion crossfades).
 *   The title and controls swap with the face at the turn's midpoint, and the box is refitted once there.
 *   Heatmap column headers ([data-maya=axis-x] text[data-key], tabindex 0, role button, set after
 *   paint when spec.drill and spec.xPath) push view.xDrill on click, Enter or Space. A row, tick or
 *   series push is gated on drillDepth and reads the svg's data-drill; marks with data-way="total"
 *   or data-other never drill. Escape pops xDrill first, then drill. Table and list rows expand on
 *   click or Enter (with select: double click or Shift+Enter) through view.expanded;
 *   [data-maya=more] (the keyed focusable text and the full-row rect in hits) increments view.page;
 *   input[data-maya=filter] sets view.filter (debounced 150 ms) and resets the page. Under
 *   svg[data-scroll] the element holds [data-maya=thead] with a translateY(scrollTop) CSSOM
 *   transform; svg[data-maya=expand] crossfades whole.
 *   Parallel axis strips ([data-maya=axis]) are focusable sliders the element sets after paint:
 *   Up/Down move the brush range a tenth of the axis (the first press starts a 20% range at that
 *   end), Shift+Up/Down grow or shrink it, Delete or Backspace clear that axis. A plain click on
 *   an unbrushed axis marks a pending end and a second click commits the range (WCAG 2.5.7).
 *   numberMotion "roll" hides the kpi headline text (visibility attribute) under a nested
 *   <svg data-roll> window of per-character <text> clones; a changed digit is a <g> column that
 *   translates one line, staggered 50 ms from the units digit, then the text is restored. Enter activates drill, else select, on the tooltip's active mark; Space pins. On a focused
 *   table header (tabindex 0) Enter or Space sorts by that column (element/sort.ts). With zoom, + or =
 *   halves the window about the active mark (else the middle) and - doubles it, reset once it covers
 *   the range (element/zoom.ts step); Ctrl, Meta and Alt combinations are left to the browser.
 *
 * Colors: never inline. CSS rules `[data-s="0"]..[data-s="7"]` map to --maya-series-1..8;
 *   --maya-series-1 defaults to var(--maya-accent) so single-series charts use the
 *   accent. Later wins: a colors array, then theme tokens (series1..8), then a colors map
 *   key (#89), so a named series keeps its colour under a theme; data-mapped lets the key beat
 *   a colorBy tone too (M2 paragraph above). spec.colors / spec.theme
 *   become custom properties in `Parts.vars` (applied
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
 *     roll:   numberMotion "roll" (kpi headline): the text is hidden and a nested `svg[data-roll]`
 *             stands in as a clip window (overflow hidden, so the digits show only inside it);
 *             each changed digit is a column of two texts a line apart that translateY by one
 *             line. Transform only, digits paired right-aligned; the window leaves when done.
 *     drill:  rect marks zoom (transform/opacity): in, the branch's marks map onto the plot,
 *             children start inside the branch's box, the rest is pushed out; out reverses
 *             it. The marks group is clipped to the plot meanwhile. Flows morph instead.
 *     rings:  sunburst slices and the gauge's value arc are `circle[pathLength=360]` whose stroke dash is the arc; they
 *             tween the CSS properties r, stroke-width, stroke-dasharray and
 *             stroke-dashoffset, which sweeps in angle space (exception 3). On a drill the
 *             centre disk carries the drilled branch's key, so the clicked slice grows into
 *             it; slices outside that branch fold to its nearer edge, entering ones unfold.
 *             The marks group is clipped to the union of the old and new plot meanwhile, and rings start
 *             offset by the centre shift a changed crumb row causes.
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
 *   (bottom: by width, left: 14 px per step) unless there are 8 or fewer or each slot is 60 px or
 *   more (then each is cut to its slot); left band labels are cut at 40% of the width. Heatmap
 *   bands have no padding (the mark leaves a 1 to 2 px gap between cells); other bands pad 20%. Linear
 *   ticks pick the nice step nearest the target count, but a step whose domain leaves over 40% of
 *   the axis empty loses (ticks.ts); an off-step domain end whose label would touch the previous
 *   tick label is not labelled. With annotate (vertical value axis) the plot top drops 14 px so a
 *   label above a point at the top fits. A bar's value axis spans its was values.
 *   Coordinates are rounded to 2 decimals (`r()` in svg.ts).
 *   Direct end labels: a mark with `ends(spec, shaped, fmt)` returning [name, last value] pairs
 *   (line and area: 2 to 8 series, all visible, no value labels, no y2) gets a right gutter of
 *   endGutter() px (25% of the width at most; below 400 px just the widest value, the labels show the
 *   value alone and the legend stays to name the series). A long name is ellipsized, the value always
 *   stays; when a name would be dropped (under 56 px left beside the value) the legend stays too. It draws <text data-end data-s>
 *   (and a <line data-lead> when nudged more than 3 px) into the labels group, and the legend is
 *   dropped unless the spec sets legend:true explicitly (then both show). A hidden series or
 *   labels:true keep the legend and draw no end labels; endLabels:false and a legend placement string turn them off.
 *
 * Legend and title are HTML, not SVG (free wrapping and font metrics). render() — the
 * bare SVG — therefore has no legend; renderShell() is the full-fidelity output.
 */
import { dataTable, describe, resolveTokens, titleText, TOKEN } from "./a11y.ts";
import { formatter } from "./format.ts";
import { endFits, endGutter, frame } from "./layout.ts";
import { bar } from "./marks/bar.ts";
import { beeswarm } from "./marks/beeswarm.ts";
import { dumbbell } from "./marks/dumbbell.ts";
import { heatmap } from "./marks/heatmap.ts";
import { kpi } from "./marks/kpi.ts";
import { list } from "./marks/list.ts";
import { parallel } from "./marks/parallel.ts";
import { ridgeline } from "./marks/ridgeline.ts";
import { area, line } from "./marks/line.ts";
import { points, scatter } from "./marks/scatter.ts";
import { table } from "./marks/table.ts";
import { MODULES } from "./registry.ts";
import { agg, colorVals, feed, shape } from "./shape.ts";
import { t } from "./strings.ts";
import { css } from "../styles/theme.ts";
import { clip, el, esc, key, memo, OTHER, r, TOTAL, tw } from "./svg.ts";
import { niceTicks, toTime } from "./ticks.ts";
import {
  ALL_Y,
  applyParams,
  fail,
  MAX_FRAMES,
  MAX_MARKS,
  ratios,
  resolve,
  subSpec,
  themeOf,
  validateOptions,
  unset,
  validateSpec,
} from "./validate.ts";
import type {
  Aggregate,
  Annotate,
  Axis,
  Box,
  ChartSpec,
  LabelPlace,
  Mark,
  MarkCtx,
  MarkOut,
  Parts,
  RenderOptions,
  ResolvedSpec,
  Row,
  Sel,
  Shaped,
  TimeScale,
  Tone,
  View,
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
  list,
};

/** Numeric rules and a bar's was values widen the value axis (a target or ghost above the data
 * stays visible); a yDomain still wins. */
function withRules(
  s: ResolvedSpec,
  shaped: Shaped,
  axes: [Axis, Axis, Axis?],
): [Axis, Axis, Axis?] {
  const was =
    s.was !== null && ["bar", "line", "area"].includes(s.type) ? colorVals(s, s.was) : null;
  const n = [
    ...s.rules.map((u) => u.y),
    ...s.bands.flatMap((b) => [b.lo, b.hi]),
    ...(was ? shaped.cells.map((c) => was(shaped.categories[c.ci]!, shaped.series[c.si]!)) : []),
  ].filter((v): v is number => typeof v === "number");
  const n2 = s.y2Rules.map((u) => u.y);
  if (!n.length && !n2.length) return axes;
  return axes.map((a, i) => {
    // The right axis (bar y2) takes the { y2 } rules; the value axis the rest.
    const m = i === 2 ? n2 : n;
    return a?.kind === "linear" && m.length && (i === 2 || a.field === s.y)
      ? { ...a, domain: [Math.min(a.domain[0], ...m), Math.max(a.domain[1], ...m)] }
      : a;
  }) as [Axis, Axis, Axis?];
}

/**
 * "mean" for rules: the average of the plotted values of the active measure (visible series,
 * window and measure applied, the limit's Other left out); stacked: of the category totals.
 * Scatter averages y over the points it draws. NaN when nothing is plotted.
 */
function average(s: ResolvedSpec, shaped: Shaped): number {
  if (s.ratio) {
    // Total numerator over total denominator of the rows of the visible series.
    const on = new Set(shaped.visible.map((j) => shaped.series[j]));
    const a = agg("sum", true);
    for (const row of s.data)
      if (s.series === null || on.has(String(row[s.series]))) feed(a, row, s.y, s.ratio);
    return a.value() ?? NaN;
  }
  const by = new Map<number, number>();
  const add = (k: number, v: number) => by.set(k, (by.get(k) ?? 0) + v);
  if (s.type === "scatter") points(s, shaped).forEach((p, i) => add(i, p.y));
  else if (s.type === "beeswarm") {
    // One dot per row: the mean of the visible rows' values.
    const on = new Set(shaped.visible.map((j) => shaped.series[j]));
    s.data.forEach((row, i) => {
      const v = row[s.y];
      if (typeof v === "number" && (s.series === null || on.has(String(row[s.series])))) add(i, v);
    });
  } else
    shaped.cells.forEach((c, i) => {
      if (c.value !== null && shaped.categories[c.ci] !== OTHER)
        add(s.stack === true ? c.ci : i, c.value);
    });
  return [...by.values()].reduce((a, b) => a + b, 0) / by.size;
}

/** scatter trail points (MarkCtx.trails): the previous `trail` frames, every frame for a selected
 * name; under 300 px wide only a selected name's. */
function trailsOf(s: ResolvedSpec, sel: readonly Sel[] | undefined, W: number) {
  const out = new Map<string, { x: number; y: number; frame: number }[]>();
  if (!s.paths || !s.frame) return out;
  const fi = s.frame[2];
  const on = new Set((sel ?? []).flatMap((e) => (e.name == null ? [] : [String(e.name)])));
  for (const [n, p] of s.paths) {
    const all = on.has(n);
    if (!all && W < 300) continue;
    const pts = p.flatMap((q, i) =>
      q && i !== fi && (all || (i < fi && i >= fi - s.trail)) ? [{ ...q, frame: i }] : [],
    );
    if (pts.length) out.set(n, pts);
  }
  return out;
}

/** spec.params: a labelled range input per param, then Reset. Under 300 px wide they sit in a
 * native popover behind a button (popovertarget: no script, shadow-scoped id). */
function paramCtl(s: ResolvedSpec, W: number): string {
  if (!s.params.length) return "";
  const small = W < 300;
  const body =
    s.params
      .map((p) => {
        const f = new Map(p.format === undefined ? [] : [[p.id, p.format] as const]);
        const v = formatter({ ...s, format: f }, p.id)(p.value) + (p.suffix ?? "");
        return (
          `<label class="maya-param"><span>${esc(p.label)}</span>` +
          el("input", {
            type: "range",
            "data-maya": "param",
            "data-id": p.id,
            min: p.min,
            max: p.max,
            step: p.step,
            value: p.value,
            "aria-label": p.label,
            "aria-valuetext": v,
          }) +
          `<output>${esc(v)}</output></label>`
        );
      })
      .join("") +
    `<button type="button" class="maya-params-reset" data-maya="params-reset">${esc(t(s, "resetParams"))}</button>`;
  return (
    (small
      ? `<button type="button" class="maya-params-btn" popovertarget="maya-params">${esc(t(s, "params"))}</button>`
      : "") +
    el(
      "div",
      {
        class: "maya-params",
        "data-maya": "params",
        role: "group",
        "aria-label": t(s, "params"),
        id: small ? "maya-params" : null,
        popover: small ? "auto" : null,
      },
      body,
    )
  );
}

/** The frame control (spec.frameControl): Play, a range input, both, tabs (a select when the
 * tabs would not fit or the chart is under 300 px wide) or a select; each sets view.frame. */
function frameCtl(s: ResolvedSpec, labels: readonly string[], W: number): string {
  const i = s.frame![2];
  const name = t(s, "frames");
  const play = `<button type="button" class="maya-play" data-maya="play">${esc(t(s, "play"))}</button>`;
  const slider = el("input", {
    type: "range",
    class: "maya-frame",
    "data-maya": "frame",
    min: 0,
    max: labels.length - 1,
    step: 1,
    value: i,
    "aria-label": name,
    "aria-valuetext": labels[i],
  });
  const c = s.frameControl;
  // Play and the slider sit in one row, the slider followed by its current frame (aria-valuetext says it already).
  const now = `<output class="maya-frame-value" data-maya="frame-value" aria-hidden="true">${esc(labels[i]!)}</output>`;
  if (c === "play") return play;
  if (c === "slider") return slider + now;
  if (c === "both") return `<div class="maya-ctls">${play}${slider}${now}</div>`;
  return c === "tabs" && W >= 300 && labels.reduce((a, l) => a + tw(l, 24), 0) <= W
    ? radios(' data-maya="frame"', name, [...labels], i)
    : el(
        "select",
        { class: "maya-frame", "data-maya": "frame", "aria-label": name },
        labels.map((l, j) => el("option", { value: j, selected: j === i }, esc(l))).join(""),
      );
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

/** The kpi `back` toggle (aria-pressed: the back face shows). */
const flip = (s: ResolvedSpec, on: boolean) =>
  `<button type="button" class="maya-flip" data-maya="flip" aria-pressed="${on}">${esc(t(s, "flip"))}</button>`;

/** A breadcrumb nav: the root button (data-depth 0), then the trail; the last value is the current page. */
const trail = (label: string, root: string, values: readonly string[], axis = "") =>
  `<nav class="maya-crumbs"${axis && ` data-axis="${axis}"`} aria-label="${esc(label)}"><button type="button" data-depth="0">${esc(root)}</button>` +
  values
    .map(
      (v, i) =>
        `<span aria-hidden="true">›</span>` +
        (i === values.length - 1
          ? `<span aria-current="page">${esc(String(v))}</span>`
          : `<button type="button" data-depth="${i + 1}">${esc(String(v))}</button>`),
    )
    .join("") +
  `</nav>`;

/** line drillTo: the sub-spec over the drilled series' rows; `was: "previous"` reads the series
 * before it (first-appearance order) at the same x, under a NUL-prefixed field titled by its name. */
function drillSub(spec: ChartSpec, s: ResolvedSpec, value: string): ChartSpec {
  const sub = subSpec(spec, spec.drillTo!) as Omit<ChartSpec, "data">;
  const ser = s.series!;
  const rows = s.data.filter((r) => String(r[ser]) === value);
  if (sub.was !== "previous") return { ...sub, data: rows } as ChartSpec;
  const names = [...new Set(s.data.map((r) => String(r[ser])))];
  const p = names[names.indexOf(value) - 1];
  const { was: _, ...rest } = sub;
  if (p === undefined || !sub.x) return { ...rest, data: rows } as ChartSpec;
  const [x, y] = [sub.x, typeof sub.y === "string" ? sub.y : sub.y[0]!];
  const prev = new Map<string, number>();
  for (const r of s.data)
    if (String(r[ser]) === p && typeof r[y] === "number")
      prev.set(String(r[x]), (prev.get(String(r[x])) ?? 0) + (r[y] as number));
  // No shared x: nothing to compare, so no was (a field no row holds would fail validation).
  if (!rows.some((r) => prev.has(String(r[x])))) return { ...rest, data: rows } as ChartSpec;
  const k = "\u0000was";
  return {
    ...rest,
    was: k,
    titles: { ...rest.titles, [k]: p },
    data: rows.map((r) => (prev.has(String(r[x])) ? { ...r, [k]: prev.get(String(r[x]))! } : r)),
  } as ChartSpec;
}

/** A facet panel's spec: the chart over `rows` without what belongs to the whole (facet, panel
 * order, drill, title, params; their refs and scale are already applied), plus `extra`. */
function panelSpec(spec: ChartSpec, view: View | undefined, rows: readonly Row[], extra: object) {
  const [{ facet, facetScale, sort, limit, other, drill, drillOut, params, scale, ...rest }] =
    applyParams(spec, view);
  const { title, subtitle, description, ...keep } = rest;
  return { ...keep, ...extra, data: rows } as ChartSpec;
}

/** The value total of `rows` combined by the chart's aggregate (a facet panel's title). */
const totalOf = (s: ResolvedSpec, rows: readonly Row[]) => {
  const a = agg(s.aggregate, !!s.ratio);
  for (const row of rows) feed(a, row, s.y, s.ratio);
  return a.value();
};

function build(
  spec: ChartSpec,
  opts: RenderOptions | undefined,
  sheet: string | null,
  at?: Box & { facet?: string; row?: string },
): Parts {
  spec = unset(spec);
  validateSpec(spec);
  if (opts !== undefined) validateOptions(opts);
  const s0 = resolve(spec, opts?.view);
  const W = opts?.width ?? 640;
  const H = opts?.height ?? 320;
  // facet drill: the drilled panel, full size with its axes, is the whole chart; the params
  // controls stay the chart's.
  if (s0.facet && s0.drilled.length) {
    const { drill: _, ...view } = opts!.view!;
    const v = s0.drilled[0]!;
    const p = build(
      panelSpec(spec, opts?.view, s0.data, { title: t(s0, "panelOf", v, "{total}") }),
      { ...opts, view },
      sheet,
    );
    return {
      ...p,
      controls: paramCtl(s0, W) + p.controls,
      crumbs: trail(t(s0, "crumbs"), t(s0, "back"), [v]),
    };
  }
  // validateSpec guarantees the type is core or registered; a drilled hexmap resolves to bar.
  const mark = (Object.hasOwn(CORE, s0.type) ? CORE[s0.type] : MODULES.get(s0.type))!;
  // line drillTo: the drilled series' sub-chart is the whole chart, under its breadcrumb.
  const dv = spec.drillTo && opts?.view?.drill?.[0];
  if (dv) {
    const { drill: _, ...view } = opts!.view!;
    const p = build(drillSub(spec, s0, dv), { ...opts, view }, sheet);
    return { ...p, crumbs: trail(t(s0, "crumbs"), t(s0, "back"), [dv]) };
  }
  // kpi back face: the back spec over the front's rows (frame applied) is the whole chart; only
  // the flip button is the front's.
  if (spec.back && opts?.view?.face === "back") {
    const { face: _, ...view } = opts.view;
    const p = build(
      { ...subSpec(spec, spec.back, true), data: s0.data } as ChartSpec,
      { ...opts, view },
      sheet,
    );
    return { ...p, controls: p.controls + flip(s0, true) };
  }
  // ponytail: plot width is only known after shape (tick labels set the margins); W - 56 is the
  // usual plot of a 4-digit y axis, and the point budget needs no more than that.
  const shaped = shape(s0, { ...opts?.view, plotWidth: W - 56, height: H });
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
  if (!["scatter", "beeswarm", "kpi", "ridgeline", "table", "list"].includes(s.type))
    cap(shaped.cells.length);

  // Formatters are cached per (field, step): marks call fmt once per value.
  const fmts = new Map<string, (v: unknown) => string>();
  // Time categories are strings: format them from their parsed ms (a bare date-time is UTC).
  const ms = new Map(shaped.time?.map((v, i) => [shaped.categories[i]!, v]));
  const fmt = (field: string, v: unknown, step?: number) => {
    if (v === OTHER) return t(s, "other");
    if (v === TOTAL) return t(s, "total");
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
  // No rows to draw: the svg is the "no data" text.
  const empty = !s.data.some((r) =>
    [...(s.ratio ?? s.measures), s.y2].some((m) => typeof r[m!] === "number"),
  );
  // Data tokens in the title and subtitle (a11y.ts resolveTokens), so the accessible name matches.
  // With no rows a text holding a token is dropped rather than shown raw.
  // {total.base}: {total} of the chart without `scale` (resolved and shaped once, on first use).
  let base: [ResolvedSpec, Shaped] | undefined;
  const BASE = /\{total\.base((?::[^{}]*)?)\}/g;
  const tok = (v: string | null) =>
    v &&
    (empty && (v.search(TOKEN) >= 0 || v.search(BASE) >= 0)
      ? null
      : resolveTokens(
          v.replace(BASE, (m, q: string) => {
            const { scale: _, ...plain } = spec;
            base ??= ((b) => [b, shape(b, { ...opts?.view, plotWidth: W - 56, height: H })])(
              resolve(plain as ChartSpec, opts?.view),
            );
            const r = resolveTokens(`{total${q}}`, base[0], base[1], fmt, () => NaN);
            return r === `{total${q}}` ? m : r;
          }),
          s,
          shaped,
          fmt,
          () => average(s, shaped),
          s.type === "scatter" ? () => points(s, shaped) : undefined,
        ));
  s = { ...s, title: tok(s.title), subtitle: tok(s.subtitle) };
  const fv = fr?.[1].length ? fmt(fr[0], fr[1][fr[2]]) : null;
  if (fv !== null) s = { ...s, title: t(s, "frameOf", titleText(s), fv) };

  // colorBy: sign/thresholds give tone; a numeric field gives a 0..9 bucket over its extent.
  const cb = s.colorBy;
  let lo = Infinity;
  let hi = -Infinity;
  if (typeof cb === "string" && cb !== "sign")
    for (const row of s.data) {
      const v = row[cb];
      if (typeof v === "number") ((lo = Math.min(lo, v)), (hi = Math.max(hi, v)));
    }
  // Thresholds: at or past target good, else at or past warn warn, else bad; "lower" mirrors it.
  const tone = (v: number, field = s.y): Tone | null => {
    if (cb === "sign") return v < 0 ? "bad" : v > 0 ? "good" : "zero";
    const g = s.goals.get(field);
    if (!g || g.target === null) return null;
    const d = g.better === "lower" ? -1 : 1;
    return d * v >= d * g.target ? "good" : g.warn !== null && d * v >= d * g.warn ? "warn" : "bad";
  };
  // Tone words (never colour alone): good is "above target" unless lower is better.
  const toneWord = (n: Exclude<Tone, "zero">, field = s.y) =>
    t(
      s,
      cb === "sign"
        ? n === "good"
          ? "positive"
          : "negative"
        : n === "warn"
          ? "near"
          : (n === "good") === (s.goals.get(field)?.better !== "lower")
            ? "above"
            : "below",
    );
  const toneText = (v: number, field = s.y) => {
    const n = tone(v, field);
    return n && n !== "zero" ? toneWord(n, field) : "";
  };
  const goal = typeof cb === "object" ? cb : null;

  // Value labels: estimated boxes, a later label that overlaps a placed one (or leaves the svg) is dropped.
  const boxes: number[][] = [];
  // Claim the 14 px box at (l, tp) when it is inside the svg and free.
  const fits = (l: number, tp: number, w: number) => {
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
    return true;
  };
  let labels = "";
  const label = (
    x: number,
    y: number,
    text: string,
    place: LabelPlace,
    k?: string,
    ann?: Annotate,
  ) => {
    const w = tw(text);
    const l = place === "start" ? x : place === "end" ? x - w : x - w / 2;
    const tp = place === "above" ? y - 16 : place === "below" ? y + 2 : y - 7;
    if (!fits(l, tp, w)) return false;
    labels += el(
      "text",
      {
        x: r(x),
        y: r(place === "above" ? y - 4 : place === "below" ? y + 13 : y),
        "text-anchor": place === "start" || place === "end" ? place : "middle",
        "dominant-baseline": place === "above" || place === "below" ? null : "middle",
        "data-in": place === "center", // sits on a mark: no halo
        "data-key": k,
        "data-ann": ann,
      },
      esc(text),
    );
    return true;
  };

  // No rows, no axes: the svg is the "no data" text (and the element's slots-only first pass).
  const ends =
    spec.endLabels === false || typeof spec.legend === "string" || s.facet
      ? null
      : mark.ends?.(s, shaped, fmt);
  const gutter = ends?.length
    ? endGutter(ends, W) ||
      (mark.ends === line.ends ? Math.max(...ends.map((e) => tw(e[1]))) + 14 : 0)
    : 0;
  // facet: the root has no axes; each panel draws its own.
  const ax = mark.axes && !empty && !s.facet ? mark.axes(s, shaped) : null;
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
  const f = ax ? frame(s0, withRules(s, shaped, ax), { width: W, height: H, gutter }, fmt) : null;
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
    trails: trailsOf(s, opts?.selected, W),
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

  // facet: one panel per value in a grid, each a nested build in its own box; the root draws the
  // panel titles. Returns the root's MarkOut and the panels' svgs.
  const facets = (): [MarkOut, string] => {
    const { field: ff, scale, sort, limit } = s.facet!;
    const [x, ser] = [s.x, s.series];
    // Rows per value, each led by pad rows (every category, every series, y unset) so every panel
    // has the same categories and series in the same order: data-c and data-s line up.
    const by = memo(s.data, `facet${ff}\0${x}\0${ser}`, () => {
      const cx = new Map<string, Row[string]>();
      const cs = new Map<string, Row[string]>();
      for (const row of s.data)
        if (row[ff] != null) {
          if (!cx.has(String(row[x]))) cx.set(String(row[x]), row[x]);
          if (ser && !cs.has(String(row[ser]))) cs.set(String(row[ser]), row[ser]);
        }
      const [x0] = cx.values();
      const [s0] = cs.values();
      const pads: Row[] = [
        ...[...cs.values()].map((v) => ({ [x]: x0, [ser!]: v })),
        ...[...cx.values()].map((v) => (ser ? { [x]: v, [ser]: s0 } : { [x]: v })),
      ];
      const m = new Map<string, Row[]>();
      for (const row of s.data) {
        if (row[ff] == null) continue;
        const k = String(row[ff]);
        let a = m.get(k);
        if (!a) m.set(k, (a = [...pads]));
        a.push(row);
      }
      return m;
    });
    const tot = new Map([...by].map(([k, rs]) => [k, totalOf(s, rs)]));
    const desc = (a: string, b: string) => (tot.get(b) ?? 0) - (tot.get(a) ?? 0);
    let vals = [...by.keys()];
    if (sort) vals.sort((a, b) => (sort === "asc" ? -1 : 1) * desc(a, b));
    if (limit !== null) {
      const top = new Set([...vals].sort(desc).slice(0, limit));
      vals = vals.filter((v) => top.has(v));
    }
    const n = vals.length;
    // ponytail: fixed panel minimums (160 px wide, 110 tall); past them the grid scrolls, and
    // under 240 x 150 a panel is a sparkline (no axes, grid or labels).
    // Columns: about the tile's aspect per panel, at most one per 160 px.
    let cols = Math.max(1, Math.min(n, Math.floor(W / 160), Math.ceil(Math.sqrt((n * W) / H))));
    // Panels of 240 px keep their axes: fewer columns, when the rows still get 150 px each.
    const wide = Math.floor(W / 240);
    if (wide >= 1 && wide < cols && H / Math.ceil(n / wide) >= 150) cols = wide;
    const pw = W / cols;
    const ph = Math.max(110, H / Math.ceil(n / cols));
    const spark = pw < 240 || ph < 150;
    const { measure, hidden, stack } = opts?.view ?? {};
    const pv: View = {
      ...(measure !== undefined && { measure }),
      ...(hidden && { hidden }),
      ...(stack !== undefined && { stack }),
    };
    const extra = {
      legend: false,
      table: false,
      endLabels: false,
      ...(spark && { xAxis: false, yAxis: false, grid: false, labels: false, annotate: [] }),
    };
    // The title is "name, total" in about 6.6 px a character; a long name is cut, never the total.
    const cw = 6.6;
    const room = Math.floor((pw - 8) / cw);
    const panelTitle = (v: string) => {
      const [name, tot1] = [fmt(ff, v), fmt(s.y, tot.get(v))];
      const over = [...t(s, "panelOf", name, tot1)].length - room;
      return t(s, "panelOf", over > 0 ? clip(name, [...name].length - over) : name, tot1);
    };
    const specs = vals.map((v) =>
      panelSpec(spec, opts?.view, by.get(v)!, { ...extra, title: panelTitle(v) }),
    );
    // shared: one value domain over every panel (rules and was values included), made nice.
    let dom: readonly [number, number] | null = null;
    if (scale === "shared" && !s.yDomain && mark.axes) {
      let [lo, hi] = [Infinity, -Infinity];
      for (const p of specs) {
        const rs = resolve(p, pv);
        const sh = shape(rs, { ...pv, plotWidth: pw - 56, height: ph });
        for (const a of withRules(rs, sh, mark.axes(rs, sh)))
          if (a?.kind === "linear" && a.field === rs.y)
            [lo, hi] = [Math.min(lo, a.domain[0]), Math.max(hi, a.domain[1])];
      }
      if (lo < hi) dom = s.yScale === "log" ? [lo, hi] : niceTicks(lo, hi).domain;
    }
    let titles = "";
    let svgs = "";
    specs.forEach((p, i) => {
      const v = vals[i]!;
      const [bx, bt] = [(i % cols) * pw, Math.floor(i / cols) * ph];
      titles += el(
        "text",
        { "data-facet": v, x: r(bx + 4), y: r(bt + 13) },
        esc(clip(p.title!, room)),
      );
      const box = { x: bx, y: bt + 18, w: pw - 8, h: ph - 26, facet: v };
      // Keys gain the panel's value as a first part, so they are unique across panels.
      svgs += build(
        dom ? { ...p, yDomain: dom } : p,
        { width: box.w, height: box.h, view: pv },
        null,
        box,
      ).svg.replaceAll(' data-key="', ` data-key="${key(v)}~`);
    });
    const note = t(s, "facets", s.titles.get(ff) ?? ff, n);
    return [{ marks: "", hits: "", labels: titles, note, height: Math.ceil(n / cols) * ph }, svgs];
  };

  let svgH = H;
  const warnings: string[] = [];
  let markLegend: string | null = null;
  let markTable: MarkOut["table"];
  let note = "";
  // rule sentences for the auto description, after the frame's
  let said = fv === null ? "" : ` ${t(s, "frame", fr![2] + 1, fr![1].length)}.`;
  let body = "";
  if (empty) {
    // Wrapped to the box (#91.9): "\n" breaks, then words fill lines of n estimated characters;
    // a longer word is cut into n-character pieces. One line keeps the plain <text>.
    const n = Math.max(4, Math.floor((W - 16) / 7.2));
    const lines = (s.filter ? t(s, "noMatch", s.filter) : t(s, "noData")).split("\n").flatMap((p) =>
      p
        .split(" ")
        .flatMap((w) => w.match(new RegExp(`.{1,${n}}`, "gu")) ?? [])
        .reduce(
          (a: string[], w) => {
            const l = a.at(-1)!;
            if (l && [...l].length + 1 + [...w].length <= n) a[a.length - 1] = `${l} ${w}`;
            else if (l) a.push(w);
            else a[a.length - 1] = w;
            return a;
          },
          [""],
        ),
    );
    body = el(
      "text",
      {
        "data-maya": "empty",
        x: W / 2,
        y: H / 2,
        "text-anchor": "middle",
        "dominant-baseline": "middle",
      },
      lines.length < 2
        ? esc(lines[0] ?? "")
        : lines
            .map((l, i) =>
              el("tspan", { x: W / 2, dy: i ? "1.2em" : `${-0.6 * (lines.length - 1)}em` }, esc(l)),
            )
            .join(""),
    );
  } else {
    const g = (name: string, c: string) => el("g", { "data-maya": name }, c);
    // Reference lines, drawn over the marks.
    // ponytail: at most 4. Bands first (under the lines), then value lines, then category (x) lines.
    let rules = "";
    // Rule labels claim their box after the marks' labels (annotations, value labels): the first
    // free spot [x, top, end-anchored] inside the plot's width wins, else the label is dropped (#91.2).
    // ponytail: they dodge labels, not marks (a bubble under a rule label keeps the label's halo).
    const late: (() => string)[] = [];
    type Spot = [text: string, x: number, top: number, end: boolean];
    const put = ([text, ax, tp, end]: Spot) =>
      el("text", { x: r(ax), y: r(tp + 10), "text-anchor": end ? "end" : "start" }, esc(text));
    // `force`: drawn when no spot is free (the halo keeps it legible over what it covers).
    const spots = (at: Spot[], force?: Spot) =>
      late.push(() => {
        for (const a of at) {
          const w = tw(a[0]);
          const l = a[3] ? a[1] - w : a[1];
          if (l >= plot.x - 1 && l + w <= plot.x + plot.w + 1 && fits(l, a[2], w)) return put(a);
        }
        return force ? put(force) : "";
      });
    // Band and x-rule labels step down a row when their spot is taken.
    const rows = (text: string, ax: number, tp: number, end: boolean): Spot[] =>
      [0, 1, 2, 3].map((k) => [text, ax, tp + 14 * k, end]);
    const tag = (text: string, ax: number, tp: number, end: boolean) =>
      spots(rows(text, ax, tp, end));
    // A beeswarm lays its values along the bottom axis.
    const hz = s.horizontal || s.type == "beeswarm";
    const v = hz ? f?.x : f?.y;
    const cat = hz ? f?.y : f?.x;
    const [x0, y0] = [r(plot.x + plot.w), r(plot.y)];
    // A line across the plot at p on the x axis (vertical) or the y axis, and the box from p to q.
    const seg = (p: number, onX: boolean) =>
      onX
        ? { x1: r(p), x2: r(p), y1: y0, y2: r(plot.y + plot.h) }
        : { x1: r(plot.x), x2: x0, y1: r(p), y2: r(p) };
    // "Target 80%" unless the label already carries the value ("80%": shown once; a word like a
    // category "c" must be the whole label, a number may sit inside it).
    const lab = (name: string | null | undefined, val: string) =>
      name
        ? name === val || (/\d/.test(val) && name.includes(val))
          ? name
          : `${name} ${val}`
        : val;
    const say = (name: string | null, val: string) => (said += ` ${name ?? t(s, "rule")}: ${val}.`);
    if (v && !("bandwidth" in v)) {
      s.bands.forEach((u) => {
        const [lo, hi] = [Math.max(u.lo, v.domain[0]), Math.min(u.hi, v.domain[1])];
        if (!(lo <= hi)) return;
        const [p, q] = [v.of(lo), v.of(hi)].sort((a, b) => a - b) as [number, number];
        say(u.label, t(s, "fromTo", fmt(s.y, u.lo), fmt(s.y, u.hi)));
        rules += el(
          "rect",
          hz
            ? { "data-band": true, x: r(p), y: y0, width: r(q - p), height: r(plot.h) }
            : { "data-band": true, x: r(plot.x), y: r(p), width: r(plot.w), height: r(q - p) },
        );
        if (u.label) tag(u.label, hz ? q - 4 : plot.x + plot.w, hz ? plot.y : p + 2, true);
      });
      s.rules.forEach((u) => {
        const at = u.y === "mean" ? average(s, shaped) : u.y;
        // outside a yDomain, or NaN (no data)
        if (!((at - v.domain[0]) * (at - v.domain[1]) <= 0)) return;
        const p = r(v.of(at));
        const name = u.label ?? (u.y === "mean" ? t(s, "mean") : null);
        const val = fmt(s.y, at);
        say(name, val);
        rules += el("line", seg(p, hz));
        // Above the line at its end, else at its start, else below; a vertical line: beside it at
        // the top (either side), stepping down along it.
        const text = lab(name, val);
        spots(
          hz
            ? [0, 1, 2, 3].flatMap((k): Spot[] => [
                [text, p - 4, y0 + 14 * k, true],
                [text, p + 4, y0 + 14 * k, false],
              ])
            : [
                [text, x0, p - 14, true],
                [text, plot.x, p - 14, false],
                [text, x0, p + 2, true],
                [text, plot.x, p + 2, false],
              ],
        );
      });
    }
    // { y2 } rules: across the right axis (bar with y2), labelled by format[y2].
    const v2 = f?.y2;
    if (v2 && s.y2)
      s.y2Rules.forEach((u) => {
        if (!((u.y - v2.domain[0]) * (u.y - v2.domain[1]) <= 0)) return;
        const p = r(v2.of(u.y));
        const val = fmt(s.y2!, u.y);
        say(u.label, val);
        rules += el("line", { "data-y2": true, ...seg(p, false) });
        const text = lab(u.label, val);
        spots([
          [text, x0, p - 14, true],
          [text, plot.x, p - 14, false],
          [text, x0, p + 2, true],
          [text, plot.x, p + 2, false],
        ]);
      });
    // x rules: a band's centre (or a time or number's place) on the category axis.
    if (cat)
      s.xRules.forEach((u) => {
        const ms = toTime(u.x);
        const p =
          "bandwidth" in cat
            ? cat.domain.includes(String(u.x))
              ? cat.at(cat.domain.indexOf(String(u.x))) + cat.bandwidth / 2
              : "kind" in cat && ms !== null
                ? (cat as TimeScale).of(ms)
                : NaN
            : typeof u.x === "number" && (u.x - cat.domain[0]) * (u.x - cat.domain[1]) <= 0
              ? cat.of(u.x)
              : NaN;
        const [lo, hi] = hz ? [plot.y, plot.y + plot.h] : [plot.x, plot.x + plot.w];
        if (!(p >= lo && p <= hi)) return;
        const at = r(p);
        const val = fmt(s.x, u.x);
        const text = lab(u.label, val);
        say(u.label, val);
        rules += el("line", { "data-xrule": true, ...seg(at, !hz) });
        // Beside the line at the top, right then left, stepping down; then the label alone, then
        // the value alone; none free: the shortest clamped inside the plot at the top (M3).
        const texts = [text, ...(u.label ? [u.label, val] : [])];
        if (hz) tag(text, plot.x + plot.w, at - 14, true);
        else {
          const short = texts.reduce((a, b) => (tw(b) < tw(a) ? b : a));
          const l = Math.max(plot.x, Math.min(at - tw(short) / 2, plot.x + plot.w - tw(short)));
          spots(
            texts.flatMap((x) => [
              ...rows(x, at + 4, plot.y, false),
              ...rows(x, at - 4, plot.y, true),
            ]),
            [short, l, plot.y, false],
          );
        }
      });
    // Slope rules and annotations join the description, like bands and x rules.
    // The slope as y per x (text.perX); "mean" is sum y / sum x of the drawn points, as scatter draws it.
    if (s.slopes.length) {
      const ps = points(s, shaped);
      const mk = ps.reduce((a, p) => a + p.y, 0) / ps.reduce((a, p) => a + p.x, 0);
      for (const u of s.slopes) {
        const k = u.k === "mean" ? mk : u.k;
        if (k && isFinite(k) && s.xScale === s.yScale)
          say(
            u.label ?? (u.k === "mean" ? t(s, "mean") : null),
            t(s, "perX", fmt(s.y, +k.toPrecision(3)), s.titles.get(s.x) ?? s.x) +
              (u.b ? ` + ${fmt(s.y, u.b)}` : ""),
          );
      }
    }
    if (s.annotate.length)
      said += ` ${t(s, "labelled", s.annotate.map((k) => t(s, k)).join(", "))}.`;
    for (const n of s.notes) said += ` ${n.text}: ${fmt(s.x, n.x)}.`;
    // facet: the panels are nested svgs after the hits group; the root draws their titles.
    const fc = s.facet ? facets() : null;
    const m = fc ? fc[0] : mark.draw(ctx);
    rules += late.map((f) => f()).join("");
    // Scatter and modules draw per row/node. Counted in place: a split would copy every mark.
    let nm = 0;
    for (let i = 0; (i = m.marks.indexOf(' data-maya="mark"', i) + 1);) nm++;
    cap(nm);
    markLegend = m.legend ?? null;
    markTable = m.table;
    note = m.note ?? "";
    svgH = m.height ?? H;
    // table expand: the open row's sub-chart, over that row's rows, in the box the table left.
    const ex = spec.expand;
    let sub = fc?.[1] ?? "";
    if (m.expand && s.expanded[0] !== undefined && typeof ex === "object")
      try {
        const rows = s.data.filter((r) => String(r[s.x]) === s.expanded[0]);
        const b = m.expand;
        sub = build(
          { ...subSpec(spec, ex), data: rows } as ChartSpec,
          { width: b.w, height: b.h },
          null,
          { ...b, row: s.expanded[0] },
        ).svg;
      } catch (e) {
        // One row's rows can miss a field the whole table has: the row stays shut, the host is told.
        if (!(e instanceof Error)) throw e;
        warnings.push(`table expand: ${e.message.split("\n")[0]}`);
      }
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
      g("hits", m.hits) +
      sub;
  }

  // :host resolves --maya-series-1: var(--maya-accent) above these vars, so an accent override
  // sets slot 1 itself unless colors does. Later wins: colors array < theme < colors map (#89).
  const vars: [string, string][] = [];
  const list = Array.isArray(s.colors) ? (s.colors as readonly string[]) : [s.theme.accent];
  list.forEach((c, i) => c && vars.push([`--maya-series-${i + 1}`, c]));
  for (const [k, v] of Object.entries(s.theme))
    // numeric "tabular" | "proportional" is written as its font-variant-numeric value.
    vars.push([`--maya-${kebab(k)}`, k === "numeric" ? `${v}-nums` : String(v)]);
  // Slots a colors map key set: svg[data-mapped~="n"] lets the key beat colorBy tones (theme.ts).
  const mapped = new Set<number>();
  if (s.colors && !Array.isArray(s.colors))
    // ponytail: slot = the series' first-appearance index, so reordered rows move colours.
    // Waffle slots follow categories (data-s = category index), so its keys map against those.
    for (const [k, c] of s.colors as ReadonlyMap<string, string>) {
      // Path types: the slot of the name among all rows (stable through drill and filters).
      const j = s.slots.size
        ? (s.slots.get(k) ?? -1)
        : (s.type === "waffle" ? shaped.categories : shaped.series).indexOf(k);
      if (j >= 0) (vars.push([`--maya-series-${(j % 8) + 1}`, c]), mapped.add(j % 8));
    }
  const style = vars.map(([k, v]) => `${k}:${v};`).join("");

  const svg = el(
    "svg",
    {
      class: at ? null : sheet === null ? "maya-svg" : "maya-root maya-svg",
      // A table row's sub-chart: a nested svg placed in the table's svg.
      "data-maya": at ? (at.facet === undefined ? "expand" : "panel") : null,
      "data-facet": at?.facet,
      "data-row": at?.row,
      x: at ? r(at.x) : null,
      y: at ? r(at.y) : null,
      viewBox: `0 0 ${W} ${svgH}`,
      width: W,
      height: svgH,
      // A table has focusable sort headers, which an img role would hide (children presentational).
      role: s.type === "table" || (s.facet && !empty) ? "figure" : "img",
      // Standalone SVGs may share a page, so they can't use fixed ids; shadow roots scope them.
      // aria-label, not a <title>, in the element path: a root <title> pops the browser's own
      // tooltip over every hover. A standalone svg keeps the <title> too, for file viewers.
      "aria-label": titleText(s),
      "aria-describedby": sheet === null && !at ? "maya-d" : null,
      tabindex: (sheet === null && !at) || at?.facet !== undefined ? "0" : null,
      style: sheet === null ? null : style || null,
      "data-plot": `${r(plot.x)} ${r(plot.y)} ${r(plot.w)} ${r(plot.h)}`,
      ...f?.attrs,
      // Units have no axes in the waffle and bars forms; data-n keeps the element's stagger on.
      ...(s.type === "units" && !f?.attrs["data-n"] ? { "data-n": shaped.series.length } : {}),
      "data-dir": s.horizontal ? "h" : null,
      "data-stack": s.stack || null,
      // colorBy "sign": tones are directions (theme up/down, not good/bad).
      "data-sign": cb === "sign" || null,
      "data-mapped": [...mapped].join(" ") || null,
      // A line path: its point circles are hidden until active (one search, not a CSS :has).
      "data-pt": body.includes('data-maya="line"') || null,
      // ponytail: over 500 marks the svg is data-still: hover dim and glide are instant (theme.ts, NON-FEATURES.md).
      "data-still": body.split('data-maya="mark"').length > 501 || null,
      // A click can drill further (pointer cursor on marks): "series" when the gesture pushes the
      // mark's series (seriesPath, drillTo), else empty (its category or branch).
      "data-drill": s.drillOn === "x" || s.drillOn,
      // heatmap xPath: a column header click drills the columns.
      "data-xdrill": (s.drill && s.xPath.length > 1) || null,
      // table page or scroll: the svg is as tall as its rows and the box scrolls.
      "data-scroll": s.scroll || svgH > H || null,
      // table expand, list: rows open on click or Enter.
      "data-expand": s.expand || null,
    },
    (sheet ? `<style>${sheet}</style>` : "") +
      (sheet === null ? "" : el("title", {}, esc(titleText(s)))) +
      el(
        "desc",
        { id: sheet === null && !at ? "maya-d" : null },
        esc(
          describe(s, shaped, fmt, s.radar ? "Radar" : mark.noun) +
            (s.description === null ? (note && " " + note) + said : ""),
        ),
      ) +
      body,
  );

  let legend = "";
  let tbl: string | undefined;
  if (
    (s.series !== null || s.y2 !== null) &&
    s.legend &&
    // A drilled marimekko tints its segments from the column colour, so slot swatches would lie.
    !(s.type === "marimekko" && s.drilled.length) &&
    (!gutter || W < 400 || spec.legend || ends!.some((e) => !endFits(e, gutter)))
  )
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
              "data-dash": s.dash.has(k),
              "data-em": s.emphasis.has(k),
              // With a dashed series the solid ones get a line key too, so keys differ only solid vs dashed.
              "data-line": !!s.dash.size && !s.dash.has(k),
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
  else if (
    spec.legend !== false &&
    cb !== null &&
    s.series === null &&
    s.type !== "kpi" &&
    s.type !== "gauge"
  )
    legend =
      cb === "sign" || goal?.target != null
        ? `<div class="maya-legend" data-maya="tone"${cb === "sign" ? " data-sign" : ""}>` +
          // Orbit and constellation colour by a measure the reader cannot guess: name it.
          (cb === "sign" && (s.type === "orbit" || s.type === "constellation")
            ? `<b>${esc(s.titles.get(s.y2 ?? s.y) ?? s.y2 ?? s.y)}</b>`
            : "") +
          (goal?.warn != null ? (["good", "warn", "bad"] as const) : (["good", "bad"] as const))
            .map((n) => `<span data-tone="${n}"><i></i>${esc(toneWord(n))}</span>`)
            .join("") +
          `</div>`
        : typeof cb === "string" && hi > lo
          ? `<div class="maya-legend" data-maya="ramp"><b>${esc(s.titles.get(cb) ?? cb)}</b><span>${esc(fmt(cb, lo))}</span><i></i><span>${esc(fmt(cb, hi))}</span></div>`
          : "";
  // A mark legend replaces the normal one, except scatter's size key, which stacks below it.
  if (markLegend !== null && spec.legend !== false)
    legend = s.type === "scatter" ? legend + markLegend : markLegend;
  // spec.was: a dashed swatch named by the was title says what the ghosts are.
  if (s.was !== null && ["bar", "line", "area"].includes(s.type) && spec.legend !== false)
    legend += `<div class="maya-legend"><span data-past${s.type === "bar" ? (s.series && !s.stack ? " data-tick" : "") : " data-line"}><i></i>${esc(s.titles.get(s.was) ?? s.was)}</span></div>`;
  return {
    svg,
    // Nothing to draw: the empty state stands alone (#64).
    legend: empty ? "" : legend,
    // params first: the levers sit above the other controls.
    controls:
      paramCtl(s, W) +
      // Two or more controls (radiogroups, frame control, flip) share a row (.maya-ctls); one stands alone.
      ((g) => (g.length > 1 ? `<div class="maya-ctls">${g.join("")}</div>` : g.join("")))(
        [
          s.measures.length > 1 && (!ALL_Y.includes(s.type) || s.toggle)
            ? radios(
                "",
                t(s, "measures"),
                s.measures.map((m) => s.titles.get(m) ?? m),
                s.measure,
              )
            : "",
          s.forms.length > 1
            ? radios(
                ' data-maya="form"',
                t(s, "forms"),
                s.forms.map((f) => t(s, f)),
                s.form,
              )
            : "",
          s.stacks.length > 1
            ? radios(
                ' data-maya="stack"',
                t(s, "stacks"),
                // "percent" and "stream" are their own text keys.
                s.stacks.map((m) => t(s, m === true ? "stacked" : m === false ? "unstacked" : m)),
                s.stacks.indexOf(s.stack),
              )
            : "",
          s.facet && s.facet.scales.length > 1
            ? radios(
                ' data-maya="facetScale"',
                t(s, "facetScales"),
                s.facet.scales.map((m) => t(s, m)),
                s.facet.scales.indexOf(s.facet.scale),
              )
            : "",
          s.filter !== null
            ? el("input", {
                type: "search",
                class: "maya-filter",
                "data-maya": "filter",
                "aria-label": t(s, "filter"),
                placeholder: t(s, "filter"),
                value: s.filter,
              })
            : "",
          // The filter, the frame control and the kpi flip button share the row with the toggles.
          fr && fr[1].length > 1
            ? frameCtl(
                s,
                fr[1].map((v) => fmt(fr[0], v)),
                W,
              )
            : "",
          spec.back ? flip(s, false) : "",
        ].filter(Boolean),
      ),
    // root: nothing reserved (#66.3). heatmap xPath columns get their own nav (data-axis="x"),
    // its root button named by the first column level.
    crumbs:
      (s.drilled.length
        ? trail(
            t(s, "crumbs"),
            // Two trails (heatmap xPath): each starts with its level's title.
            spec.path && (spec.xPath || s.type === "heatmap")
              ? (s.titles.get(spec.path[0]!) ?? spec.path[0]!)
              : t(s, "back"),
            s.drilled,
          )
        : "") +
      (s.xDrilled.length
        ? trail(t(s, "crumbsX"), s.titles.get(spec.xPath![0]!) ?? spec.xPath![0]!, s.xDrilled, "x")
        : ""),
    // Built on first read: the element inserts the table when the browser is idle.
    get table() {
      return (tbl ??= s.table ? dataTable(s, shaped, fmt, toneText, markTable) : "");
    },
    title:
      (s.title === null ? "" : `<div class="maya-title">${esc(s.title)}</div>`) +
      (s.subtitle === null ? "" : `<p class="maya-sub">${esc(s.subtitle)}</p>`),
    ...(s.legendAt === "top" ? {} : { legendAt: s.legendAt }),
    style,
    vars,
    warnings: [
      ...warnings,
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
    `${sheet ? `<style${n}>${sheet}</style>` : ""}<div class="maya"${parts.legendAt ? ` data-legend="${parts.legendAt}"` : ""}>${parts.title}${parts.controls}${parts.legend}${parts.crumbs}` +
    `<div class="maya-box">${parts.svg}</div>${parts.table}` +
    `<div class="maya-sr" data-maya="live" aria-live="polite"></div>` +
    `<div class="maya-probe" data-maya="probe"></div><div class="maya-tip" popover="manual" role="tooltip"></div></div>`
  );
}

/** Rows cut to the fields the spec references (no data leakage into SSR HTML). */
function project(spec: ChartSpec): ChartSpec {
  const fields = used(spec);
  return {
    ...spec,
    // A theme name is resolved here: the page that hydrates may not have registered it.
    ...(spec.theme === undefined || spec.theme === null ? {} : { theme: themeOf(spec.theme) }),
    data: spec.data.map((row) =>
      Object.fromEntries(Object.entries(row).filter(([k]) => fields.has(k))),
    ),
  };
}

/** Every field a spec references (sub-charts too). */
function used(spec: Omit<ChartSpec, "data">): Set<unknown> {
  const keep = (o: object | string | undefined) => (typeof o === "object" ? Object.keys(o) : []);
  const was = spec.was;
  return new Set<unknown>([
    spec.x,
    ...(typeof spec.y === "string" ? [spec.y] : spec.y),
    spec.series,
    spec.y2,
    ...ratios(spec.aggregate).flatMap(([, r]) => r),
    ...(typeof was === "object"
      ? typeof was.by === "string"
        ? [was.by]
        : Object.values(was)
      : [was]),
    ...(typeof spec.tooltip === "object"
      ? spec.tooltip.fields.flatMap((f) => (typeof f === "string" ? [f] : f.ratio))
      : []),
    typeof spec.select === "object" ? spec.select.peers : undefined,
    spec.frame,
    spec.facet,
    ...keep(spec.scale?.where),
    spec.size,
    spec.name,
    ...(spec.path ?? []),
    ...(spec.seriesPath ?? []),
    ...(spec.xPath ?? []),
    ...(spec.columns ?? []),
    ...Object.values(spec.cells ?? {}).flatMap((c) => [c.field, c.by]),
    spec.body,
    spec.rowFormat,
    typeof spec.colorBy === "string" ? spec.colorBy : undefined,
    ...keep(spec.format),
    ...keep(spec.titles),
    ...(spec.back ? used(spec.back) : []),
    ...(typeof spec.expand === "object" ? used(spec.expand) : []),
    ...(spec.drillTo ? used(spec.drillTo) : []),
  ]);
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
