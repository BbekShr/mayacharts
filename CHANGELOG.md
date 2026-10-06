# Changelog

All notable changes to mayaCharts are documented here.

The format is based on Keep a Changelog and adheres to semantic versioning. Breaking changes are called out explicitly pre-1.0.

## Unreleased

### Added

- `rules` draws up to 4 reference lines across the value axis on bar (horizontal too), line, area and scatter: `rules: [100, "mean"]` or `rules: [{ y: 100, label: "Target" }]`. `"mean"` is the average of the visible values of the active measure (stacked: of the category totals) and is labelled "Average" by default. Each line shows its formatted value beside its label ("Target 100"). A numeric rule widens the value axis so a target above the data stays visible; a fixed `yDomain` wins and a rule outside it is not drawn. Each drawn rule adds a sentence to the auto description ("Target: 100."). New `text` keys `mean` and `rule`. Specs without `rules` render exactly as before.
- `stack: "percent"` on bar and area shows each category's visible values as shares of its total: the value axis runs 0 to 100%, a hidden series renormalises the rest, and y is formatted as percent unless `format` sets it. Labels, tooltips and the data table show the share, not the raw value. Negative values are shares of the category's summed magnitudes and stack below 0. Numeric `rules` are shares (0.5 is 50%); `"mean"` is the mean share of the drawn segments, since every category totals 100%.
- `frame: "<field>"` (bar, line, area, scatter, dumbbell) splits the rows into one frame per distinct value, in data order. A render shows one frame, the last by default; `view.frame` (an index, larger values clamp to the last) picks another, so SSR can render any frame. The title becomes the title plus the formatted frame value (new `text.frameOf`, "{0}, {1}"), the auto description adds "Frame 12 of 12." (`text.frame`), and every value axis spans all frames so it holds still while the frames play. With two or more frames the controls slot holds a `<button class="maya-play" data-maya="play">` labelled `text.play`; `text.pause` is the label while playing. `Parts.frame` is `[index, count]`. Specs without `frame` or `stack: "percent"` render exactly as before.

### Changed

- Value labels and band-axis category ticks carry `data-key` (the key of the mark they label, or of the category), so the element can move them with their marks on a data update instead of matching by index. A scatter with `frame` and `size` scales radii by the largest size over all frames, so one size is one radius in every frame.

### Fixed

- Small values no longer print as "0". Without a tick step (value labels, the KPI headline, tooltips), `auto`, `compact` and `percent` give a non-zero value below 0.05 two significant digits: 0.004 is "0.004", 0.0012 is "0.0012", 0.012 is "0.012". Axis ticks are unchanged.
- Data with rows but no number in any measure (every value null) shows the "No data" text instead of an empty 0 to 1 axis. A hidden series or a zoom window over nothing still keeps its axes.
- Line, area and dumbbell points outside a fixed `yDomain` sit on the plot edge instead of being drawn over the axis labels and title, as bars already were. Tooltips keep the real value.

## 0.7.0 - 2026-10-06

### Changed

- Line and area charts with 2 to 8 series, all visible, `labels` off and no y2 name each series at its right end in its colour with its last value, in a reserved right gutter (at most 30% of the width), and drop the legend. Below 400 px wide, when a series is hidden, or with `labels: true`, the legend returns. New `endLabels: false` turns them off (legend back, no gutter); an explicit `legend: true` keeps the legend and its series toggle alongside them.
- Value labels on lines avoid crossing their own line (tried above, below, and to either side; dropped when none is clear).
- Hover marks the active mark with an ink outline instead of changing its fill, so labels inside it keep their contrast. Ramp cells are no longer dimmed on hover.
- Heatmap and density ramps start at 3:1 contrast against the background and span further.
- `--maya-good` and `--maya-bad` are now teal and orange (colour-blind safer).
- Bars: outside labels that would print over a taller neighbour are dropped; waterfall first and last labels stay in their own column; the waterfall start bar is neutral like Total; a clipped Other bar shows a break.
- Parallel coordinates name every line, nudging names apart with short leaders.
- Scatter tooltips name each field and include the colour field.
- Table in-cell bars use one accent colour.
- Ridgelines overlap by about 40% and show each ridge's peak value.
- Radial bars use one label placement for every bar; sankey keeps every node name at narrow widths and colours items by their first-level branch.
- Marimekko keeps a narrow column's share on a second line. Waffle hover lights the whole category.
- KPI delta uses a true minus sign. The first time-axis tick keeps its year at narrow widths.
- Fixed: marimekko tooltips listed rows twice (hit targets were indexed as marks).

