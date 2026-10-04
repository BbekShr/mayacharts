import "mayacharts/element";

export default async function draw(root, data) {
  const chart = document.createElement("maya-chart");
  chart.spec = { type: "bar", title: "Value by category", data, x: "cat", y: "value" };
  root.append(chart);
  return (next) => (chart.spec = { ...chart.spec, data: next });
}
