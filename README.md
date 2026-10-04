# mayaCharts

Beautiful, accessible charts in five lines. Zero dependencies. The browser is the chart engine.

**Status:** Milestone 2 in progress. Not yet published to npm.

## Why

Existing chart libraries were designed 2011-2016 and hand-roll animation, tooltip positioning, theming and framework wrappers. mayaCharts uses the modern platform instead: Custom Elements, Web Animations API, CSS Anchor Positioning + Popover, CSS custom properties with light-dark(), and container queries. This means it ships small, is accessible and SSR-safe by default, and stays low-maintenance. See the [full landscape research](docs/research/reports/Open%20source%20chart%20library%20landscape.md) for what exists.

## Quick start

HTML:

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/mayacharts/dist/element.js"></script>
<maya-chart style="height: 300px">
  <script type="application/json">
    {
      "type": "bar",
      "x": "month",
      "y": "revenue",
      "data": [
        { "month": "Jan", "revenue": 12 },
        { "month": "Feb", "revenue": 19 }
      ]
    }
  </script>
</maya-chart>
```

JavaScript:

```js
import "mayacharts/element";
const chart = document.querySelector("maya-chart");
chart.spec = { type: "bar", data, x: "month", y: "revenue", series: "region", stack: true };
chart.data = newRows; // animates the update
```

Server-side rendering:

```js
import { render, renderShell } from "mayacharts";
const svg = render(spec, { width: 640, height: 320 }); // bare SVG string
const html = renderShell(spec, { width: 640, height: 320 }); // full chart, works without JS
```

## The spec

Rule: `x` is always the category, `y` is always the value, whatever the orientation. `yDomain` is always the value axis.

### Data

| Field       | Type                           | Applies to            | Default    | Meaning                                                                                                                                               |
| ----------- | ------------------------------ | --------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$schema`   | string                         | all                   | -          | Ignored; for editors and LLMs                                                                                                                         |
| `type`      | enum                           | all                   | required   | `bar line area scatter heatmap waterfall kpi dumbbell ridgeline beeswarm parallel table treemap sunburst sankey chord marimekko waffle radial hexmap` |
| `data`      | Row[]                          | all                   | required   | Row objects                                                                                                                                           |
| `aggregate` | sum / mean / count / min / max | all                   | sum        | How rows sharing a (category, series) combine; `count` counts non-null y                                                                              |
| `sort`      | asc / desc                     | bar line area heatmap | data order | Categories by total across all series                                                                                                                 |
| `limit`     | positive integer               | bar line area heatmap | -          | Keep top N categories; rest roll up into "Other"                                                                                                      |

### Encoding

| Field        | Type             | Applies to                                                                          | Meaning                                                                  |
| ------------ | ---------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `x`          | field            | all but path types                                                                  | Category; scatter numeric x; hexmap state; beeswarm optional row         |
| `y`          | field or field[] | all                                                                                 | Value; array adds measure toggle (all-y types: axes/columns)             |
| `series`     | field            | bar line area scatter heatmap dumbbell ridgeline beeswarm parallel marimekko radial | Split into series; heatmap row category; dumbbell exactly two (from, to) |
| `path`       | field[]          | treemap sunburst sankey chord; bar/line/area/dumbbell with drill                    | Hierarchy outer to inner; replaces `x`                                   |
| `size`       | field            | scatter                                                                             | Bubble area (sqrt scale)                                                 |
| `name`       | field            | scatter beeswarm                                                                    | Point identity and tooltip title                                         |
| `totals`     | string[]         | waterfall                                                                           | x values drawn as running-total bars                                     |
| `stack`      | boolean          | bar area                                                                            | Stack series instead of grouping                                         |
| `horizontal` | boolean          | bar dumbbell                                                                        | Categories on the left axis                                              |
| `y2`         | field            | bar                                                                                 | Second value field as a line on right axis (vertical bars only)          |

### Formatting

