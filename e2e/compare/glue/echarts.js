import { chart, data, timed, canvasPainted } from "./common.js";
import { echartsOptions } from "../specs.js";

const host = document.createElement("div");
host.id = "chart";
document.getElementById("root").append(host);

await timed(() => {
  const ch = echarts.init(host, null, { width: 640, height: 360 });
  ch.setOption(echartsOptions(data)[chart]);
});
window.__probe = () => ({ painted: canvasPainted(host.querySelector("canvas")) });
