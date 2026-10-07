# Stability and versioning

## Public API

The following are covered by semantic versioning:

- Spec keys and their documented semantics; `mayacharts/schema.json`
- Format templates: `"{value}"` or `"{value:preset}"` where preset is auto, integer, decimal, compact, percent, currency, date, month, year, time, or datetime
- Error `code` and `path` on `MayaSpecError` (message text is not public)
- Element properties and methods: `spec`, `data`, `view`, `selected`, `toSVG()`
- Event names and `detail` shapes: `maya-select`, `maya-view`, `maya-error`, `maya-render`
- CSS custom properties `--maya-*`
- Data attributes: `data-maya` group names (grid, axis-y, axis-x, marks, labels, cross, hits), `data-key`, `data-c` (category), `data-x` (x value), `data-f` (formatted value), `data-series`, `data-plot` (plot box "x y w h"), `data-t` (present on a time axis), `data-tone`, `data-q`, `data-y`
- Signature chart attributes: `data-past` (the ghost bar behind a bar with `was`), `data-was` (the bar's previous value, as tooltip text), `data-neg` (a negative value; on orbit, a reversed orbit), `data-v` on the orbit group that rotates (speed bucket 1 to 5), `data-trail` (orbit's static growth arc), `data-w` (a weave thread; `data-w="h"` is its halo)
- `view.form` and the `forms` spec field (units)
- Class names: `.maya-*` available for host styling
- Exported functions: `render`, `renderShell`, `renderParts`, `validateSpec`

## Not public

SVG nesting and geometry, class order, internal file layout, and anything not listed above.

## Pre-1.0 (current)

Minor versions may contain breaking changes. Breaking changes are always listed under "Breaking" in CHANGELOG.md.

## From 1.0

Strict semantic versioning applies. When a spec key is removed or renamed, it works for one minor version with a validation hint naming the replacement. On the next major version, it becomes an `unknown-option` error with the hint.

## Layer your own SVG

`renderParts()` returns the svg string. Find marks by `[data-maya=mark][data-key]`, the plot box from the `data-plot` attribute (format "x y w h" in pixels), and other groups by their `data-maya` role. Anything you add outside the marks group survives re-renders only if you re-add it after the `maya-render` event.

## Support

- Runtime: Node 22+ for server-side rendering
- Browsers: last two versions of Chrome, Edge, Firefox, Safari; Firefox ESR; iOS 17+
- Security fixes: latest minor version only
- Deprecation and release cadence: see CHANGELOG.md
- No LTS branches
