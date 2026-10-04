import { createRoot } from "react-dom/client";
import { Area, AreaChart, Legend, Tooltip, XAxis, YAxis } from "recharts";

const colors = ["#8884d8", "#82ca9d", "#ffc658", "#ff8042"];

const App = ({ data }) => {
  const regions = [...new Set(data.map((d) => d.region))];
  const rows = [...Map.groupBy(data, (d) => d.date)].map(([date, g]) => ({
    date,
    ...Object.fromEntries(g.map((d) => [d.region, d.value])),
  }));
  return (
    <>
      <h3>Monthly value by region, stacked</h3>
      <AreaChart width={640} height={300} data={rows}>
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip />
        <Legend />
        {regions.map((r, i) => (
          <Area key={r} dataKey={r} stackId="a" stroke={colors[i % 4]} fill={colors[i % 4]} />
        ))}
      </AreaChart>
    </>
  );
};

export default async function draw(root, data) {
  const app = createRoot(root);
  app.render(<App data={data} />);
  return (next) => app.render(<App data={next} />);
}
