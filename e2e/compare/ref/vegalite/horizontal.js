import embed from "vega-embed";

const spec = (values) => ({
  title: "Value by category, horizontal",
  width: "container",
  height: "container",
  data: { values },
  mark: "bar",
  encoding: {
    y: { field: "cat", type: "nominal" },
    x: { field: "value", type: "quantitative" },
  },
});

export default async function draw(root, data) {
  await embed(root, spec(data));
  return (next) => embed(root, spec(next));
}