| Field         | Type              | Default                         | Meaning                                                             |
| ------------- | ----------------- | ------------------------------- | ------------------------------------------------------------------- |
| `format`      | preset or options | auto                            | Per field or one string for all measures; display only              |
| `titles`      | {[field]: string} | field names                     | Display names everywhere (axis, tooltip, legend, table)             |
| `labels`      | boolean           | false (heatmap: true at ≥24 px) | Formatted value on marks                                            |
| `text`        | {[key]: string}   | English                         | Localisable UI strings with {0} placeholders                        |
| `locale`      | BCP 47            | en-US                           | Formatting locale                                                   |
| `currency`    | ISO 4217          | USD                             | Currency for the currency preset                                    |
| `title`       | string            | -                               | Visible heading and accessible name                                 |
| `description` | string            | auto                            | Accessible description                                              |
| `yDomain`     | [min, max]        | -                               | Fixed value-axis domain; [hi, lo] reverses it (ranks with 1 on top) |
| `xDomain`     | [min, max]        | -                               | Fixed x domain (scatter only)                                       |

### Interaction

| Field     | Type           | Applies to                                                  | Default                   | Meaning                                                                  |
| --------- | -------------- | ----------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------ |
| `tooltip` | boolean        | all                                                         | true                      | Hover/keyboard tooltip                                                   |
| `legend`  | boolean        | all                                                         | true when `series` is set | Legend; clicking toggles series                                          |
| `drill`   | boolean        | treemap sunburst sankey; bar line area dumbbell with `path` | false                     | Click/Enter zooms into a branch of path; breadcrumb, Back and Escape pop |
| `select`  | true / "multi" | all but sankey                                              | off                       | Click/Enter/legend selects marks; Escape clears. Not with drill          |
| `zoom`    | boolean        | line area scatter                                           | false                     | Drag to zoom; Reset, double-click, Escape restore                        |
| `animate` | boolean        | all (element only)                                          | true                      | Animate the first draw and every update                                  |

### Style

| Field     | Type                          | Applies to                 | Default       | Meaning                                                             |
| --------- | ----------------------------- | -------------------------- | ------------- | ------------------------------------------------------------------- |
| `colors`  | string[] or {[series]: color} | all                        | theme palette | Max 8; slot assignment stable across updates                        |
| `colorBy` | "sign" / {target: n} / field  | all but heatmap and sankey | -             | Tone by sign or target, or ramp by numeric field. Not with `series` |
| `theme`   | {[token]: css}                | all                        | {}            | Theme token overrides (CSS values, allowlisted)                     |
| `grid`    | boolean                       | all                        | true          | Grid lines perpendicular to the value axis                          |
| `xAxis`   | boolean                       | all                        | true          | Bottom axis                                                         |
| `yAxis`   | boolean                       | all                        | true          | Left axis                                                           |
| `table`   | boolean                       | all                        | true          | Visually hidden data table for screen readers                       |

## Canonical examples

**Currency bar**

```json
{
  "type": "bar",
  "x": "month",
  "y": "revenue",
  "format": "currency",
  "data": [{ "month": "Jan", "revenue": 10500 }]
}
```

**Stacked bar**

```json
{
  "type": "bar",
  "x": "state",
  "y": "units",
  "series": "region",
  "stack": true,
  "data": [{ "state": "CA", "region": "West", "units": 120 }]
}
```

**Horizontal sorted limited labelled bar**

```json
{
  "type": "bar",
  "horizontal": true,
  "x": "product",
  "y": "margin",
  "sort": "desc",
  "limit": 5,
  "labels": true,
  "data": [{ "product": "A", "margin": 22 }]
}
```

**Sign-coloured percent bar**

```json
{
  "type": "bar",
  "x": "metric",
  "y": "variance",
  "format": "percent",
  "colorBy": "sign",
  "data": [{ "metric": "revenue", "variance": 0.15 }]
}
```

**Multi-measure line with date format and zoom**

```json
{
  "type": "line",
  "x": "date",
  "y": ["revenue", "units"],
  "zoom": true,
  "format": { "date": "date", "revenue": "currency" },
  "data": [{ "date": "2024-01-01", "revenue": 10000, "units": 50 }]
}
```

**Stacked area**

```json
{
  "type": "area",
  "x": "month",
  "y": "sales",
  "series": "region",
  "stack": true,
  "data": [{ "month": "Jan", "region": "North", "sales": 1500 }]
}
```

**Waterfall with totals**

