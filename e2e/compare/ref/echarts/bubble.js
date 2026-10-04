import * as echarts from "echarts";

const option = (data) => {
  const max = Math.max(...data.map((d) => d.population));
  return {
    title: { text: "Income, life expectancy and population" },
    tooltip: { formatter: (p) => p.data[3] },
    xAxis: { type: "value", name: "income" },
    yAxis: { type: "value", name: "life", scale: true },
    series: [
      {
        type: "scatter",
        data: data.map((d) => [d.income, d.life, d.population, d.country]),
        symbolSize: (v) => Math.sqrt(v[2] / max) * 40,
      },
    ],
  };
};

export default async function draw(root, data) {
  const chart = echarts.init(root);
  chart.setOption(option(data));
  return (next) => chart.setOption(option(next));
}
