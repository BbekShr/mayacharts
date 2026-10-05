import * as echarts from "echarts";

const option = (data) => ({
  title: { text: "Monthly value, plan and actual" },
  tooltip: { trigger: "axis" },
  legend: { bottom: 0 },
  xAxis: { type: "time" },
  yAxis: { type: "value" },
  series: [...new Set(data.map((d) => d.series))].map((name) => ({
    name,
    type: "line",
    showSymbol: false,
    data: data.filter((d) => d.series === name).map((d) => [d.date, d.value]),
  })),
});

export default async function draw(root, data) {
  const chart = echarts.init(root);
  chart.setOption(option(data));
  return (next) => chart.setOption(option(next));
}
