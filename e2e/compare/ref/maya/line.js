import "mayacharts/element";

export default async function draw(root, data) {
  const chart = document.createElement("maya-chart");
  chart.spec = { type: "line", title: "Monthly value", data, x: "date", y: "value" };
  root.append(chart);
  return (next) => (chart.spec = { ...chart.spec, data: next });
}
