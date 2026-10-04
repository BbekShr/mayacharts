import Plotly from "plotly.js-dist-min";

const layout = { title: { text: "Value by category and region" } };

const traces = (data) =>
  [...Map.groupBy(data, (d) => d.region)].map(([name, g]) => ({
    type: "bar",
    name,
    x: g.map((d) => d.cat),
    y: g.map((d) => d.value),
  }));

export default async function draw(root, data) {
  Plotly.newPlot(root, traces(data), layout);
  return (next) => Plotly.react(root, traces(next), layout);
}
