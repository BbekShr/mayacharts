import Plotly from "plotly.js-dist-min";

const layout = { title: { text: "Value by category" } };

const traces = (data) => [{ type: "bar", x: data.map((d) => d.cat), y: data.map((d) => d.value) }];

export default async function draw(root, data) {
  Plotly.newPlot(root, traces(data), layout);
  return (next) => Plotly.react(root, traces(next), layout);
}
