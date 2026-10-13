import { chromium } from "@playwright/test";
const OUT =
  "/private/tmp/claude-501/-Users-bibekshrestha-mayaCharts/100ef2cc-6a6d-4ae1-84cd-cf5acbe3f740/scratchpad/shots/";
let s = 7;
const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const stores = [
  "Northgate Mall",
  "Riverside",
  "Downtown Flagship",
  "Airport Terminal 2",
  "Lakeside Outlet",
  "Harbour Point",
  "Old Town",
  "Westfield",
];
const facetRows = [];
for (const st of stores) {
  const b = 50 + r() * 400;
  for (const m of months)
    facetRows.push({
      store: st,
      month: m,
      sales: Math.round(b * (0.8 + 0.4 * r()) * 1000),
      lastYear: Math.round(b * (0.7 + 0.4 * r()) * 1000),
    });
}
const lineRows = months.map((m, i) => ({
  month: m,
  sales: 400 + i * 20 + r() * 80,
  lastYear: 380 + i * 12 + r() * 60,
}));
const trailRows = [];
const names = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot"];
for (let f = 0; f < 8; f++)
  for (const n of names)
    trailRows.push({
      q: "Q" + (f + 1),
      name: n,
      x: 10 + f * 5 + r() * 20 + names.indexOf(n) * 6,
      y: 20 + r() * 40 + f * 3,
    });
const wfRows = [
  { k: "2025", v: 98400 },
  { k: "Price", v: 1200 },
  { k: "Volume", v: -800 },
  { k: "Mix", v: 450 },
  { k: "FX", v: -300 },
  { k: "Other", v: 220 },
  { k: "2026", v: 99270 },
];
const tableRows = [];
for (let i = 0; i < 320; i++)
  tableRows.push({
    sku: "SKU-" + String(i).padStart(4, "0") + " Insulated jacket long name",
    region: ["North", "South", "East", "West"][i % 4],
    sales: Math.round(r() * 1e5),
    units: Math.round(r() * 900),
    margin: r() * 0.4,
    returns: Math.round(r() * 50),
    growth: r() - 0.5,
    aov: r() * 200,
  });
const listRows = [];
for (let i = 0; i < 9; i++) {
  listRows.push({
    Move: "Move number " + (i + 1) + " lead with a longer headline here",
    Text: "Earns more per unit than average across every item",
    Value: 10 + i,
    Format: "currency",
  });
  listRows.push({
    Move: "Move number " + (i + 1) + " lead with a longer headline here",
    Evidence: "Jackets",
    Value: 10 + i,
    Format: "currency",
  });
}
const mmRows = [];
for (const reg of ["North", "South", "East", "West"])
  for (const fam of ["Outerwear", "Footwear", "Tops", "Bags"])
    for (const st of ["A", "B", "C"])
      mmRows.push({
        region: reg,
        family: fam,
        store: reg + " " + st,
        sales: Math.round(r() * 1e5),
      });
