import Plotly from "plotly.js-dist-min";

const layout = { title: { text: "Scatter of 500 points" } };

const traces = (data) => [
  { type: "scatter", mode: "markers", x: data.map((d) => d.x), y: data.map((d) => d.y) },
];

export default async function draw(root, data) {
  Plotly.newPlot(root, traces(data), layout);
  return (next) => Plotly.react(root, traces(next), layout);
}
