import * as Plot from "@observablehq/plot";

const chart = (data) =>
  Plot.plot({
    title: "Value by hour and weekday",
    width: 640,
    height: 296,
    x: { type: "band" },
    y: { domain: [...new Set(data.map((d) => d.day))] },
    marks: [Plot.cell(data, { x: "hour", y: "day", fill: "value" })],
    color: { legend: true },
  });

export default async function draw(root, data) {
  root.append(chart(data));
  return (next) => root.replaceChildren(chart(next));
}
