import Chart from "chart.js/auto";

const config = (data) => {
  const labels = [...new Set(data.map((d) => d.date))];
  const datasets = [...new Set(data.map((d) => d.region))].map((s) => ({
    label: s,
    fill: true,
    data: labels.map((l) => data.find((d) => d.date === l && d.region === s)?.value),
  }));
  return {
    type: "line",
    data: { labels, datasets },
    options: {
      maintainAspectRatio: false,
      scales: { y: { stacked: true } },
      plugins: { title: { display: true, text: "Monthly value by region, stacked" } },
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
