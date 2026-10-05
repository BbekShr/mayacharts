import * as echarts from "echarts";

const option = (data) => ({
  title: { text: "Value by category" },
  tooltip: {},
  xAxis: { type: "category", data: data.map((d) => d.cat) },
  yAxis: { type: "value" },
  series: [{ type: "bar", data: data.map((d) => d.value) }],
});

export default async function draw(root, data) {
  const chart = echarts.init(root);
  chart.setOption(option(data));
  return (next) => chart.setOption(option(next));
}
