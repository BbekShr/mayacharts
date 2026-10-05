import { createRoot } from "react-dom/client";
import { Bar, BarChart, Legend, Tooltip, XAxis, YAxis } from "recharts";

const colors = ["#8884d8", "#82ca9d", "#ffc658", "#ff8042"];

const App = ({ data }) => {
  const regions = [...new Set(data.map((d) => d.region))];
  const rows = [...Map.groupBy(data, (d) => d.cat)].map(([cat, g]) => ({
    cat,
    ...Object.fromEntries(g.map((d) => [d.region, d.value])),
  }));
  return (
    <>
      <h3>Value by category and region</h3>
      <BarChart width={640} height={300} data={rows}>
        <XAxis dataKey="cat" />
        <YAxis />
        <Tooltip />
        <Legend />
        {regions.map((r, i) => (
          <Bar key={r} dataKey={r} fill={colors[i % 4]} />
        ))}
      </BarChart>
    </>
  );
};

export default async function draw(root, data) {
  const app = createRoot(root);
  app.render(<App data={data} />);
  return (next) => app.render(<App data={next} />);
}
