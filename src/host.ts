/*
 * Host adapters (optional module, `mayacharts/host`; `maya.host` in the global builds): turn a BI
 * host's columnar result into rows and a settled render signal, so an embedded tile is two lines.
 * Not a plugin API: one adapter per host shape, plus `columns` for everything else.
 *
 * Contract (#61):
 * - Field-valued spec options (x, y, series, y2, size, name, frame, path, was or was.by, a colorBy
 *   field, tooltip.fields) may be a RegExp or a case-insensitive column name; each resolves to the
 *   first matching column name. No match leaves the value as written, so validation reports the
 *   usual unknown-field error listing the columns the host sent.
 * - Cells unwrap `{ value() }` (a method) and `{ value }`; anything else passes through.
 * - The element: `el`, else `#chart`, else a new `<maya-chart id="chart">` appended to the body.
 *   The adapter sets `el.spec` and returns the element (so `el.data = ...` still works).
 * - thoughtspot: `viz.getDataFromSearchQuery().getData()` gives `{ schema: [{ name }], data: [[...]] }`
 *   (absent viz or data: no rows). `viz.events.emitRenderCompletedEvent()` is called once, on the
 *   first `maya-settled` (which also fires after `maya-error`).
 * Not core: it may touch `document`; it never imports render, validate, shape or format, and it
 * does not import the element (a `<maya-chart>` upgrades whenever the element script loads).
 */
import type { ChartSpec } from "./core/types.ts";
import type { MayaChart } from "./element/maya-chart.ts";

/** A field as written for a host: a RegExp or a case-insensitive column name. */
export type HostField = string | RegExp;

/** A spec whose field-valued options may be HostFields, and whose data comes from the host. */
export type HostSpec = Omit<
  ChartSpec,
  | "data"
  | "x"
  | "y"
  | "series"
  | "y2"
  | "size"
  | "name"
  | "frame"
  | "path"
  | "was"
  | "colorBy"
  | "tooltip"
> & {
  x?: HostField;
  y: HostField | readonly HostField[];
  series?: HostField;
  y2?: HostField;
  size?: HostField;
  name?: HostField;
  frame?: HostField;
  path?: readonly HostField[];
  was?: HostField | { by: HostField; current?: string | number; previous?: string | number };
  colorBy?: ChartSpec["colorBy"] | RegExp;
  tooltip?: boolean | { fields: readonly HostField[] };
};

/** A columnar result: column names (or `{ name }`) and rows of cells in column order. */
export interface HostTable {
  schema: readonly (string | { readonly name: string })[];
  data: readonly (readonly unknown[])[];
}

/** The part of a ThoughtSpot custom-chart `viz` object the adapter reads (public API). */
export interface ThoughtSpotViz {
  getDataFromSearchQuery?(): { getData(): HostTable | undefined } | undefined;
  events?: { emitRenderCompletedEvent?(): void };
}

/** Render a columnar table into `el` (default `#chart`, created when missing). Returns the element.
 * @example maya.host.columns({ schema: ["Item", "Sales"], data: [["Shirts", 10]] }, { type: "bar", x: /item/i, y: "sales" }) */
export function columns(table: HostTable, spec: HostSpec, el?: MayaChart): MayaChart {
  const names = (table.schema ?? []).map((c) => (typeof c === "string" ? c : c.name));
  // First match wins; no match leaves the name so validation lists the columns.
  const hit = (f: HostField): string =>
    typeof f === "string"
      ? (names.find((n) => n.toLowerCase() === f.toLowerCase()) ?? f)
      : (names.find((n) => n.search(f) >= 0) ?? f.source);
  const one = (f: any) => (Array.isArray(f) ? f.map(hit) : hit(f));
  // Keyed maps (format, titles, colorBy goals) rename keys that match a column.
  const keyed = (o: any) =>
    o && typeof o === "object" && !(o instanceof RegExp)
      ? Object.fromEntries(Object.entries(o).map(([k, v]) => [hit(k), v]))
      : o;
  const s: any = { ...spec };
  for (const k of ["x", "y", "series", "y2", "size", "name", "frame", "path"])
    if (s[k] != null) s[k] = one(s[k]);
  if (s.was) s.was = s.was.by ? { ...s.was, by: hit(s.was.by) } : hit(s.was);
  if (s.colorBy instanceof RegExp) s.colorBy = hit(s.colorBy);
  else if (s.colorBy !== "sign") s.colorBy = keyed(s.colorBy);
  if (s.tooltip?.fields) s.tooltip = { ...s.tooltip, fields: s.tooltip.fields.map(hit) };
  s.format = keyed(s.format);
  s.titles = keyed(s.titles);
  for (const k of ["format", "titles", "colorBy"]) s[k] ?? delete s[k];
  // A ThoughtSpot cell is a value, or { value() } / { value }.
  const cell = (v: any) => (typeof v?.value === "function" ? v.value() : (v?.value ?? v));
  s.data = (table.data ?? []).map((r) => Object.fromEntries(names.map((n, i) => [n, cell(r[i])])));
  el ??=
    (document.getElementById("chart") as MayaChart | null) ??
    document.body.appendChild(Object.assign(document.createElement("maya-chart"), { id: "chart" }));
  el.spec = s;
  return el;
}

/** ThoughtSpot custom chart: read the search data, render, emit render-complete once settled.
 * @example maya.host.thoughtspot(viz, { type: "bar", x: /item/i, y: /sales/i }) */
export function thoughtspot(
  viz: ThoughtSpotViz | undefined,
  spec: HostSpec,
  el?: MayaChart,
): MayaChart {
  const e = columns(
    viz?.getDataFromSearchQuery?.()?.getData() ?? { schema: [], data: [] },
    spec,
    el,
  );
  e.addEventListener("maya-settled", () => viz?.events?.emitRenderCompletedEvent?.(), {
    once: true,
  });
  return e;
}
