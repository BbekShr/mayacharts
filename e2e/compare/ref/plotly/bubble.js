import Plotly from "plotly.js-dist-min";

const layout = { title: { text: "Income, life expectancy and population" } };

const traces = (data) => [
  {
    type: "scatter",
    mode: "markers",
    x: data.map((d) => d.income),
    y: data.map((d) => d.life),
    text: data.map((d) => d.country),
    marker: { size: data.map((d) => d.population), sizemode: "area", sizeref: 0.5, sizemin: 4 },
  },
];

export default async function draw(root, data) {
  Plotly.newPlot(root, traces(data), layout);
  return (next) => Plotly.react(root, traces(next), layout);
}
