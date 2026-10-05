import "mayacharts/element";

export default async function draw(root, data) {
  const chart = document.createElement("maya-chart");
  chart.spec = { type: "scatter", title: "Scatter of 500 points", data, x: "x", y: "y" };
  root.append(chart);
  return (next) => (chart.spec = { ...chart.spec, data: next });
}
