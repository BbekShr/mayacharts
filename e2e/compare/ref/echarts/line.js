import * as echarts from "echarts";

const option = (data) => ({
  title: { text: "Monthly value" },
  tooltip: { trigger: "axis" },
  xAxis: { type: "time" },
  yAxis: { type: "value" },
  series: [{ type: "line", showSymbol: false, data: data.map((d) => [d.date, d.value]) }],
});

export default async function draw(root, data) {
  const chart = echarts.init(root);
  chart.setOption(option(data));
  return (next) => chart.setOption(option(next));
}
