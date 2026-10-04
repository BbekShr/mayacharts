import { createRoot } from "react-dom/client";
import { Line } from "@nivo/line";

const App = ({ data }) => (
  <>
    <h3>Monthly value by region, stacked</h3>
    <Line
      width={640}
      height={300}
      data={[...Map.groupBy(data, (d) => d.region)].map(([id, g]) => ({
        id,
        data: g.map((d) => ({ x: d.date, y: d.value })),
      }))}
      yScale={{ type: "linear", stacked: true }}
      enableArea
      margin={{ top: 20, right: 110, bottom: 50, left: 60 }}
      xScale={{ type: "time", format: "%Y-%m-%d" }}
      axisBottom={{ format: "%b %Y", tickValues: "every 6 months" }}
      axisLeft={{}}
      legends={[
        {
          anchor: "bottom-right",
          direction: "column",
          translateX: 100,
          itemWidth: 80,
          itemHeight: 20,
        },
      ]}
    />
  </>
);

export default async function draw(root, data) {
  const app = createRoot(root);
  app.render(<App data={data} />);
  return (next) => app.render(<App data={next} />);
}
