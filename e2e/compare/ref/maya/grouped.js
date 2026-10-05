import "mayacharts/element";

export default async function draw(root, data) {
  const chart = document.createElement("maya-chart");
  chart.spec = {
    type: "bar",
    title: "Value by category and region",
    data,
    x: "cat",
    y: "value",
    series: "region",
  };
  root.append(chart);
  return (next) => (chart.spec = { ...chart.spec, data: next });
}
