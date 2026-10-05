import embed from "vega-embed";

const spec = (values) => ({
  title: "Value by category, stacked by region",
  width: "container",
  height: "container",
  data: { values },
  mark: "bar",
  encoding: {
    x: { field: "cat", type: "nominal" },
    y: { field: "value", type: "quantitative" },
    color: { field: "region" },
  },
});

export default async function draw(root, data) {
  await embed(root, spec(data));
  return (next) => embed(root, spec(next));
}
