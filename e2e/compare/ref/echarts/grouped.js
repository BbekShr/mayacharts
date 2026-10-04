import * as echarts from "echarts";

const option = (data) => ({
  title: { text: "Value by category and region" },
  tooltip: { trigger: "axis" },
  legend: { bottom: 0 },
  xAxis: { type: "category", data: [...new Set(data.map((d) => d.cat))] },
  yAxis: { type: "value" },
  series: [...new Set(data.map((d) => d.region))].map((region) => ({
    name: region,
    type: "bar",
    data: data.filter((d) => d.region === region).map((d) => d.value),
  })),
});

export default async function draw(root, data) {
  const chart = echarts.init(root);
  chart.setOption(option(data));
  return (next) => chart.setOption(option(next));
}
