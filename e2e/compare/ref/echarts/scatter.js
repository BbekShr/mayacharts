import * as echarts from "echarts";

const option = (data) => ({
  title: { text: "Scatter of 500 points" },
  tooltip: {},
  xAxis: { type: "value" },
  yAxis: { type: "value" },
  series: [{ type: "scatter", data: data.map((d) => [d.x, d.y]) }],
});

export default async function draw(root, data) {
  const chart = echarts.init(root);
  chart.setOption(option(data));
  return (next) => chart.setOption(option(next));
}
