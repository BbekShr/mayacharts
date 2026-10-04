import Chart from "chart.js/auto";

export default async function draw(root, data) {
  const canvas = document.createElement("canvas");
  root.append(canvas);
  const max = Math.max(...data.map((d) => d.population));
  const chart = new Chart(canvas, {
    type: "bubble",
    data: {
      datasets: [
        {
          label: "countries",
          data: data.map((d) => ({
            x: d.income,
            y: d.life,
            r: Math.sqrt(d.population / max) * 20,
          })),
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: "Income, life expectancy and population" },
        tooltip: { callbacks: { label: (c) => data[c.dataIndex].country } },
      },
    },
  });
  return (next) => {
    chart.data.datasets[0].data = next.map((d) => ({
      x: d.income,
      y: d.life,
      r: Math.sqrt(d.population / max) * 20,
    }));
    chart.update();
  };
}
