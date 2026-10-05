import { createRoot } from "react-dom/client";
import { Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";

const App = ({ data }) => (
  <>
    <h3>Income, life expectancy and population</h3>
    <ScatterChart width={640} height={300}>
      <XAxis type="number" dataKey="income" name="income" />
      <YAxis type="number" dataKey="life" name="life" domain={["auto", "auto"]} />
      <ZAxis type="number" dataKey="population" range={[60, 600]} />
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
