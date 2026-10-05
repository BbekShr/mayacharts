import { createRoot } from "react-dom/client";
import { Tooltip, Treemap } from "recharts";

const App = ({ data }) => {
  const tree = [...Map.groupBy(data, (d) => d.family)].map(([name, g]) => ({
    name,
    children: g.map((d) => ({ name: d.item, size: d.sales })),
  }));
  return (
    <>
      <h3>Sales by family and item</h3>
      <Treemap width={640} height={300} data={tree} dataKey="size" nameKey="name">
        <Tooltip />
      </Treemap>
    </>
  );
};

export default async function draw(root, data) {
  const app = createRoot(root);
  app.render(<App data={data} />);
  return (next) => app.render(<App data={next} />);
}
