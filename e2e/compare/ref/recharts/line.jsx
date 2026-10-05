import { createRoot } from "react-dom/client";
import { Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";

const App = ({ data }) => (
  <>
    <h3>Monthly value</h3>
    <LineChart width={640} height={300} data={data}>
      <XAxis dataKey="date" />
      <YAxis />
      <Tooltip />
      <Line dataKey="value" stroke="#8884d8" />
    </LineChart>
  </>
);

export default async function draw(root, data) {
  const app = createRoot(root);
  app.render(<App data={data} />);
  return (next) => app.render(<App data={next} />);
}
