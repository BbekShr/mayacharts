import * as Plot from "@observablehq/plot";

const chart = (data) =>
  Plot.plot({
    title: "Value by category, stacked by region",
    width: 640,
    height: 254,
    marks: [Plot.barY(data, { x: "cat", y: "value", fill: "region" }), Plot.ruleY([0])],
    color: { legend: true },
  });

export default async function draw(root, data) {
  root.append(chart(data));
  return (next) => root.replaceChildren(chart(next));
}
