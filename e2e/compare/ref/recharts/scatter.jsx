import { createRoot } from "react-dom/client";
import { Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";

const App = ({ data }) => (
  <>
    <h3>Scatter of 500 points</h3>
    <ScatterChart width={640} height={300}>
      <XAxis type="number" dataKey="x" />
      <YAxis type="number" dataKey="y" />
      <Tooltip />
      <Scatter data={data} fill="#8884d8" />
    </ScatterChart>
  </>
);

export default async function draw(root, data) {
  const app = createRoot(root);
  app.render(<App data={data} />);
  return (next) => app.render(<App data={next} />);
}
