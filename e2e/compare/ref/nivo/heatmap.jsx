import { createRoot } from "react-dom/client";
import { HeatMap } from "@nivo/heatmap";

const App = ({ data }) => (
  <>
    <h3>Value by hour and weekday</h3>
    <HeatMap
      width={640}
      height={300}
      data={[...Map.groupBy(data, (d) => d.day)].map(([id, g]) => ({
        id,
        data: g.map((d) => ({ x: d.hour, y: d.value })),
      }))}
      margin={{ top: 20, right: 20, bottom: 50, left: 60 }}
      axisBottom={{}}
      axisLeft={{}}
    />
  </>
);

export default async function draw(root, data) {
  const app = createRoot(root);
  app.render(<App data={data} />);
  return (next) => app.render(<App data={next} />);
}
