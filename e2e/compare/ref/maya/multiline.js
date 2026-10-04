import "mayacharts/element";

export default async function draw(root, data) {
  const chart = document.createElement("maya-chart");
  chart.spec = {
    type: "line",
    title: "Monthly value, plan and actual",
    data,
    x: "date",
    y: "value",
    series: "series",
  };
  root.append(chart);
  return (next) => (chart.spec = { ...chart.spec, data: next });
}
