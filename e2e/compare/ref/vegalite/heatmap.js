import embed from "vega-embed";

const spec = (values) => ({
  title: "Value by hour and weekday",
  width: "container",
  height: "container",
  data: { values },
  mark: "rect",
  encoding: {
    x: { field: "hour", type: "ordinal" },
    y: { field: "day", type: "ordinal", sort: null },
    color: { field: "value", type: "quantitative" },
  },
});

export default async function draw(root, data) {
  await embed(root, spec(data));
  return (next) => embed(root, spec(next));
}
