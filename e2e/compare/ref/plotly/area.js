import Plotly from "plotly.js-dist-min";

const layout = { title: { text: "Monthly value by region, stacked" } };

const traces = (data) =>
  [...Map.groupBy(data, (d) => d.region)].map(([name, g]) => ({
    type: "scatter",
    mode: "lines",
    stackgroup: "one",
    name,
    x: g.map((d) => d.date),
    y: g.map((d) => d.value),
  }));

export default async function draw(root, data) {
  Plotly.newPlot(root, traces(data), layout);
  return (next) => Plotly.react(root, traces(next), layout);
}
