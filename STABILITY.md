# Stability and versioning

## Public API

The following are covered by semantic versioning:

- Spec keys and their documented semantics; `mayacharts/schema.json`
- Error `code` and `path` on `MayaSpecError` (message text is not public)
- Element properties and methods: `spec`, `data`, `view`, `selected`, `toSVG()`
- Event names and `detail` shapes: `maya-select`, `maya-view`, `maya-error`, `maya-render`
- CSS custom properties `--maya-*`
- Data attributes: `data-maya` roles, `data-key`, `data-s`, `data-tone`, `data-q`, `data-y`
- Class names: `.maya-*` available for host styling
- Exported functions: `render`, `renderShell`, `renderParts`, `validateSpec`

## Not public

SVG nesting and geometry, class order, internal file layout, and anything not listed above.

## Pre-1.0 (current)

Minor versions may contain breaking changes. Breaking changes are always listed under "Breaking" in CHANGELOG.md.

## From 1.0

Strict semantic versioning applies. When a spec key is removed or renamed, it works for one minor version with a validation hint naming the replacement. On the next major version, it becomes an `unknown-option` error with the hint.

## Support

- Runtime: Node 22+ for server-side rendering
- Browsers: last two versions of Chrome, Edge, Firefox, Safari; Firefox ESR; iOS 17+
- Security fixes: latest minor version only
- Deprecation and release cadence: see CHANGELOG.md
- No LTS branches
