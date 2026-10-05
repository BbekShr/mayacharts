import * as echarts from "echarts";

const option = (data) => ({
  title: { text: "Visits by channel and outcome" },
  tooltip: {},
  series: [
    {
      type: "sankey",
      top: 40,
      data: [...new Set(data.flatMap((d) => [d.source, d.target]))].map((name) => ({ name })),
      links: data,
    },
  ],
});

export default async function draw(root, data) {
  const chart = echarts.init(root);
  chart.setOption(option(data));
  return (next) => chart.setOption(option(next));
}
