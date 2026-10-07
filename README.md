# mayaCharts

Beautiful, accessible charts in five lines. Zero dependencies. The browser is the chart engine.

[![npm](https://img.shields.io/npm/v/mayacharts)](https://www.npmjs.com/package/mayacharts) [![license](https://img.shields.io/npm/l/mayacharts)](LICENSE) [![gzip](https://img.shields.io/bundlejs/size/mayacharts)](https://bundlejs.com/?q=mayacharts)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/BbekShr/mayacharts/main/docs/img/hero-dark.png">
  <img alt="Six mayaCharts: a multi-series line, a ranked bar with an Other bucket, a heatmap, a sunburst, a sankey and a US state hexmap" src="https://raw.githubusercontent.com/BbekShr/mayacharts/main/docs/img/hero-light.png">
</picture>

**[Gallery](https://bbekshr.github.io/mayacharts/gallery.html)** · **[Chart builder](https://bbekshr.github.io/mayacharts/builder.html)** · **[Compare with other libraries](https://bbekshr.github.io/mayacharts/compare.html)** · **[Spec reference](#the-spec)**

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/mayacharts/dist/element.js"></script>
<maya-chart
  style="height: 300px"
  spec='{"type":"bar","x":"month","y":"revenue","data":[{"month":"Jan","revenue":12},{"month":"Feb","revenue":19}]}'
></maya-chart>
```

That is a complete, animated, keyboard-navigable chart with a tooltip, a screen-reader data table and dark mode. No build step, no framework.

## Why mayaCharts

- **Small.** Twelve chart types with tooltips, drill, zoom, selection and animation in about 45 KB gzip, with no runtime dependencies. Fourteen more types (treemap, sunburst, sankey, chord, marimekko, waffle, radial, hexmap, boxplot, funnel, weave, units, orbit, constellation) are optional modules of 2 to 4 KB each.
- **Passes the enterprise checklist.** Works under a strict CSP with Trusted Types, meets WCAG 2.2 AA (axe-clean in light and dark), supports RTL, and every user-visible string is localisable.
- **Renders on the server.** `render(spec)` is a pure function that returns an SVG string in Node or any runtime without a DOM. `renderShell` returns a full chart that works before any JavaScript loads.
- **One JSON spec.** No callbacks in the config, so a spec can be stored in a database, sent over the wire, or written by an LLM. A [JSON Schema](schema.json) and [llms.txt](llms.txt) ship with the package.
- **Any framework, or none.** It is a custom element, so it works in React, Vue, Svelte, Angular, Astro and plain HTML.

## How it compares

Measured on 2026-10-05 by the [compare page](https://bbekshr.github.io/mayacharts/compare.html): each library draws the same charts the way its own docs show.

|                                                    | mayaCharts | Chart.js | ECharts | Recharts | Plotly   |
| -------------------------------------------------- | ---------- | -------- | ------- | -------- | -------- |
| Bundle for the compare set, gzip                   | 51 KB      | 71 KB    | 382 KB  | 202 KB   | 1,471 KB |
| Lines of user code for the compare set             | 150        | 223      | 213     | 264      | 157      |
| Renders under `require-trusted-types-for 'script'` | yes        | yes      | no      | yes      | no       |
| Server-side SVG with no DOM                        | yes        | no       | yes     | no       | no       |
| Keyboard navigation of data points                 | yes        | no       | no      | yes      | no       |

Chart.js covers 9 of the 12 compare charts and Recharts 11; the others cover all 12. The compare page also has speed, memory, accessibility and RTL results.

## The idea

Existing chart libraries were designed 2011-2016 and hand-roll animation, tooltip positioning, theming and framework wrappers. mayaCharts uses the modern platform instead: Custom Elements, Web Animations API, CSS Anchor Positioning + Popover, CSS custom properties with light-dark(), and container queries. This means it ships small, is accessible and SSR-safe by default, and stays low-maintenance. See the [full landscape research](docs/research/reports/Open%20source%20chart%20library%20landscape.md) for what exists.

## Quick start

No code yet? The [chart builder](https://bbekshr.github.io/mayacharts/builder.html) lets you pick a chart, paste your data, map the fields and copy ready code for HTML, ThoughtSpot, React, Vue, Svelte, Angular or Node.

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

Where the element reads its spec from, in order of precedence: the `spec` property (and `data`, which sets it), then the JSON `<script>` child, then the `spec` attribute. A `spec` property you have set wins over any later change to the attribute, so set one source and leave the others alone. Assign `chart.spec = undefined` to fall back to the script child or the attribute.

Server-side rendering:

```js
import { render, renderShell } from "mayacharts";
const svg = render(spec, { width: 640, height: 320 }); // bare SVG string
const html = renderShell(spec, { width: 640, height: 320 }); // full chart, works without JS
```

## Signature charts

Five things no other chart library draws. Each is a spec like any other and costs 2.5 KB gzip or less (`was` is part of the core bar).

**Shapeshifter (`units`).** One dot per row, and the dots change form: a waffle, bars, or a swarm along the value axis. Every dot keeps the same key in every form, so switching form flies each dot to its new place instead of redrawing. Maya means illusion, and this is the one that earns the name. Other libraries make you pick a chart; here the control is part of the chart.

```js
import "mayacharts/units";
chart.spec = { type: "units", x: "region", y: "spend", name: "customer", data: customers };
// forms defaults to ["waffle", "bars", "swarm"]; view.form picks the one shown; 1500 rows at most
```

**Dhaka weave (`weave`).** A ranking over time, woven like Dhaka cloth. Bump charts exist, but their lines just cross. Here the series that climbs passes over the one that falls at every crossing, with a halo under each thread so over and under read at a glance. Hover a dot to light its thread and see that period's order.

```js
import "mayacharts/weave";
chart.spec = { type: "weave", x: "quarter", y: "sales", series: "line", data: rows };
// series is required, at most 8; a missing period breaks that thread
```

**Memory (`was`).** A bar chart that remembers. Name a column that holds the previous value and each bar gets a dashed ghost at that value, grows from the ghost on first paint, and the description gains a "Since ..." sentence naming the largest moves. The memory comes from your data, never from browser storage. It is part of the core bar, so there is nothing to import.

```js
chart.spec = { type: "bar", x: "family", y: "sales", was: "before", data: rows };
// not with stack or a y array; a row whose was is not a number shows no ghost
```

**Orrery (`orbit`).** Categories as planets around their total. Orbit radius is rank (largest innermost), planet size is value, and orbital speed and direction follow growth, so a shrinking category circles the other way. A static trail arc shows the growth too, so the chart still reads with motion off: under reduced motion, with `animate: false`, in server rendering and in an exported image.

```js
import "mayacharts/orbit";
chart.spec = { type: "orbit", x: "family", y: "sales", y2: "growth", data: rows };
// without y2 nothing moves; limit rolls the rest into a fixed Other planet
```

**Constellation (`constellation`).** Accounts placed by how alike their measures are, not by any one axis. Two or more measures are standardised and flattened to a sky by a deterministic PCA, so the same data always draws the same sky. Each star is joined to its nearest neighbour, and hovering one lights its three nearest.

```js
import "mayacharts/constellation";
chart.spec = { type: "constellation", x: "account", y: ["spend", "tickets", "tenure"], data: rows };
// optional size; 500 rows and 12 measures at most
```

## The spec

Rule: `x` is always the category, `y` is always the value, whatever the orientation. `yDomain` is always the value axis.

### Data

| Field       | Type                           | Applies to                  | Default    | Meaning                                                                                                                                                                                              |
| ----------- | ------------------------------ | --------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$schema`   | string                         | all                         | -          | Ignored; for editors and LLMs                                                                                                                                                                        |
| `type`      | enum                           | all                         | required   | `bar line area scatter heatmap waterfall kpi dumbbell ridgeline beeswarm parallel table treemap sunburst sankey chord marimekko waffle radial hexmap boxplot funnel weave units orbit constellation` |
| `data`      | Row[]                          | all                         | required   | Row objects                                                                                                                                                                                          |
| `aggregate` | sum / mean / count / min / max | all but boxplot             | sum        | How rows sharing a (category, series) combine; `count` counts non-null y                                                                                                                             |
| `sort`      | asc / desc                     | bar line area heatmap orbit | data order | Categories by total across all series                                                                                                                                                                |
| `limit`     | positive integer               | bar line area heatmap orbit | -          | Keep top N categories; rest roll up into "Other"                                                                                                                                                     |

### Encoding

| Field        | Type                            | Applies to                                                                                        | Meaning                                                                                                                                                                                       |
| ------------ | ------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `x`          | field                           | all but path types                                                                                | Category; scatter numeric x; hexmap state; beeswarm optional row; funnel stage, omitted when `y` lists the stages                                                                             |
| `xType`      | auto / category / time          | bar line area                                                                                     | How x is spaced: auto detects ISO 8601 dates for a time axis; else categories. "time" accepts epoch ms. Default auto.                                                                         |
| `y`          | field or field[]                | all                                                                                               | Value; array adds measure toggle (all-y types: axes/columns; funnel without `x`: one stage per field)                                                                                         |
| `series`     | field                           | bar line area scatter heatmap dumbbell ridgeline beeswarm parallel marimekko radial boxplot weave | Split into series; heatmap row category; dumbbell exactly two (from, to); boxplot boxes side by side; weave one thread each (required)                                                        |
| `path`       | field[]                         | treemap sunburst sankey chord; bar/line/area/dumbbell with drill                                  | Hierarchy outer to inner; replaces `x`                                                                                                                                                        |
| `size`       | field                           | scatter constellation                                                                             | Bubble or star area (sqrt scale)                                                                                                                                                              |
| `name`       | field                           | scatter beeswarm boxplot units                                                                    | Point identity and tooltip title; units one dot per row                                                                                                                                       |
| `totals`     | string[]                        | waterfall                                                                                         | x values drawn as running-total bars                                                                                                                                                          |
| `stack`      | boolean / "percent"             | bar area                                                                                          | Stack series instead of grouping; "percent" shows shares of each category's visible total (axis 0 to 100%, y formatted as percent unless `format` sets it)                                    |
| `horizontal` | boolean                         | bar dumbbell                                                                                      | Categories on the left axis                                                                                                                                                                   |
| `y2`         | field                           | bar orbit                                                                                         | Second value field as a line on right axis (vertical bars only); orbit: growth, which sets planet speed and direction                                                                         |
| `was`        | field                           | bar                                                                                               | Previous value: a ghost bar over each bar keyed in the legend, "was" in the tooltip, a table column and a description sentence naming the 2 largest moves. Not with `stack` or a `y` array    |
| `forms`      | ("waffle" / "bars" / "swarm")[] | units                                                                                             | Forms a units chart switches between, first shown (`view.form` picks another); a form control appears with 2 or more. Default all three                                                       |
| `frame`      | field                           | bar line area scatter dumbbell                                                                    | Playback: one frame per distinct value, the last shown by default (`view.frame` picks another); the title names the frame and the value axes span every frame. The element adds a Play button |

### Formatting

| Field         | Type                        | Default                                                                            | Meaning                                                                                                                                                        |
| ------------- | --------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `format`      | preset / template / options | auto                                                                               | Per field or one string for all measures; display only. Template: `"{value:percent} gross"`                                                                    |
| `titles`      | {[field]: string}           | field names                                                                        | Display names everywhere (axis, tooltip, legend, table)                                                                                                        |
| `labels`      | boolean                     | false (heatmap: true at ≥24 px; treemap, sunburst: names; marimekko: shares; true) | Formatted value on marks                                                                                                                                       |
| `text`        | {[key]: string}             | English                                                                            | Localisable UI strings with {0} placeholders                                                                                                                   |
| `locale`      | BCP 47                      | en-US                                                                              | Formatting locale                                                                                                                                              |
| `currency`    | ISO 4217                    | USD                                                                                | Currency for the currency preset                                                                                                                               |
| `title`       | string                      | -                                                                                  | Visible heading and accessible name                                                                                                                            |
| `description` | string                      | auto                                                                               | Accessible description                                                                                                                                         |
| `yDomain`     | [min, max]                  | -                                                                                  | Fixed value-axis domain; [hi, lo] reverses it (ranks with 1 on top)                                                                                            |
| `xDomain`     | [min, max]                  | -                                                                                  | Fixed x domain (scatter only)                                                                                                                                  |
| `rules`       | array                       | -                                                                                  | Up to 4 value-axis reference lines: n, "mean", or {y, label}; bar line area scatter. With stack "percent" n is a share (0.5) and "mean" the mean segment share |

### Interaction

| Field       | Type           | Applies to                                                  | Default                                   | Meaning                                                                                                                                               |
| ----------- | -------------- | ----------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tooltip`   | boolean        | all                                                         | true                                      | Hover/keyboard tooltip                                                                                                                                |
| `legend`    | boolean        | all                                                         | true with `series`, waffle, hexmap, units | Legend; clicking toggles series. Line and area: dropped when direct end labels show, unless set to true explicitly.                                   |
| `endLabels` | boolean        | line area                                                   | true                                      | Name each series at its right end with its last value (2 to 8 visible series, no value labels, no y2, width >= 400 px). false brings back the legend. |
| `drill`     | boolean        | treemap sunburst sankey; bar line area dumbbell with `path` | false                                     | Click/Enter zooms into a branch of path; breadcrumb, Back and Escape pop                                                                              |
| `drillOut`  | boolean        | types that take `drill`                                     | true                                      | With drill, a click on empty chart space goes back up one level                                                                                       |
| `select`    | true / "multi" | all but sankey                                              | off                                       | Click/Enter/legend selects marks; Escape clears. Not with drill                                                                                       |
| `zoom`      | boolean        | line area scatter                                           | false                                     | Drag to zoom; Reset, double-click, Escape restore                                                                                                     |
| `animate`   | boolean        | all (element only)                                          | true                                      | Animate the first draw and every update                                                                                                               |

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

### Time axes

Dates in x values are automatically detected and placed on a proportional time axis when using line, area or vertical bar charts. ISO 8601 dates are recognized as year-month ("2024-03"), full date ("2024-03-05") or date-time ("2024-03-05T14:30:00Z"); a date-time without an offset is read as UTC. A bare year such as "2024" stays a category. Numbers are never auto-detected as dates; use `xType: "time"` explicitly to interpret them as epoch milliseconds. A time axis preserves the chronological order and spacing of dates, so sort and limit options keep a category axis instead. To disable time axis detection and use a category axis with ISO dates, set `xType: "category"`. All ticks and boundaries are placed at UTC calendar boundaries.

### Large data

Line and area charts on a time axis automatically reduce long time series to about one point per 2 px of plot width (at most 1000 categories, and 4000 shared between series) using the LTTB (Largest Triangle Three Buckets) downsampling algorithm, keeping each series' first, last, minimum and maximum points so trends and extremes remain visible. The data table and screen reader description indicate how many points are displayed. Scatter charts above 5000 visible points are drawn as density cells to reduce rendering cost; bars, tables and categorical lines still enforce a hard cap of 5000 marks and suggest using `limit` or `aggregate` when exceeded.

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

**Weave** (`mayacharts/weave`)

```json
{
  "type": "weave",
  "x": "year",
  "y": "sales",
  "series": "team",
  "data": [
    { "year": "2024", "team": "A", "sales": 10 },
    { "year": "2024", "team": "B", "sales": 12 },
    { "year": "2025", "team": "A", "sales": 15 },
    { "year": "2025", "team": "B", "sales": 9 }
  ]
}
```

**Units** (`mayacharts/units`): one dot per row; the legend toggles groups

```json
{
  "type": "units",
  "x": "plan",
  "y": "spend",
  "name": "customer",
  "data": [
    { "customer": "c1", "plan": "Pro", "spend": 120 },
    { "customer": "c2", "plan": "Free", "spend": 0 }
  ]
}
```

**Orbit** (`mayacharts/orbit`): growth sets speed and direction

```json
{
  "type": "orbit",
  "x": "product",
  "y": "revenue",
  "y2": "growth",
  "format": { "growth": "percent" },
  "data": [
    { "product": "A", "revenue": 500, "growth": 0.12 },
    { "product": "B", "revenue": 300, "growth": -0.05 }
  ]
}
```

**Constellation** (`mayacharts/constellation`)

```json
{
  "type": "constellation",
  "x": "account",
  "y": ["revenue", "seats", "tickets"],
  "data": [
    { "account": "Acme", "revenue": 120, "seats": 40, "tickets": 3 },
    { "account": "Globex", "revenue": 80, "seats": 25, "tickets": 9 },
    { "account": "Initech", "revenue": 95, "seats": 30, "tickets": 4 }
  ]
}
```

**Box plot** (`mayacharts/stats`)

```json
{
  "type": "boxplot",
  "x": "region",
  "y": "sales",
  "name": "store",
  "data": [
    { "region": "North", "store": "N1", "sales": 120 },
    { "region": "North", "store": "N2", "sales": 95 },
    { "region": "South", "store": "S1", "sales": 80 }
  ]
}
```

**Funnel** (`mayacharts/stats`, stages as fields; or `x` for the stage and one `y`)

```json
{
  "type": "funnel",
  "y": ["visits", "signups", "paid"],
  "data": [{ "visits": 12000, "signups": 2900, "paid": 1100 }]
}
```

## Modules

Each module extends the core with chart types and shares the same spec, theme, tooltip, a11y, and animation.

| Module                     | Types                                                     | Size (gzip) |
| -------------------------- | --------------------------------------------------------- | ----------- |
| `mayacharts/hierarchy`     | treemap, sunburst, marimekko, waffle                      | 4.1 KB      |
| `mayacharts/flow`          | sankey, chord                                             | 3.5 KB      |
| `mayacharts/radial`        | radial                                                    | 2.8 KB      |
| `mayacharts/geo`           | hexmap (50 US states + DC + PR)                           | 2.5 KB      |
| `mayacharts/stats`         | boxplot, funnel                                           | 3.4 KB      |
| `mayacharts/weave`         | weave (ranks that cross over and under)                   | 2.0 KB      |
| `mayacharts/units`         | units (one dot per row: waffle, bars, swarm)              | 2.5 KB      |
| `mayacharts/orbit`         | orbit (planets sized by value, speed by growth)           | 2.0 KB      |
| `mayacharts/constellation` | constellation (rows placed by similarity across measures) | 2.5 KB      |

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
- `maya-view {measure, drill, window, hidden, form}` - measure toggled, drilled, zoomed, a legend series hidden, or a units form picked (user actions only; `window` is the zoom slice)
- `maya-error {code, path, message}` - spec error (cancelable; preventDefault() hides error box)
- `maya-render {}` - render complete (use it to tell a host the chart has painted)

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
| font      | --maya-font                        | system-ui, sans-serif                | same as light         | Axis labels, tooltip text       |
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

Known ceilings: left labels are cut at 40% width and bottom category labels at their slot width; UTC dates unless Intl options say otherwise; scatter keyboard order follows draw order (not spatial); stacked bar labels show segments, not totals.

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
npm run tokens    # Claude token spend on this repo
git config core.hooksPath "$PWD/.githooks"   # refresh the token count below on each commit
```

### Built with Claude

<!-- tokens:start -->

Tokens spent with Claude Code since the first commit, across 10,224 API calls. Most are cached context re-read on each turn. Updated on every commit by `npm run tokens -- --readme`.

- claude-opus-5-5: 1,008,624,057 total, 2,126,860 output
- claude-sonnet-5-5: 400,508,674 total, 68,521 output
- claude-fable-5-1: 157,706,227 total, 350,576 output
- claude-haiku-4-5-20251001: 26,122,384 total, 1,063 output
- claude-sonnet-5: 7,674,739 total, 43,301 output
- claude-opus-5: 123,120 total, 12 output
- all: 1,600,759,201 total, 2,590,333 output

<!-- tokens:end -->

## Versioning

mayaCharts follows semantic versioning. Public API: spec keys and semantics, schema.json, error code/path, element properties/methods, event detail shapes, CSS custom property tokens, data-* attribute roles and values, .maya-* class names. See [STABILITY.md](STABILITY.md) for the full stability policy and pre-1.0 deprecation path via HINTS.

## License

MIT, and the core library will stay MIT. Any paid offerings will be things outside the core, such as support contracts, hosted services and separate add-ons. Nothing in the library will move behind a paywall. See [LICENSE](LICENSE).
