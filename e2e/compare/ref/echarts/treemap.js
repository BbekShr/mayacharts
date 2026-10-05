import * as echarts from "echarts";

const option = (data) => ({
  title: { text: "Sales by family and item" },
  tooltip: {},
  series: [
    {
      type: "treemap",
      data: [...new Set(data.map((d) => d.family))].map((family) => ({
        name: family,
        children: data
          .filter((d) => d.family === family)
          .map((d) => ({ name: d.item, value: d.sales })),
      })),
    },
  ],
});

export default async function draw(root, data) {
  const chart = echarts.init(root);
  chart.setOption(option(data));
  return (next) => chart.setOption(option(next));
}
