import Plotly from "plotly.js-dist-min";

const layout = { title: { text: "Value by category, horizontal" } };

const traces = (data) => [
  { type: "bar", orientation: "h", x: data.map((d) => d.value), y: data.map((d) => d.cat) },
];

export default async function draw(root, data) {
  Plotly.newPlot(root, traces(data), layout);
  return (next) => Plotly.react(root, traces(next), layout);
}
