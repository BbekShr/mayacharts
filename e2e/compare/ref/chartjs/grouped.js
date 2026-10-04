import Chart from "chart.js/auto";

const config = (data) => {
  const labels = [...new Set(data.map((d) => d.cat))];
  const datasets = [...new Set(data.map((d) => d.region))].map((s) => ({
    label: s,
    data: labels.map((l) => data.find((d) => d.cat === l && d.region === s)?.value),
  }));
  return {
    type: "bar",
    data: { labels, datasets },
    options: {
      maintainAspectRatio: false,

      plugins: { title: { display: true, text: "Value by category and region" } },
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
