import Chart from "chart.js/auto";

export default async function draw(root, data) {
  const canvas = document.createElement("canvas");
  root.append(canvas);
  const chart = new Chart(canvas, {
    type: "scatter",
    data: { datasets: [{ label: "points", data }] },
    options: {
      maintainAspectRatio: false,
      plugins: { title: { display: true, text: "Scatter of 500 points" } },
    },
  });
  return (next) => {
    chart.data.datasets[0].data = next;
    chart.update();
  };
}
