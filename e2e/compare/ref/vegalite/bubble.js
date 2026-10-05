import embed from "vega-embed";

const spec = (values) => ({
  title: "Income, life expectancy and population",
  width: "container",
  height: "container",
  data: { values },
  mark: { type: "circle", tooltip: true },
  encoding: {
    x: { field: "income", type: "quantitative" },
    y: { field: "life", type: "quantitative", scale: { zero: false } },
    size: { field: "population", type: "quantitative" },
    tooltip: { field: "country" },
  },
});

export default async function draw(root, data) {
  await embed(root, spec(data));
  return (next) => embed(root, spec(next));
}
