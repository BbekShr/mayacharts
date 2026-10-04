import { chart, data, timed } from "./common.js";
import { mayaSpecs, TITLES } from "../specs.js";

const el = document.createElement("maya-chart");
el.id = "chart";
document.getElementById("root").append(el);
let error = "";
el.addEventListener("maya-error", (e) => (error = e.detail.message.split("\n")[0]));
await timed(() => {
  el.spec = { ...mayaSpecs(data)[chart], title: TITLES[chart] };
});
window.__probe = () => ({
  error,
  painted: (el.shadowRoot?.querySelectorAll("[data-maya=mark]").length ?? 0) > 0,
});
