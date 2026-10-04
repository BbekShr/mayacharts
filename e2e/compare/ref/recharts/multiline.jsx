import { createRoot } from "react-dom/client";
import { Legend, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";

const colors = ["#8884d8", "#82ca9d", "#ffc658", "#ff8042"];

const App = ({ data }) => {
  const names = [...new Set(data.map((d) => d.series))];
  const rows = [...Map.groupBy(data, (d) => d.date)].map(([date, g]) => ({
    date,
    ...Object.fromEntries(g.map((d) => [d.series, d.value])),
  }));
  return (
    <>
      <h3>Monthly value, plan and actual</h3>
      <LineChart width={640} height={300} data={rows}>
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip />
        <Legend />
        {names.map((n, i) => (
          <Line key={n} dataKey={n} stroke={colors[i % 4]} />
        ))}
      </LineChart>
    </>
  );
};

export default async function draw(root, data) {
  const app = createRoot(root);
  app.render(<App data={data} />);
  return (next) => app.render(<App data={next} />);
}
