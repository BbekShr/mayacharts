import Plotly from "plotly.js-dist-min";

const layout = { title: { text: "Visits by channel and outcome" } };

const traces = (data) => {
  const names = [...new Set(data.flatMap((d) => [d.source, d.target]))];
  return [
    {
      type: "sankey",
      node: { label: names },
      link: {
        source: data.map((d) => names.indexOf(d.source)),
        target: data.map((d) => names.indexOf(d.target)),
        value: data.map((d) => d.value),
      },
    },
  ];
};

export default async function draw(root, data) {
  Plotly.newPlot(root, traces(data), layout);
  return (next) => Plotly.react(root, traces(next), layout);
}
