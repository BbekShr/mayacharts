import { chart, data, LINES, SERIES, month, timed, canvasPainted } from "./common.js";
import { TITLES } from "../specs.js";

const c = document.createElement("canvas");
c.id = "chart";
c.setAttribute("role", "img");
c.setAttribute("aria-label", TITLES[chart]);
document.getElementById("root").append(c);

const options = {
  responsive: false,
  animation: false,
  plugins: { title: { display: true, text: TITLES[chart] } },
};
const configs = {
  bar: () => ({
    type: "bar",
    data: {
      labels: [...new Set(data.bar.map((r) => r.cat))],
      datasets: SERIES.map((s) => ({
        label: s,
        data: data.bar.filter((r) => r.series === s).map((r) => r.value),
      })),
    },
    options,
  }),
  // Chart.js has no time scale without a separate date adapter, so months are category labels.
  line: () => ({
    type: "line",
    data: {
      labels: data.line.filter((r) => r.series === LINES[0]).map((r) => month(r.t)),
      datasets: LINES.map((s) => ({
        label: s,
        data: data.line.filter((r) => r.series === s).map((r) => r.value),
      })),
    },
    options,
  }),
  scatter: () => ({
    type: "scatter",
    data: { datasets: [{ label: "points", data: data.scatter, pointRadius: 1 }] },
    options,
  }),
};

if (!configs[chart]) {
  window.__done = { ok: false, unsupported: true, error: "no heatmap type in Chart.js core" };
} else {
  c.width = 640;
  c.height = 360;
  await timed(() => new Chart(c, configs[chart]()));
}
window.__probe = () => ({ painted: canvasPainted(c) });
