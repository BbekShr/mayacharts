import Plotly from "plotly.js-dist-min";

const layout = { title: { text: "Monthly value" } };

const traces = (data) => [
  { type: "scatter", mode: "lines", x: data.map((d) => d.date), y: data.map((d) => d.value) },
];

export default async function draw(root, data) {
  Plotly.newPlot(root, traces(data), layout);
  return (next) => Plotly.react(root, traces(next), layout);
}
