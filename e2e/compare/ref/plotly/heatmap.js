import Plotly from "plotly.js-dist-min";

const layout = { title: { text: "Value by hour and weekday" } };

const traces = (data) => {
  const days = [...new Set(data.map((d) => d.day))];
  const hours = [...new Set(data.map((d) => d.hour))];
  const z = days.map((day) =>
    hours.map((hour) => data.find((d) => d.day === day && d.hour === hour).value),
  );
  return [{ type: "heatmap", x: hours, y: days, z }];
};

export default async function draw(root, data) {
  Plotly.newPlot(root, traces(data), layout);
  return (next) => Plotly.react(root, traces(next), layout);
}
