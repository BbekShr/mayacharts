import * as Plot from "@observablehq/plot";

const chart = (data) =>
  Plot.plot({
    title: "Value by category",
    width: 640,
    height: 350,
    marks: [Plot.barY(data, { x: "cat", y: "value" }), Plot.ruleY([0])],
  });

export default async function draw(root, data) {
  root.append(chart(data));
  return (next) => root.replaceChildren(chart(next));
}
