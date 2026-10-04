# Changelog

All notable changes to mayaCharts are documented here.

The format is based on Keep a Changelog and adheres to semantic versioning. Breaking changes are called out explicitly pre-1.0.

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
