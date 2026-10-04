import { VERSION } from "./core/registry.ts";
import type { MayaErrorDetail, MayaSelectDetail, MayaViewDetail } from "./core/types.ts";
import { MayaChart } from "./element/maya-chart.ts";

declare global {
  interface HTMLElementTagNameMap {
    "maya-chart": MayaChart;
  }
  interface HTMLElementEventMap {
    "maya-select": CustomEvent<MayaSelectDetail>;
    "maya-view": CustomEvent<MayaViewDetail>;
    "maya-error": CustomEvent<MayaErrorDetail>;
    "maya-render": CustomEvent<Record<string, never>>;
  }
}

if (typeof customElements !== "undefined") {
  const prior = customElements.get("maya-chart") as { version?: string } | undefined;
  if (!prior) customElements.define("maya-chart", MayaChart);
  else if (prior.version !== VERSION)
    console.warn(
      `mayacharts: <maya-chart> ${prior.version ?? "(unknown)"} is already defined; ${VERSION} is not used.`,
    );
}

export { MayaChart };
export * from "./index.ts";
