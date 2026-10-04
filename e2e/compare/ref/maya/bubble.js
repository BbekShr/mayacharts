import "mayacharts/element";

export default async function draw(root, data) {
  const chart = document.createElement("maya-chart");
  chart.spec = {
    type: "scatter",
    title: "Income, life expectancy and population",
    data,
    x: "income",
    y: "life",
    size: "population",
    name: "country",
  };
  root.append(chart);
  return (next) => (chart.spec = { ...chart.spec, data: next });
}