```json
{
  "type": "waterfall",
  "x": "stage",
  "y": "amount",
  "totals": ["Q1", "FY"],
  "data": [{ "stage": "Q1", "amount": 100 }]
}
```

**Bubble scatter with select**

```json
{
  "type": "scatter",
  "x": "population",
  "y": "gdp",
  "size": "area",
  "name": "country",
  "select": "multi",
  "data": [{ "country": "USA", "population": 331, "gdp": 23, "area": 9.8 }]
}
```

**Heatmap count**

```json
{
  "type": "heatmap",
  "x": "hour",
  "y": "traffic",
  "aggregate": "count",
  "data": [{ "hour": "09", "traffic": "high" }]
}
```

**Treemap drill**

```json
{
  "type": "treemap",
  "path": ["region", "state", "product"],
  "y": "revenue",
  "drill": true,
  "data": [{ "region": "West", "state": "CA", "product": "A", "revenue": 5000 }]
}
```

**KPI with monthly delta and sparkline**

```json
{
  "type": "kpi",
  "x": "month",
  "y": "sales",
  "format": "currency",
  "data": [
    { "month": "Mar", "sales": 45000 },
    { "month": "Apr", "sales": 50700 },
    { "month": "May", "sales": 54500 }
  ]
}
```

**Dumbbell horizontal**

```json
{
  "type": "dumbbell",
  "x": "region",
  "y": "revenue",
  "series": "year",
  "horizontal": true,
  "format": "currency",
  "data": [
    { "region": "North", "year": "2024", "revenue": 45000 },
    { "region": "North", "year": "2025", "revenue": 52000 }
  ]
}
```

**Bar with dual axis (line overlay)**

```json
{
  "type": "bar",
  "x": "month",
  "y": "revenue",
  "y2": "customers",
  "format": { "revenue": "currency", "customers": "integer" },
  "data": [
    { "month": "Jan", "revenue": 10500, "customers": 120 },
    { "month": "Feb", "revenue": 12000, "customers": 145 }
  ]
}
```

**Ridgeline**

```json
{
  "type": "ridgeline",
  "x": "year",
  "y": "value",
  "series": "product",
  "data": [
    { "year": 2020, "product": "A", "value": 100 },
    { "year": 2021, "product": "A", "value": 120 }
  ]
}
```

**Beeswarm**

```json
{
  "type": "beeswarm",
  "y": "value",
  "series": "category",
  "name": "id",
  "data": [
    { "id": "1", "category": "A", "value": 15 },
    { "id": "2", "category": "A", "value": 18 }
  ]
}
```

**Parallel coordinates**

```json
{
  "type": "parallel",
  "x": "item",
  "y": ["revenue", "units", "margin"],
  "series": "region",
  "data": [
    { "item": "1", "region": "North", "revenue": 1000, "units": 50, "margin": 0.25 },
    { "item": "2", "region": "South", "revenue": 1200, "units": 60, "margin": 0.22 }
  ]
}
```

**Table**

```json
{
  "type": "table",
  "x": "product",
  "y": ["revenue", "units"],
  "sort": "desc",
  "format": { "revenue": "currency", "units": "integer" },
  "data": [
    { "product": "A", "revenue": 5000, "units": 100 },
    { "product": "B", "revenue": 3500, "units": 75 }
  ]
}
```

**Radial**

```json
{
  "type": "radial",
  "x": "month",
  "y": "value",
  "series": "product",
  "data": [
    { "month": "Jan", "product": "A", "value": 10 },
    { "month": "Feb", "product": "A", "value": 15 }
  ]
}
```

**Chord diagram**

```json
{
  "type": "chord",
  "path": ["from", "to"],
  "y": "flow",
  "data": [
    { "from": "A", "to": "B", "flow": 100 },
    { "from": "B", "to": "C", "flow": 75 }
  ]
}
```

**Marimekko (treemap grid)**

```json
{
  "type": "marimekko",
  "x": "category",
  "y": "value",
  "series": "segment",
  "data": [
    { "category": "A", "segment": "X", "value": 50 },
    { "category": "A", "segment": "Y", "value": 30 }
  ]
}
```

**Waffle**

