import Plotly from "plotly.js-dist-min";

const layout = { title: { text: "Monthly value, plan and actual" } };

const traces = (data) =>
  [...Map.groupBy(data, (d) => d.series)].map(([name, g]) => ({
    type: "scatter",
    mode: "lines",
    name,
    x: g.map((d) => d.date),
    y: g.map((d) => d.value),
  }));

export default async function draw(root, data) {
  Plotly.newPlot(root, traces(data), layout);
  return (next) => Plotly.react(root, traces(next), layout);
}
