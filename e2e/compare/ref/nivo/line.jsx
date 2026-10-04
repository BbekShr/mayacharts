import { createRoot } from "react-dom/client";
import { Line } from "@nivo/line";

const App = ({ data }) => (
  <>
    <h3>Monthly value</h3>
    <Line
      width={640}
      height={300}
      data={[{ id: "value", data: data.map((d) => ({ x: d.date, y: d.value })) }]}
      yScale={{ type: "linear", min: "auto", max: "auto" }}
      margin={{ top: 20, right: 20, bottom: 50, left: 60 }}
      xScale={{ type: "time", format: "%Y-%m-%d" }}
      axisBottom={{ format: "%b %Y", tickValues: "every 6 months" }}
      axisLeft={{}}
    />
  </>
);

export default async function draw(root, data) {
  const app = createRoot(root);
  app.render(<App data={data} />);
  return (next) => app.render(<App data={next} />);
}
