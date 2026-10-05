import * as Plot from "@observablehq/plot";

const chart = (data) =>
  Plot.plot({
    title: "Value by category and region",
    width: 640,
    height: 254,
    marks: [
      Plot.barY(data, { fx: "cat", x: "region", y: "value", fill: "region" }),
      Plot.ruleY([0]),
    ],
    x: { axis: null },
    color: { legend: true },
  });

export default async function draw(root, data) {
  root.append(chart(data));
  return (next) => root.replaceChildren(chart(next));
}
