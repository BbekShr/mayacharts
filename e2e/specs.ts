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
  boxplot: {
    type: "boxplot",
    title: "Boxplot",
    x: "k",
    y: "v",
    data: [
      { k: "A", v: 10 },
      { k: "A", v: 12 },
      { k: "A", v: 14 },
      { k: "A", v: 16 },
      { k: "B", v: 15 },
      { k: "B", v: 17 },
      { k: "B", v: 19 },
      { k: "B", v: 21 },
      { k: "C", v: 20 },
      { k: "C", v: 22 },
      { k: "C", v: 24 },
      { k: "C", v: 26 },
    ],
  },
  funnel: {
    type: "funnel",
    title: "Funnel",
    x: "stage",
    y: "value",
    data: [
      { stage: "Aware", value: 100 },
      { stage: "Interested", value: 80 },
      { stage: "Engaged", value: 60 },
      { stage: "Converted", value: 40 },
      { stage: "Retained", value: 30 },
    ],
  },
};

/** Playback: three frames of one bar chart (not in SPECS: the gallery specs are one per type). */
export const FRAME: object = {
  type: "bar",
  title: "Sales",
  x: "k",
  y: "v",
  frame: "yr",
  data: ["2021", "2022", "2023"].flatMap((yr, i) =>
    rows.map((r) => ({ ...r, yr, v: r.v * (i + 1) })),
  ),
};
