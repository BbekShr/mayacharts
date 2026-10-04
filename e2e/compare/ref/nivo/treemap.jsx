import { createRoot } from "react-dom/client";
import { TreeMap } from "@nivo/treemap";

const App = ({ data }) => (
  <>
    <h3>Sales by family and item</h3>
    <TreeMap
      width={640}
      height={300}
      data={{
        name: "sales",
        children: [...Map.groupBy(data, (d) => d.family)].map(([name, g]) => ({
          name,
          children: g.map((d) => ({ name: d.item, value: d.sales })),
        })),
      }}
      identity="name"
      label="id"
      value="value"
    />
  </>
);

export default async function draw(root, data) {
  const app = createRoot(root);
  app.render(<App data={data} />);
  return (next) => app.render(<App data={next} />);
}
