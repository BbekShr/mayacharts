import Chart from "chart.js/auto";

const config = (data) => {
  const labels = data.map((d) => d.date);
  const datasets = [{ label: "value", data: data.map((d) => d.value) }];
  return {
    type: "line",
    data: { labels, datasets },
    options: {
      maintainAspectRatio: false,

      plugins: { title: { display: true, text: "Monthly value" } },
    },
  };
};

export default async function draw(root, data) {
  const canvas = document.createElement("canvas");
  root.append(canvas);
  const chart = new Chart(canvas, config(data));
  return (next) => {
    chart.data = config(next).data;
    chart.update();
  };
}
