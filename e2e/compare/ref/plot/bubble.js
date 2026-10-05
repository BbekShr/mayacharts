import * as Plot from "@observablehq/plot";

const chart = (data) =>
  Plot.plot({
    title: "Income, life expectancy and population",
    width: 640,
    height: 292,
    grid: true,
    marks: [
      Plot.dot(data, { x: "income", y: "life", r: "population", title: "country", tip: true }),
    ],
  });

export default async function draw(root, data) {
  root.append(chart(data));
  return (next) => root.replaceChildren(chart(next));
}