## 0.6.0 - 2026-10-05

### Added

- A chart builder on the demo site (`builder.html`). Pick one of the 20 chart types, start from sample data or paste CSV, TSV or JSON, map fields, set options, re-roll the sample numbers to watch the chart animate, and copy code for plain HTML, a ThoughtSpot custom chart (Muze Studio), React, Vue, Svelte, Angular, a JSON spec or Node server rendering. Each field gets its own format (a style for numbers and dates, words before and after a text category), and an i button by every field and option says what it does. Options a chart cannot use are hidden, options that clash with the current settings are disabled with the reason, and a spec the library rejects is explained in the builder's words with an undo. Chart types and options are read from `schema.json` and `validate.ts`, and the copied code pins the current `package.json` version, so the builder follows each release. Pasted data stays in the browser and is capped at 1 MB, 5,000 rows and 50 columns.

### Changed

- Size budgets (gzip): global 52.5 KB (was 51), element 44 KB (was 42.5), hierarchy 4.1 KB (was 3.85). The correctness, accessibility and motion fixes in this release account for the growth; core stays at 29.75 KB after trimming validation prose.
- Install: the compare harness's rival libraries and the Anthropic SDK moved out of the root `devDependencies` into `compare/package.json` with its own lockfile. A root `npm ci` now installs only the library toolchain; the `compare*` scripts run `npm install --prefix compare` themselves, and `test/eval-score.test.ts` skips its ECharts cases when `compare/node_modules` is absent.

### Fixed

- A scatter with a `size` field now shows its colour key and the size key together. The size key used to replace the colour legend.
- A category axis with 8 or fewer categories no longer drops labels at narrow widths. Each label is clipped to its slot with an ellipsis and keeps its full text in a title.
- A time axis on a narrow plot always shows at least its first and last point, instead of a single tick.
- The README and spec reference now state which source wins when a `<maya-chart>` has a `spec` property, a JSON script child and a `spec` attribute.
- Downsampling a long time axis no longer drops a series' first point, last point, minimum or maximum when many series or sparse runs overshoot the budget. A one-point spike in a gappy line, or a kpi sparkline's extremes, now survive.
- The exported `version` and `<maya-chart>.version` now read 0.5.0 instead of 0.3.0, so the double-registration warning can fire between versions. A test compares it with package.json so the next release cannot drift.
- Scatter and beeswarm marks with names like "3", "3" and "3#2" no longer share a `data-key`.
- Format options keep only primitive values before they are cached or passed to Intl, so a BigInt or object option no longer throws a raw TypeError, and the formatter cache is cleared past 200 entries.
- `renderShell` and `shellInner` put `theme` and `colors` overrides in a rule inside the nonce'd style element instead of a style attribute, so they apply under a strict CSP without `style-src-attr`.
- `drill` and `drillOut` on a chord chart are now rejected with `option-unsupported`. A chord has two levels, so a drill never went anywhere.
- The release workflow is split into a `gate` job that runs the repository scripts with no credentials and a `publish` job that alone holds the npm token and `id-token: write`, installs nothing and publishes the built artifact. The gate fails when the tag and package.json version differ. Every action in every workflow is pinned to a commit SHA.
- A click on a dumbbell connector no longer fires `maya-select` or shows an empty tooltip.
- A numeric selection such as `x: 2024` now toggles off and no longer duplicates, because selections compare as strings.
- A spec, view or selected change made while a resize frame is pending renders in the same microtask and animates.
- With the pointer resting on a mark, the tooltip and crosshair follow the mark to its new place after a data update.
- With `tooltip: false`, arrow keys, keyboard select and keyboard drill work, and the live region still announces the active mark.
- After a spec error the old data table is removed, so screen readers no longer read data the chart is not showing.
- Translucent sankey and chord links no longer flash to full opacity in Safari during updates and drills; fades end on the CSS opacity.
- Interrupting a drill or update no longer makes label groups flash.
- On a line or area first draw, value labels appear after the line has finished drawing.
- Drilling a line, area or dumbbell chart moves points and connectors with the zoom instead of popping them, and line and area paths crossfade rather than morph between different categories.
- The old sunburst centre stays until the clicked slice reaches it.
- The hidden data table caption no longer shows over the chart title in Firefox.
- Series legends are compacted instead of hidden in containers under 320 px.
- Value labels on bars, heatmap cells, marimekko, treemap tiles and the first sunburst ring pass 4.5 to 1 contrast in light and dark mode.
- Dimmed heatmap cells keep a readable label on hover.
- A scatter without a size field shows its colour ramp and series legend again.
- Heatmap labels that do not fit fall back to two significant digits before being dropped.
- Beeswarm dodging no longer slows down on thousands of tied values (5000 ties took 3.7 s).
- Sunburst names run along the arc, stay upright and are cut with an ellipsis, so every region and large family is labelled at gallery size.
- A drilled treemap steps its tiles through three tints of the branch colour.
- The sunburst "Other (n)" slice no longer gets a series slot, and its key leaves out the count so a changed count sweeps instead of re-entering.
- Narrow sankey labels no longer overprint: the last two columns share label slots.
- Sankey and chord outer columns use one neutral, the muted foreground, instead of a grey ramp that fell to 1.58 to 1.
- Hexmap labels on ramp steps 7 and 8 use the theme foreground in both modes.
- The gallery radial tile is single series so its tip totals show, the horizontal bar tile drills, and tiles show display titles instead of raw field names.
- Sunburst drills keep the centre label readable: the old centre text crossfades into the new one instead of leaving a blank disc.
- The tooltip of a line chart with several measures and no series field names the active measure instead of showing an empty cell.
- At narrow widths a tall sankey node slides its label to find room, so the biggest leaves keep their names, and two-line labels keep clear of neighbours and the plot edge.
- Hexmap value labels are solid ink and every label measures at least 4.5 to 1 against its fill in light and dark mode.
- A sunburst ring of slivers keeps its largest child as a thin slice ahead of "Other".
- A `limit` roll-up bar no longer sets the value scale; it runs to the plot edge with its full value in the label and tooltip.
- Waterfall charts always label the first bar and the Total; a step label that does not fit its column is dropped instead of overlapping.
- Line value labels sit above peaks, below troughs and to the free side on slopes, instead of on the line.
- Parallel charts label each line's category at the last axis when it fits, and their tick labels are muted.
- The kpi period caption sits above the sparkline's last point.
- Radial bars state a year shared by every date label once, in the centre, instead of on every category.
- Heatmap cells too small for a label are squares centred in their band, and the heatmap ramp legend shows the measure name.
- Gallery: calendar weeks run Monday to Sunday, margin varies per item, a drillable sankey tile was added, and the demo's first chart has a title and value labels.

