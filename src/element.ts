import { MayaChart } from "./element/maya-chart.ts";

if (typeof customElements !== "undefined" && !customElements.get("maya-chart")) {
  customElements.define("maya-chart", MayaChart);
}

export { MayaChart };
export * from "./index.ts";
