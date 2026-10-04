// The four charts as plain data, shared by the browser glue and the node SSR check.
// No browser globals here: this file is imported by node as well.
export const TITLES = {
  bar: "Grouped bar: value by category and series",
  line: "Monthly values, two series",
  scatter: "Scatter of 50000 points",
  heatmap: "Heatmap: value by hour and weekday",
};

export function mayaSpecs(data) {
  return {
    bar: { type: "bar", data: data.bar, x: "cat", y: "value", series: "series" },
    line: {
      type: "line",
      data: data.line,
      x: "t",
      y: "value",
      series: "series",
      format: { t: "month" },
    },
    scatter: { type: "scatter", data: data.scatter, x: "x", y: "y" },
    heatmap: { type: "heatmap", data: data.heatmap, x: "hour", y: "value", series: "day" },
  };
}

export function echartsOptions(data) {
  const { SERIES, LINES, DAYS } = data.meta;
  const common = (c) => ({ animation: false, aria: { enabled: true }, title: { text: TITLES[c] } });
  return {
    bar: {
      ...common("bar"),
      legend: {},
      xAxis: { type: "category", data: [...new Set(data.bar.map((r) => r.cat))] },
      yAxis: {},
      series: SERIES.map((s) => ({
        name: s,
        type: "bar",
        data: data.bar.filter((r) => r.series === s).map((r) => r.value),
      })),
    },
    line: {
      ...common("line"),
      legend: {},
      xAxis: { type: "time" },
      yAxis: { scale: true },
      series: LINES.map((s) => ({
        name: s,
        type: "line",
        showSymbol: false,
        data: data.line.filter((r) => r.series === s).map((r) => [r.t, r.value]),
      })),
    },
    scatter: {
      ...common("scatter"),
      xAxis: {},
      yAxis: {},
      series: [{ type: "scatter", symbolSize: 2, data: data.scatter.map((r) => [r.x, r.y]) }],
    },
    heatmap: {
      ...common("heatmap"),
      xAxis: { type: "category", data: [...new Set(data.heatmap.map((r) => r.hour))] },
      yAxis: { type: "category", data: DAYS },
      visualMap: { min: 0, max: 100, orient: "horizontal", left: "center", bottom: 0 },
      series: [{ type: "heatmap", data: data.heatmap.map((r) => [r.hour, r.day, r.value]) }],
    },
  };
}
