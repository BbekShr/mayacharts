import * as echarts from "echarts";

const option = (data) => {
  const values = data.map((d) => d.value);
  return {
    title: { text: "Value by hour and weekday" },
    tooltip: {},
    xAxis: { type: "category", data: [...new Set(data.map((d) => d.hour))] },
    yAxis: { type: "category", data: [...new Set(data.map((d) => d.day))] },
    visualMap: {
      min: Math.min(...values),
      max: Math.max(...values),
      orient: "horizontal",
      left: "center",
      bottom: 0,
    },
    series: [{ type: "heatmap", data: data.map((d) => [d.hour, d.day, d.value]) }],
  };
};

export default async function draw(root, data) {
  const chart = echarts.init(root);
  chart.setOption(option(data));
  return (next) => chart.setOption(option(next));
}