```json
{
  "type": "waffle",
  "x": "category",
  "y": "value",
  "data": [
    { "category": "A", "value": 45 },
    { "category": "B", "value": 30 },
    { "category": "C", "value": 25 }
  ]
}
```

## Modules

Each module extends the core with chart types and shares the same spec, theme, tooltip, a11y, and animation.

| Module                 | Types                                | Size budget (gzip) |
| ---------------------- | ------------------------------------ | ------------------ |
| `mayacharts/hierarchy` | treemap, sunburst, marimekko, waffle | 3.5 KB             |
| `mayacharts/flow`      | sankey, chord                        | 3 KB               |
| `mayacharts/radial`    | radial                               | 2 KB               |
| `mayacharts/geo`       | hexmap (50 US states + DC + PR)      | 3.5 KB             |

## Global build

Paste this anywhere:

```html
<script
  src="https://cdn.jsdelivr.net/npm/mayacharts/dist/maya.global.js"
  integrity="sha384-REPLACE_AT_RELEASE"
  crossorigin="anonymous"
></script>
<script>
  const chart = document.createElement("maya-chart");
  chart.spec = { type: "bar", data, x: "month", y: "revenue" };
  document.body.appendChild(chart);
</script>
```

The `integrity` value above is a placeholder: the real SRI hash is published with each release. Pin the version in the URL when you use it.

Or inline it in a sandbox:

```html
<script type="text/javascript">
  // (paste the entire maya.global.js here)
</script>
```

The module is available as `globalThis.maya.render()`, `maya.renderShell()`, and the `<maya-chart>` element registers automatically.

## Interactions

Always on (opt out with `false`): tooltip, hover-dim, legend toggle, keyboard, crosshair on line/area.

Motion: the first draw plays an entrance (bars rise in a stagger, lines and flows wipe in, radial charts bloom, kpi numbers count up) and every update animates from the old state. Line and area paths morph in Chromium and Firefox and crossfade in Safari. `animate: false` or `prefers-reduced-motion: reduce` turns all of it off. Transitions in the stylesheet use the `--maya-ease` custom property.

Opt-in: `drill`, `select`, `zoom`. Two-way: `el.view`, `el.selected`.

### Keyboard

| Key              | Action                                                                                                     |
| ---------------- | ---------------------------------------------------------------------------------------------------------- |
| Tab              | Move focus between the chart, legend buttons, measure toggle, breadcrumb and Reset chip                    |
| Arrow Left/Right | Previous/next category (same series); on the measure toggle, previous/next measure                         |
| Arrow Up/Down    | Previous/next series in the same category; on the measure toggle, previous/next measure                    |
| Home / End       | First/last measure (measure toggle)                                                                        |
| Enter            | Drill into the focused mark, else select it                                                                |
| Space            | Pin or unpin the tooltip on the focused mark                                                               |
| Escape           | First of: unpin tooltip, cancel brush in progress, clear selection, reset zoom window, pop one drill level |

Touch: show tooltip on pointerup if moved < 4 px.

## Events and two-way sync

Four events, all `bubbles: true, composed: true`:

- `maya-select {selected: Sel[], target: (Sel & {value}) | null}` - mark selected
- `maya-view {measure, drill, window, hidden}` - measure toggled, drilled, zoomed, or a legend series hidden (user actions only; `window` is the zoom slice)
- `maya-error {code, path, message}` - spec error (cancelable; preventDefault() hides error box)
- `maya-render {}` - render complete (ThoughtSpot: call `viz.events.emitRenderCompletedEvent()`)

Properties: `el.view` and `el.selected` (getters and setters; no events on set).

Example: selecting in one chart drives another:

```js
chart1.addEventListener("maya-select", (e) => {
  if (e.detail.target) {
    chart2.selected = [e.detail.target];
  }
});
```

## Export

```js
const svg = el.toSVG(); // standalone SVG with CSS custom properties resolved
```

PNG via canvas:

```js
const svg = el.toSVG();
const img = new Image();
img.onload = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 320;
  canvas.getContext("2d").drawImage(img, 0, 0);
  canvas.toBlob((blob) => saveAs(blob, "chart.png"));
};
img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
```

## Frameworks

**React 19**

```jsx
import "mayacharts/element";
export const Chart = (props) => (
  <maya-chart onmaya-select={(e) => console.log(e.detail)} {...props} />
);
```

