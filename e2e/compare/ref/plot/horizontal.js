import * as Plot from "@observablehq/plot";

const chart = (data) =>
  Plot.plot({
    title: "Value by category, horizontal",
    width: 640,
    height: 292,
    marginLeft: 60,
    marks: [Plot.barX(data, { y: "cat", x: "value" }), Plot.ruleX([0])],
  });

export default async function draw(root, data) {
  root.append(chart(data));
  return (next) => root.replaceChildren(chart(next));
}
