// Shared inline specs for the global/csp specs (one per chart type).
const rows = ["A", "B", "C", "D"].map((k, i) => ({
  k,
  v: (i + 1) * 10,
  w: 5 + i * 3,
  g: i % 2 ? "x" : "y",
}));
const tree = [
  { a: "West", b: "CA", v: 50 },
  { a: "West", b: "OR", v: 20 },
  { a: "East", b: "NY", v: 40 },
  { a: "East", b: "MA", v: 25 },
];
export const SPECS: Record<string, object> = {
  bar: { type: "bar", title: "Bar", x: "k", y: "v", data: rows },
  line: { type: "line", title: "Line", x: "k", y: "v", data: rows },
  area: { type: "area", title: "Area", x: "k", y: "v", data: rows },
  scatter: { type: "scatter", title: "Scatter", x: "v", y: "w", name: "k", data: rows },
  heatmap: { type: "heatmap", title: "Heatmap", x: "k", y: "v", series: "g", data: rows },
  waterfall: {
    type: "waterfall",
    title: "Waterfall",
    x: "k",
    y: "v",
    data: rows.map((r, i) => ({ ...r, v: i % 2 ? -r.v : r.v })),
  },
  treemap: { type: "treemap", title: "Treemap", path: ["a", "b"], y: "v", data: tree },
  sunburst: { type: "sunburst", title: "Sunburst", path: ["a", "b"], y: "v", data: tree },
  sankey: {
    type: "sankey",
    title: "Sankey",
    path: ["from", "to"],
    y: "v",
    data: [
      { from: "Ads", to: "Signup", v: 30 },
      { from: "Ads", to: "Bounce", v: 20 },
      { from: "Search", to: "Signup", v: 50 },
      { from: "Search", to: "Bounce", v: 25 },
    ],
  },
  hexmap: {
    type: "hexmap",
    title: "Hexmap",
    x: "st",
    y: "v",
    data: [
      { st: "CA", v: 10 },
      { st: "TX", v: 20 },
      { st: "NY", v: 30 },
    ],
  },
};