**React 18**

```jsx
import { useRef } from "react";
import "mayacharts/element";
export const Chart = ({ spec }) => {
  const ref = useRef(null);
  return <maya-chart ref={ref} spec={JSON.stringify(spec)} />;
};
```

**Vue**

```vue
<script setup>
// vite.config: vue({ template: { compilerOptions: { isCustomElement: (t) => t === "maya-chart" } } })
import { ref } from "vue";
import "mayacharts/element";
const spec = ref({ type: "bar", ... });
</script>
<template>
  <maya-chart :spec.prop="spec" @maya-select="handle" />
</template>
```

**Svelte 5**

```svelte
<script>
  import "mayacharts/element";
  let spec = { type: "bar", ... };
</script>
<maya-chart {spec} onmaya-select={(e) => console.log(e.detail)} />
```

**Angular**

```ts
import { CUSTOM_ELEMENTS_SCHEMA, Component } from "@angular/core";
@Component({
  selector: "app-chart",
  template: `<maya-chart [spec]="spec" (maya-select)="handle($event)"></maya-chart>`,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ChartComponent { ... }
```

**Plain HTML**

```html
<maya-chart id="chart" style="height: 300px"></maya-chart>
<script type="module">
  const chart = document.getElementById("chart");
  chart.spec = { type: "bar", ... };
</script>
```

**Node SSR**

```js
import { renderShell } from "mayacharts";
const html = renderShell(spec, { width: 640, height: 320 });
res.send(html);
```

## Embedding in hosts

Map columnar data `{schema, data}` to row objects, then call `render()` or set `el.spec`. Listen for `maya-render` to signal the host.

Generic recipe:

```js
const columns = { month: ["Jan", "Feb"], revenue: [12, 19] };
const data = Object.entries(columns).map(([field, values]) =>
  Object.fromEntries(values.map((v, i) => [field, v])),
);
const spec = { type: "bar", x: "month", y: "revenue", data };
chart.spec = spec;
```

**ThoughtSpot**: Call `viz.getDataFromSearchQuery().getData()` to get the columnar table, then `viz.events.emitRenderCompletedEvent()` on `maya-render`:

```js
const table = viz.getDataFromSearchQuery().getData();
const rows = table.columns.map((col) =>
  Object.fromEntries(col.values.map((v, i) => [col.name, v])),
);
chart.data = rows;
chart.addEventListener("maya-render", () => {
  viz.events.emitRenderCompletedEvent();
});
```

## Theming

Every colour and font is a CSS custom property. Set them on the element or host:

```css
maya-chart {
  --maya-accent: oklch(0.65 0.2 145);
  --maya-font: "Inter", sans-serif;
  --maya-series-1: #2563eb;
}
```

### Theme tokens

| Token     | CSS variable                       | Light default                        | Dark default          | Colours                         |
| --------- | ---------------------------------- | ------------------------------------ | --------------------- | ------------------------------- |
| font      | --maya-font                        | ui-sans-serif, system-ui, sans-serif | same as light         | Axis labels, tooltip text       |
| fontSize  | --maya-font-size                   | 12px                                 | 12px                  | All text                        |
| fg        | --maya-fg                          | #1f2328                              | #e6edf3               | Title, value labels             |
| fgMuted   | --maya-fg-muted                    | #656d76                              | #9198a1               | Axis text, legend, breadcrumb   |
| grid      | --maya-grid                        | fg at 10% (color-mix)                | fg at 10% (color-mix) | Grid lines                      |
| bg        | --maya-bg                          | #fff                                 | #0d1117               | Background, tooltip text        |
| accent    | --maya-accent                      | oklch(.6 .17 255)                    | oklch(.6 .17 255)     | Focus outline, series 1         |
| radius    | --maya-radius                      | 3px                                  | 3px                   | Mark border radius              |
| tooltipBg | --maya-tooltip-bg                  | --maya-bg at 92% (color-mix)         | same as light         | Tooltip card background         |
| tooltipFg | --maya-tooltip-fg                  | --maya-fg                            | --maya-fg             | Tooltip text                    |
| focus     | --maya-focus                       | --maya-accent                        | --maya-accent         | Keyboard focus ring             |
| good      | --maya-good                        | #1a7f37                              | #3fb950               | colorBy positive / above target |
| bad       | --maya-bad                         | #cf222e                              | #f85149               | colorBy negative / below target |
| series1-8 | --maya-series-1 to --maya-series-8 | 1: --maya-accent; 2-8: oklch presets | same as light         | Series colours (max 8)          |

