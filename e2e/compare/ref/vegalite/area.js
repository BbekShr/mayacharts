import embed from "vega-embed";

const spec = (values) => ({
  title: "Monthly value by region, stacked",
  width: "container",
  height: "container",
  data: { values },
  mark: "area",
  encoding: {
    x: { field: "date", type: "temporal" },
    y: { field: "value", type: "quantitative" },
    color: { field: "region" },
  },
});

export default async function draw(root, data) {
  await embed(root, spec(data));
  return (next) => embed(root, spec(next));
}