## 0.5.0 - 2026-10-05

A measured scoreboard against seven other chart libraries, and speed: large data renders several times faster than before.

### Changed

- Speed: style recalculation of marks is 2 to 3 times cheaper. Mark rules no longer put a `:has()` on an ancestor (checked once per mark): scatter styles key on `svg[data-xd]`, line points on a new `svg[data-pt]`, and selection and legend hover dim through custom properties set once on an ancestor. Flow path lighting is set by the tooltip (`data-lit`), so it now covers every node, not the first 32. The hidden data table is built and inserted when the browser is next idle (`Parts.table` is computed on first read). The default en-US number and UTC date formats no longer load ICU (about 7 ms on a page's first chart), with output equal to `Intl` in Chrome and Firefox; Safari's own Intl writes "Jan 1, 2024 at 1:05 PM" where mayaCharts now writes "Jan 1, 2024, 1:05 PM" in every engine, as server-rendered output already did.
- Speed: less work per point on a page's first chart, where V8 still interprets: scatter builds each point's markup in one pass (no intermediate objects, no sort without sizes), number keys skip URI encoding, the en-US number format and ISO date parse avoid array destructuring and needless regular expressions, the mark count no longer splits the markup, and an unselected chart no longer visits every mark after a paint. Scatter at 1k points: first paint 20 to 18.8 ms; line at 10k: 22.6 to 20.3 ms.
- Speed: scatter points without a series carry no `data-s`, and a dense plot marks only its first point `data-dense`; fill, stroke and stroke width come from the marks group. Mark transitions are declared only under `prefers-reduced-motion: no-preference`, so reduced-motion pages skip them in every style pass. Scatter at 1k points: first paint 22.1 to 20 ms, update at 4x CPU 44.5 to 36.2 ms.
- Speed: the default `--maya-font` is `system-ui, sans-serif` (was `ui-sans-serif, system-ui, sans-serif`). Chromium does not know `ui-sans-serif`, and the failed lookup cost about 2 ms on a page's first chart; every engine resolved the old stack to the same system font. A chart with no rows skips the axis layout.
- Speed: line, area, kpi and ridgeline charts draw one hit rect over the plot instead of one per category; hover, tap, click, select and drill pick the point at the nearest category (then the nearest series). Time-axis points carry `data-i` for the zoom brush, which the per-category hits carried before.
- Speed: kpi sparklines and ridgelines draw at most one hover point per 4 px (kpi) or 6 px (ridgeline) of width, keeping the shape of the line (the time-axis downsampling pick, with each series' minimum, maximum and gap edges), and no longer fail with `too-many-marks` on long series. Beeswarm draws no hit rects (the tooltip and click pick the nearest dot within 12 px, as for scatter). Parallel shares its hit stroke on a group. At 1k rows the svg is 43 KB (kpi, was 289), 32 KB (ridgeline, was 305), 139 KB (beeswarm, was 334) and 859 KB (parallel, was 934).
- Looks: a scatter titles its axes with the field names by default (`titles` still wins), a bubble scatter gets a size key of three reference circles, and a non-binned scatter over 100 points shrinks and thins its fill so density shows. The shared colour ramp starts at 35% (was 20%) so the lowest heatmap cells stay visible.
- Speed: a line or area with one series and sorted, distinct ISO dates skips the category Map and per-category reducers (typed arrays; 1M rows render in about 300 ms, was 2 s). Plain ISO dates parse by arithmetic, field checks stop at the first row that has the field, and `esc()` skips the regex when nothing needs escaping.
- Line and area downsampling targets one point per 2 px of plot width (at most 1000, and 4000 shared between series), so a 640 px chart draws about 290 points and its svg is about a third of the size. The look of a long line is the same; its hover bands are no narrower than 2 px.
- Scatter charts no longer draw `data-maya="hit"` circles: the svg is smaller and a 1M-row scatter renders in about 300 ms (was 1.9 s). The element picks the nearest mark within 12 px instead.

### Fixed

- Sunburst with many small slices: once a slice would be under 4 px across, it and its smaller siblings draw as one grey "Other (n)" slice with a tooltip, instead of hairline slices and white gaps where slivers were skipped.
- Sunburst names cross the ring only when their box fits inside the slice (else they turn along the radius, else they are left to the tooltip), so neighbouring names no longer overlap.
- Treemap and sunburst colour slots follow size, largest first, so neighbouring slices differ until the 8-colour palette wraps. A `colors` array now maps to that order.
- Parallel coordinates: hovering near a line showed no tooltip, because the theme cleared the stroke of every hit shape and so of the wide transparent hit paths. The rule is gone (no other hit shape gets a stroke).
- Sankey: the longest left-column label (`Referral`) was cut to `Referr…` by a rounding error in its reserved room.

## 0.4.0 - 2026-10-04

A time axis, large data (downsampled lines, density scatter), format templates and a measured comparison page; plus smooth drilling and a redesign of seven chart types. New spec fields: `xType` and `drillOut`.

### Breaking

- Line, area and vertical bar charts whose x values are ISO 8601 dates now get a time axis (sorted by time, proportional spacing). Set `xType: "category"` to keep the old axis.

### Added

- `xType`: "auto", "category" or "time". Line, area and vertical bar charts whose x values are all ISO 8601 dates ("2024-03", "2024-03-05", "2024-03-05T14:30:00Z") get a time axis: categories sorted by time, spaced in proportion, ticks on UTC calendar boundaries. `"time"` also accepts epoch ms (within the Date range); `"category"` opts out. Month, quarter and year starts are spaced by calendar so bars line up evenly, tick density follows the chart width, and a line breaks where the gap between readings is more than 5 times the usual step.
- Line and area series on a time axis longer than 1000 points are downsampled with LTTB, keeping each series' first, last, minimum and maximum. The description says how many points are shown.
- Scatter charts with more than 5000 visible points draw density cells with a ramp legend instead of failing with `too-many-marks`.
- Format templates: one `{value}` or `{value:<preset>}` plus text, such as `format: { margin: "{value:percent} gross" }`.
- Error code `invalid-date` and text keys `fromTo`, `reduced` and `points`.
- `site/compare.html`: a comparison with Chart.js and ECharts, generated by `npm run compare` (strict CSP, axe, bytes, SSR, keyboard, RTL).
- STABILITY.md makes more data attributes and the `data-maya` group names public, with a recipe for layering your own SVG.
- `drillOut` (default true): with `drill`, a click on empty chart space goes back up one level. Set it to false to pop only with the breadcrumb, Back and Escape.
- Sunburst centre disk with the current branch's name and total (`text.total` at the root). Clicking it, or Enter on it, goes back up one level.
- Sunburst tooltip shows each slice's share of its parent (`text.shareOf`), and the top ring's share of the total.

### Changed

- Sunburst draws every level, sorted largest first, and a drill zooms: the clicked branch becomes the centre and its descendants sweep around to fill the circle while the rest fold away at its edges. Clicking a slice drills straight to it, however deep.
- Sunburst slices are stroked circles whose dash is the arc, so drill and data updates animate in angle space through WAAPI in every engine (no path morph or crossfade).
- Deeper sunburst rings are lighter tints of their branch's colour, with a 1 px gap between slices.
- Sunburst names are on by default (`labels: false` hides them) and turn to run along the radius when they do not fit across the ring. Labels fade in after a drill lands.
- `ctx.label` takes an optional rotation for marks that fit their own labels.
- Drilling zooms on every rect chart: on a drill the branch's bar, stack or tile grows to fill the plot while its children grow out of it and the rest is pushed off the edges, clipped to the plot; going back up reverses it. Value labels fade in once the marks land; axes swap at once.
- Treemap names are on by default (`labels: false` hides them), and a drilled treemap keeps its branch's colour.
- Drillable marks show a pointer cursor; the svg carries `data-drill` while a click can go one level deeper.
- Sankey node and link keys hold the level in the whole path, so nodes and links that survive a drill move and morph instead of being redrawn.
- Path pop-in (links, ribbons, hexes) lands on the mark's CSS opacity instead of flashing to full opacity.

- Size budgets (gzip): global 46 KB (was 42), element 37.5 KB (was 36), theme.css 4 KB (was 3.25), hierarchy 3.75 KB (was 3.5), flow 3.5 KB (was 3). The redesigned charts and drill motion account for the growth.

- Chart redesign, defaults only (no spec changes):
  - Radial: the centre shows the measure and its grand total (counting up), grid rings with labels in a clear wedge, rounded bar ends, hairline gaps between stacked segments, bar totals at the tips and names inside long bars; a whole stack lights on hover.
  - Marimekko: each segment shows its share of the column (and the series name when there is room), columns read "West · 25%", and a 0 to 100% scale with gridlines sits on the left. Labels are on unless `labels: false`.
  - Sankey: the outermost column is neutral grey, the next column carries the palette and every flow takes the colour of its branch; labels show the value and sit outside the outer columns; nodes are ordered to reduce crossings; hovering a node lights every flow on a path through it.
  - Chord: the same colour rule (sources grey, targets coloured), thicker rounded group arcs, labels with values, ribbons that follow the rim (no more pinched notches), and hover lights a group's ribbons.
  - Hexmap: a colour legend by default (`legend: false` hides it), a stronger ramp, values under the state codes when they fit, a ring on hover, and states without data as dashed outlines.
  - Scatter: larger translucent points with a ring, bubbles drawn largest first, and dashed hover guides to both axes with the values at the axes.
  - Colour ramp legends (scatter `colorBy`, hexmap) start with the field's title.

### Fixed

- Sankey: clicking a node drilled into its level number and showed "No data". Only the outermost nodes and their links drill, by name.
- Sankey and chord never drill to a single level they cannot draw (chord, with its two levels, does not drill).
- Line and area: a click on a category drilled nothing, because the band hit has no key. It now drills that category.
- A pointer drill no longer moves focus onto a mark (which drew a focus box); the chart keeps focus, so Escape still works. Keyboard drills still focus the first mark.

## 0.3.0 - 2026-10-04

Motion and interaction polish. No spec changes; every existing spec renders as before, with new defaults for look and feel.

### Added

- Entrance animation on the first draw: bars rise in a left-to-right stagger, points pop, lines, areas, sankey, ridgeline and parallel are wiped in left to right, sunburst, chord and radial bloom from the centre, axes and labels fade in, and kpi values count up. Server-rendered charts do not replay it.
- Updates are staggered by category and run longer on a softer curve. Line and area paths morph to their new shape in Chromium and Firefox and crossfade in Safari. Changed kpi numbers count to the new value.
- Hover: a soft column marks the hovered category on bar charts, the hovered category stays lit while the rest dims, line and area charts show every series' point at the crosshair, and sunburst and treemap light the whole path from the root.
- Tooltip: a light card with a blurred backdrop, series swatches and right-aligned values that glides between marks. On line and area charts it sits beside the crosshair instead of over the points. Rows without a series name the measure.
- Area and kpi sparkline fills fade toward the baseline (`<defs>` gradients in the grid group).

### Changed

- Theme: 3 px bar corners, bars capped at 72 px wide, separated stacked segments, softer grid, 11 px axis labels, pill legend buttons with hollow swatches for hidden series, `--maya-ease` token, rounder segmented control and reset chip. `--maya-tooltip-bg` and `--maya-tooltip-fg` now default to a card in the page colours instead of inverted colours.
- Size budgets: element 36 KB, global 42 KB, core 25 KB, theme.css 3.25 KB (gzip).

### Fixed

- Hovering a bar no longer dims the other series (the legend hover rule matched marks too).
- Leaving marks keep their colour while they fade instead of flashing black.
- A text mark whose number changed (kpi) now shows the new text after an update.
- The first draw fits a newly inserted title or legend in the same frame, so the chart no longer renders twice on load.

## 0.2.1 - 2026-10-04

### Fixed

- Tooltips stay inside the viewport on every edge (they clipped in narrow frames such as dashboard tiles).
- A heatmap measure toggle no longer leaves the previous ramp legend behind.
- Labels on dark heatmap and hexmap cells turn light.
- Treemap and sunburst with `drill` draw one level at a time; without drill, leaves under about 2px are skipped and hit targets no longer draw outlines.
- Sankey columns always fit the plot, even with many nodes.
- Chord sizes its ring from the real label widths and keeps labels up to 20 characters.
- Waffle `colors` can be keyed by category, and its legend stays visible in narrow charts.
- A fixed or reversed `yDomain` labels its top end (rank 1 on a `[15, 1]` axis).
- Percent values under 1% keep two decimals.

## 0.2.0 - 2026-10-04

### Added

- Core types: `ridgeline` (one area row per series), `beeswarm` (one dot per row, dodged along the value axis), `parallel` (one axis per measure in a `y` array), `table` (one column per measure, inline bars, click a header to sort).
- `mayacharts/radial`: `radial` bars around a circle, with series stacked outward.
- `mayacharts/flow`: `chord`, ribbons between the two levels of `path`.
- `mayacharts/hierarchy`: `marimekko` (column width by total, segments by share) and `waffle` (100 cells by share, legend on by default).
- `view.sortBy` holds the table sort as `[field, "asc" | "desc"]`.
- `yDomain` may be reversed (`[6, 1]`) to put rank 1 on top.
- Text keys `chartOfAll`, `sortedBy`, `ascending`, `descending`.

### Fixed

- Tooltips now show on links (sankey flows and chord ribbons).
- Hovering a parallel-coordinates point highlights its line and dims the others.
- A chart without a left axis no longer clips its first bottom tick label.
- The auto description no longer ends in "by" when there is no category field.

## 0.1.1 - 2026-10-04

### Added

- `dumbbell` takes `path` with `drill: true`, like bar: click a category to split it into the next level, for example region into states.

## 0.1.0 - 2026-10-04

### Added

- Chart types: line, area, scatter, heatmap, waterfall, kpi, dumbbell
- `kpi`: a headline number. With `x`, the last period is the headline, with its change on the period before and a sparkline; `colorBy: { target }` adds a bullet bar.
- `dumbbell`: two dots per category joined by a line, from the first `series` value to the second; `colorBy: "sign"` tones the line.
- `y2` on vertical bars: a second measure drawn as a line on a right axis.
- Bottom value-axis ticks thin out when their labels would overlap. Tooltips try the sides before clipping, and their swatches carry an outline.
- Modules: hierarchy, flow, geo
- Interactions: measure toggle, drill-down, data selection, zoom
- Formatting: `format`, `titles`, `labels`, `aggregate`, `sort`, `limit`, `colorBy`, `totals`, `text`
- Events and lifecycle hooks
- Element methods: `el.view`, `el.selected`, `el.toSVG()`
- Global IIFE build
- `schema.json` for spec validation

### Breaking

- `yFormat`, `xLabel`, `yLabel` removed in favor of unified `format` and `titles` options

## 0.0.1 - 2026-10-04

### Added

- Bar chart proof of concept (grouped, stacked, negative values)
- `<maya-chart>` custom element
- Server-side rendering via `renderShell`
- Tooltips with viewport-aware positioning
- Animated data updates
- Dark mode via CSS `color-scheme`
- Accessibility: screen reader table, semantic HTML, keyboard navigation
