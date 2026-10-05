import { createRoot } from "react-dom/client";
import { Bar } from "@nivo/bar";

const App = ({ data }) => (
  <>
    <h3>Value by category</h3>
    <Bar
      width={640}
      height={300}
      data={data}
      keys={["value"]}
      indexBy="cat"
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
