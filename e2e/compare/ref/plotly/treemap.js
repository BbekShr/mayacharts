import Plotly from "plotly.js-dist-min";

const layout = { title: { text: "Sales by family and item" } };

const traces = (data) => {
  const families = [...new Set(data.map((d) => d.family))];
  return [
    {
      type: "treemap",
      labels: [...families, ...data.map((d) => d.item)],
      parents: [...families.map(() => ""), ...data.map((d) => d.family)],
      values: [...families.map(() => 0), ...data.map((d) => d.sales)],
      branchvalues: "remainder",
    },
  ];
};

export default async function draw(root, data) {
  Plotly.newPlot(root, traces(data), layout);
  return (next) => Plotly.react(root, traces(next), layout);
}
