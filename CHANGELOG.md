# Changelog

All notable changes to mayaCharts are documented here.

The format is based on Keep a Changelog and adheres to semantic versioning. Breaking changes are called out explicitly pre-1.0.

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
