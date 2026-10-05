import { createRoot } from "react-dom/client";
import { Sankey, Tooltip } from "recharts";

const App = ({ data }) => {
  const names = [...new Set(data.flatMap((d) => [d.source, d.target]))];
  const links = data.map((d) => ({
    source: names.indexOf(d.source),
    target: names.indexOf(d.target),
    value: d.value,
  }));
  return (
    <>
      <h3>Visits by channel and outcome</h3>
      <Sankey
        width={640}
        height={300}
        margin={{ right: 80 }}
        data={{ nodes: names.map((name) => ({ name })), links }}
        node={({ x, y, width, height, payload }) => (
          <g>
            <rect x={x} y={y} width={width} height={height} fill="#8884d8" />
            <text x={x + width + 6} y={y + height / 2} dy="0.35em" fontSize={12}>
              {payload.name}
            </text>
          </g>
        )}
      >
        <Tooltip />
      </Sankey>
    </>
  );
};

export default async function draw(root, data) {
  const app = createRoot(root);
  app.render(<App data={data} />);
  return (next) => app.render(<App data={next} />);
}
