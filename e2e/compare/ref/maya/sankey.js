import "mayacharts/element";
import "mayacharts/flow";

export default async function draw(root, data) {
  const chart = document.createElement("maya-chart");
  chart.spec = {
    type: "sankey",
    title: "Visits by channel and outcome",
    data,
    path: ["source", "target"],
    y: "value",
  };
  root.append(chart);
  return (next) => (chart.spec = { ...chart.spec, data: next });
}
