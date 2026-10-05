import embed from "vega-embed";

const spec = (values) => ({
  title: "Value by category",
  width: "container",
  height: "container",
  data: { values },
  mark: "bar",
  encoding: {
    x: { field: "cat", type: "nominal" },
    y: { field: "value", type: "quantitative" },
  },
});

export default async function draw(root, data) {
  await embed(root, spec(data));
  return (next) => embed(root, spec(next));
}
