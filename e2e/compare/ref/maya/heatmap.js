import "mayacharts/element";

export default async function draw(root, data) {
  const chart = document.createElement("maya-chart");
  chart.spec = {
    type: "heatmap",
    title: "Value by hour and weekday",
    data,
    x: "hour",
    y: "value",
    series: "day",
  };
  root.append(chart);
  return (next) => (chart.spec = { ...chart.spec, data: next });
}
