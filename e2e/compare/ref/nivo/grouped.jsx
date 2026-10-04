import { createRoot } from "react-dom/client";
import { Bar } from "@nivo/bar";

const App = ({ data }) => (
  <>
    <h3>Value by category and region</h3>
    <Bar
      width={640}
      height={300}
      data={[...Map.groupBy(data, (d) => d.cat)].map(([cat, g]) => ({
        cat,
        ...Object.fromEntries(g.map((d) => [d.region, d.value])),
      }))}
      keys={[...new Set(data.map((d) => d.region))]}
      indexBy="cat"
      groupMode="grouped"
      margin={{ top: 20, right: 110, bottom: 50, left: 60 }}
      axisBottom={{}}
      axisLeft={{}}
      legends={[
        {
          dataFrom: "keys",
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
