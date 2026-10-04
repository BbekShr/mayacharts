import { writeFileSync } from "node:fs";
import { renderShell } from "../src/index.ts";
import type { ChartSpec } from "../src/index.ts";

const quarters = ["Q1", "Q2", "Q3", "Q4"];
const regions: Record<string, number[]> = {
  North: [120, 150, 170, 210],
  South: [90, 110, 95, 140],
  West: [60, 80, 130, 160],
};
const spec: ChartSpec = {
  type: "bar",
  title: "Sales by region",
  x: "quarter",
  y: "sales",
  series: "region",
  data: quarters.flatMap((quarter, i) =>
    Object.entries(regions).map(([region, v]) => ({ quarter, region, sales: v[i] ?? 0 })),
  ),
};

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>mayaCharts server rendering</title>
  <link rel="stylesheet" href="./site.css" />
</head>
<body>
  <header class="site">
    <h1>Server rendering</h1>
    <p class="tagline">This chart was rendered on the server with renderShell(). It is visible with JavaScript disabled; when the element script loads it takes over and becomes interactive.</p>
    <nav><a href="./index.html">Back to examples</a></nav>
  </header>
  <main>
    <section class="ssr-chart">
${renderShell(spec, { width: 760, height: 320 })}
    </section>
  </main>
  <script type="module">import "mayacharts/element";</script>
</body>
</html>
`;
writeFileSync(new URL("../site/ssr.html", import.meta.url), html);