const SPECS = {
  facet: {
    type: "bar",
    title: "Sales by store",
    x: "month",
    y: "sales",
    facet: "store",
    facetScale: ["shared", "own"],
    drill: true,
    format: "compact",
    data: facetRows,
  },
  facetSpark: {
    type: "line",
    title: "Sales by store",
    x: "month",
    y: "sales",
    facet: "store",
    format: "compact",
    data: facetRows,
  },
  params: {
    type: "bar",
    title: "Projected sales",
    x: "month",
    y: "sales",
    format: "compact",
    params: [
      {
        id: "price",
        label: "Price per unit change",
        min: -20,
        max: 20,
        step: 1,
        value: 0,
        suffix: "%",
      },
      { id: "units", label: "Units", min: -10, max: 10, step: 1, value: 0, suffix: "%" },
    ],
    scale: { by: ["price", "units"] },
    data: lineRows,
  },
  frameTabs: {
    type: "bar",
    title: "Sales by month",
    x: "name",
    y: "x",
    frame: "q",
    frameControl: "tabs",
    data: trailRows,
  },
  frameSlider: {
    type: "bar",
    title: "Sales by quarter",
    x: "name",
    y: "x",
    frame: "q",
    frameControl: "both",
    data: trailRows,
  },
  frameSelect: {
    type: "bar",
    title: "Sales by quarter",
    x: "name",
    y: "x",
    frame: "q",
    frameControl: "select",
    data: trailRows,
  },
  lineWas: {
    type: "line",
    title: "Sales vs last year",
    x: "month",
    y: "sales",
    was: "lastYear",
    format: "compact",
    titles: { lastYear: "Last year" },
    data: lineRows,
  },
  areaWas: {
    type: "area",
    title: "Sales vs last year",
    x: "month",
    y: "sales",
    was: "lastYear",
    format: "compact",
    titles: { lastYear: "Last year" },
    data: lineRows,
  },
  trail: {
    type: "scatter",
    title: "Accounts",
    x: "x",
    y: "y",
    name: "name",
    frame: "q",
    trail: 4,
    data: trailRows,
  },
  waterfall: {
    type: "waterfall",
    title: "Revenue bridge",
    x: "k",
    y: "v",
    start: "2025",
    totals: ["2026"],
    format: "compact",
    data: wfRows,
  },
  marimekko: {
    type: "marimekko",
    title: "Region mix",
    x: "region",
    y: "sales",
    path: ["region", "store"],
    series: "family",
    drill: true,
    format: "compact",
    data: mmRows,
  },
  marimekko2: {
    type: "marimekko",
    title: "Region mix",
    path: ["region", "family", "store"],
    y: "sales",
    drill: true,
    format: "compact",
    data: mmRows,
  },
  tableWide: {
    type: "table",
    title: "SKUs",
    x: "sku",
    y: ["sales", "units", "margin", "returns", "growth", "aov"],
    columns: ["region"],
    page: 25,
    filter: true,
    format: { sales: "compact", margin: "percent", growth: "percent" },
    data: tableRows,
  },
  list: {
    type: "list",
    title: "Moves",
    x: "Move",
    y: "Value",
    path: ["Move", "Evidence"],
    body: "Text",
    rowFormat: "Format",
    data: listRows,
  },
  gauge: {
    type: "gauge",
    title: "Margin",
    y: "v",
    yDomain: [0, 50],
    colorBy: { target: 30, warn: 22 },
    was: "w",
    data: [{ v: 27.4, w: 24.1 }],
  },
};
const only = process.argv[2]?.split(",");
const b = await chromium.launch();
for (const scheme of ["light", "dark"])
  for (const [w, h] of [
    [1100, 420],
    [360, 420],
  ]) {
    const ctx = await b.newContext({
      viewport: { width: w + 40, height: 900 },
      deviceScaleFactor: 2,
      colorScheme: scheme,
    });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.log("PAGEERR", e.message));
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning")
        console.log("CONSOLE", m.text().slice(0, 200));
    });
    await page.goto("http://localhost:5173/mayacharts/gallery.html");
    await page.waitForFunction(() => customElements.get("maya-chart"));
    for (const [id, spec] of Object.entries(SPECS)) {
      if (only && !only.includes(id)) continue;
      await page.evaluate(
        ([id, spec, w, h]) => {
          document.getElementById("crit")?.remove();
          const d = document.createElement("div");
          d.id = "crit";
          d.style.cssText = `position:fixed;inset:0 auto auto 0;z-index:99999;padding:12px;background:Canvas;width:${w}px;`;
          const c = document.createElement("maya-chart");
          c.style.height =
            (id.startsWith("table") || id === "list" || id.startsWith("facet") ? 520 : h) + "px";
          c.style.display = "block";
          if (id === "facetSpark") c.style.height = "300px";
          d.append(c);
          document.body.append(d);
          c.spec = spec;
        },
        [id, spec, w, h],
      );
      await page.waitForTimeout(1300);
      const name = `${id}-${scheme}-${w}`;
      await page.locator("#crit").screenshot({ path: OUT + name + ".png" });
      const info = await page.evaluate(() => {
        const c = document.querySelector("#crit maya-chart");
        const sr = c.shadowRoot;
        const host = sr || c;
        const q = (s) => host.querySelectorAll(s).length;
        return {
          err: host.querySelector(".maya-err")?.textContent?.slice(0, 200),
          sw: c.scrollWidth,
          cw: c.clientWidth,
        };
      });
      if (info.err || info.sw > info.cw + 1) console.log(name, JSON.stringify(info));
    }
    await ctx.close();
  }
await b.close();
