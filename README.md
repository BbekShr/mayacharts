# mayaCharts

Beautiful, accessible charts in five lines. Zero dependencies. The browser is the chart engine.

**Status:** early proof of concept — not yet published to npm.

## Why

Existing chart libraries were designed 2011–2016 and hand-roll animation, tooltip positioning, theming and framework wrappers. mayaCharts uses the modern platform instead: Custom Elements, Web Animations API, CSS Anchor Positioning + Popover, CSS custom properties with light-dark(), and container queries. This means it ships small, is accessible and SSR-safe by default, and stays low-maintenance. See the [full landscape research](docs/research/reports/Open%20source%20chart%20library%20landscape.md) for what exists.

## Quick start

HTML:

```html
<script type="module" src="https://esm.sh/mayacharts/element"></script>
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

## What you get by default

- Tooltips that flip at viewport edges and work on touch
- Animated data updates
- Dark mode via `color-scheme`
- Keyboard navigation
- Screen-reader title, description and data table
- Responsive via container size
- Server rendering

## Theming

Everything is a CSS custom property:

```css
maya-chart {
  --maya-accent: oklch(0.65 0.2 145);
  --maya-font: "Inter", sans-serif;
}
```

## Chart types

v1: bar (grouped, stacked) now; line and area next. See [NON-FEATURES.md](NON-FEATURES.md) for what will not be added.

## Development

```bash
npm install
npm test
npm run build
npm run size
npm run e2e
npm run dev       # demo site
```

## License

MIT.
