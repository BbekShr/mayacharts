import * as Plot from "@observablehq/plot";

const chart = (data) =>
  Plot.plot({
    title: "Monthly value by region, stacked",
    width: 640,
    height: 308,
    x: { type: "utc" },
    marks: [Plot.areaY(data, { x: "date", y: "value", fill: "region" }), Plot.ruleY([0])],
    color: { legend: true },
  });

export default async function draw(root, data) {
  root.append(chart(data));
  return (next) => root.replaceChildren(chart(next));
}
