import * as Plot from "@observablehq/plot";

const chart = (data) =>
  Plot.plot({
    title: "Scatter of 500 points",
    width: 640,
    height: 292,
    grid: true,
    marks: [Plot.dot(data, { x: "x", y: "y" })],
  });

export default async function draw(root, data) {
  root.append(chart(data));
  return (next) => root.replaceChildren(chart(next));
}
