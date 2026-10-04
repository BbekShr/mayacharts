import { createRoot } from "react-dom/client";
import { Sankey } from "@nivo/sankey";

const App = ({ data }) => (
  <>
    <h3>Visits by channel and outcome</h3>
    <Sankey
      width={640}
      height={300}
      data={{
        nodes: [...new Set(data.flatMap((d) => [d.source, d.target]))].map((id) => ({ id })),
        links: data,
      }}
      margin={{ top: 10, right: 100, bottom: 10, left: 100 }}
    />
  </>
);

export default async function draw(root, data) {
  const app = createRoot(root);
  app.render(<App data={data} />);
  return (next) => app.render(<App data={next} />);
}
