import embed from "vega-embed";

const spec = (values) => ({
  title: "Monthly value, plan and actual",
  width: "container",
  height: "container",
  data: { values },
  mark: "line",
  encoding: {
    x: { field: "date", type: "temporal" },
    y: { field: "value", type: "quantitative" },
    color: { field: "series" },
  },
});

export default async function draw(root, data) {
  await embed(root, spec(data));
  return (next) => embed(root, spec(next));
}
