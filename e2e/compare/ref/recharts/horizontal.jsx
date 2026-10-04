import { createRoot } from "react-dom/client";
import { Bar, BarChart, Tooltip, XAxis, YAxis } from "recharts";

const App = ({ data }) => (
  <>
    <h3>Value by category, horizontal</h3>
    <BarChart width={640} height={300} data={data} layout="vertical">
      <XAxis type="number" />
      <YAxis type="category" dataKey="cat" />
      <Tooltip />
      <Bar dataKey="value" fill="#8884d8" />
    </BarChart>
  </>
);

export default async function draw(root, data) {
  const app = createRoot(root);
  app.render(<App data={data} />);
  return (next) => app.render(<App data={next} />);
}
