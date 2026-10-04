import Chart from "chart.js/auto";

const config = (data) => {
  const labels = [...new Set(data.map((d) => d.date))];
  const datasets = [...new Set(data.map((d) => d.series))].map((s) => ({
    label: s,
    data: labels.map((l) => data.find((d) => d.date === l && d.series === s)?.value),
  }));
  return {
    type: "line",
    data: { labels, datasets },
    options: {
      maintainAspectRatio: false,

      plugins: { title: { display: true, text: "Monthly value, plan and actual" } },
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
