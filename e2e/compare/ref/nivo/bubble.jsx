import { createRoot } from "react-dom/client";
import { ScatterPlot } from "@nivo/scatterplot";

const App = ({ data }) => (
  <>
    <h3>Income, life expectancy and population</h3>
    <ScatterPlot
      width={640}
      height={300}
      data={[
        {
          id: "countries",
          data: data.map((d) => ({ x: d.income, y: d.life, size: d.population })),
        },
      ]}
      xScale={{ type: "linear", min: "auto", max: "auto" }}
      yScale={{ type: "linear", min: "auto", max: "auto" }}
      nodeSize={{ key: "data.size", values: [2, 300], sizes: [6, 36] }}
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
