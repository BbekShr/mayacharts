import "mayacharts/element";
import "mayacharts/hierarchy";

export default async function draw(root, data) {
  const chart = document.createElement("maya-chart");
  chart.spec = {
    type: "treemap",
    title: "Sales by family and item",
    data,
    path: ["family", "item"],
    y: "sales",
  };
  root.append(chart);
  return (next) => (chart.spec = { ...chart.spec, data: next });
}