Brand palette example:

```css
maya-chart {
  --maya-accent: #7c3aed;
  --maya-series-1: #7c3aed;
  --maya-series-2: #ec4899;
  --maya-series-3: #f59e0b;
  --maya-good: #10b981;
  --maya-bad: #ef4444;
}
```

Dark mode is automatic via `color-scheme: light dark`. Override with `prefers-color-scheme`:

```css
@media (prefers-color-scheme: dark) {
  maya-chart {
    --maya-accent: #60a5fa;
  }
}
```

High contrast systems (forced-colors: active) are supported; outline tones instead of colour.

## Security

The chart spec is plain JSON generated by end users or LLMs, not trusted code. mayaCharts escapes all text, allowlists CSS values, and works inside Trusted Types policies.

### Implementation

- All text is HTML-escaped before rendering
- CSS values for colors and theme are allowlisted (blocks url(), expression() and injection syntax)
- `renderShell()` embeds only the spec fields actively used (data minimisation)
- A11y table shows encoded fields only, capped at 1000 rows
- No inline styles: Dynamic styles use CSSOM `setProperty()` or CSS custom properties
- No network requests or telemetry
- Compatible with Trusted Types policy `"mayacharts"` (call `trustedTypes.createPolicy("mayacharts", {createHTML: s => s})`)
- Supports CSP `trusted-types mayacharts` and `nonce` on the shell style tag

See [SECURITY.md](SECURITY.md) for the full security model.

## Accessibility

Fully conformant with WCAG 2.2 AA, verified by axe-core on every gallery tile in both light and dark modes.

Implemented: semantic role and title, accessible description, data table for screen readers, keyboard navigation (Tab, arrows, Enter, Space, Escape), live region updates, focus management, forced-colors support, reduced motion support, ≥3:1 contrast in both light and dark modes, non-colour cues (text tone), 12 px touch target enlargement.

Known ceilings: label truncation at 40% width; UTC dates unless Intl options say otherwise; scatter keyboard order follows draw order (not spatial); stacked bar labels show segments, not totals.

See [STABILITY.md](STABILITY.md) for the full accessibility and performance envelope.

## Performance

Upper bounds asserted by `test/perf.test.ts` for `render()` in Node (test thresholds, not measured timings; output is uncompressed SVG string length):

| Scenario                 | Marks | Render time threshold | Output threshold |
| ------------------------ | ----- | --------------------- | ---------------- |
| 5k-category bar          | 5000  | < 400 ms              | < 2.2 MB         |
| 5k-point scatter         | 5000  | < 200 ms              | -                |
| Heatmap 50x52            | 2600  | < 100 ms              | -                |
| 20k-row bar, `limit: 20` | 21    | < 400 ms              | < 200 KB         |

Animation skips above 1500 marks. 5000-mark hard cap suggests `limit` or `aggregate`. Table capped at 1000 rows.

## Errors

Every error links to [errors.html](site/errors.html#<code>) with a one-paragraph cause and a fixed example. Error shape: `{code, path, message}`.

## Development

```bash
npm install
npm test          # unit, property, fuzz, hostile-string, perf, leak tests
npm run build     # dist/
npm run size      # check budgets
npm run e2e       # Playwright
npm run dev       # demo site at localhost:5173
```

## Versioning

mayaCharts follows semantic versioning. Public API: spec keys and semantics, schema.json, error code/path, element properties/methods, event detail shapes, CSS custom property tokens, data-* attribute roles and values, .maya-* class names. See [STABILITY.md](STABILITY.md) for the full stability policy and pre-1.0 deprecation path via HINTS.

## License

MIT, and the core library will stay MIT. Any paid offerings will be things outside the core, such as support contracts, hosted services and separate add-ons. Nothing in the library will move behind a paywall. See [LICENSE](LICENSE).
