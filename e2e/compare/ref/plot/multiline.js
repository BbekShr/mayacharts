import * as Plot from "@observablehq/plot";

const chart = (data) =>
  Plot.plot({
    title: "Monthly value, plan and actual",
    width: 640,
    height: 308,
    x: { type: "utc" },
    marks: [Plot.lineY(data, { x: "date", y: "value", stroke: "series" })],
    color: { legend: true },
  });

export default async function draw(root, data) {
  root.append(chart(data));
  return (next) => root.replaceChildren(chart(next));
}
