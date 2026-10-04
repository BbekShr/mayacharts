import "mayacharts/element";

export default async function draw(root, data) {
  const chart = document.createElement("maya-chart");
  chart.spec = {
    type: "area",
    title: "Monthly value by region, stacked",
    data,
    x: "date",
    y: "value",
    series: "region",
    stack: true,
  };
  root.append(chart);
  return (next) => (chart.spec = { ...chart.spec, data: next });
}
