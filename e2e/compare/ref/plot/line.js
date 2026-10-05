import * as Plot from "@observablehq/plot";

const chart = (data) =>
  Plot.plot({
    title: "Monthly value",
    width: 640,
    height: 292,
    x: { type: "utc" },
    marks: [Plot.lineY(data, { x: "date", y: "value" })],
  });

export default async function draw(root, data) {
  root.append(chart(data));
  return (next) => root.replaceChildren(chart(next));
}
