# Changelog

All notable changes to mayaCharts are documented here.

The format is based on Keep a Changelog and adheres to semantic versioning. Breaking changes are called out explicitly pre-1.0.

## Unreleased

### Added

- Chart types: line, area, scatter, heatmap, waterfall
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
