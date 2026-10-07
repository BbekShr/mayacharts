import type { ChartSpec, Row } from "../src/index.ts";

type Chart = HTMLElement & { spec: ChartSpec; data: Row[] };

/** Render `spec` into `#id` and print the exact same object, data cut to 3 rows. */
export function show(id: string, spec: ChartSpec): void {
  (document.getElementById(id) as Chart).spec = spec;
  const shown = JSON.stringify({ ...spec, data: [...spec.data.slice(0, 3), "…"] }, null, 2)
    .replace(/,\n\s*"…"/, ",\n    // … more rows")
    .replace(/\n\s*"…"/, "\n    // … more rows");
  document.getElementById(`${id}-code`)!.textContent = shown;
}
