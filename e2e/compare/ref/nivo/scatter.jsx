import { createRoot } from "react-dom/client";
import { ScatterPlot } from "@nivo/scatterplot";

const App = ({ data }) => (
  <>
    <h3>Scatter of 500 points</h3>
    <ScatterPlot
      width={640}
      height={300}
      data={[{ id: "points", data }]}
      xScale={{ type: "linear", min: "auto", max: "auto" }}
      yScale={{ type: "linear", min: "auto", max: "auto" }}
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
