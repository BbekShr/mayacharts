import embed from "vega-embed";

const spec = (values) => ({
  title: "Scatter of 500 points",
  width: "container",
  height: "container",
  data: { values },
  mark: "point",
  encoding: {
    x: { field: "x", type: "quantitative" },
    y: { field: "y", type: "quantitative" },
  },
});

export default async function draw(root, data) {
  await embed(root, spec(data));
  return (next) => embed(root, spec(next));
}
