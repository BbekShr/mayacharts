import { colorVals } from "./shape.ts";
import { t } from "./strings.ts";
import { cbField, esc } from "./svg.ts";
import type { MarkOut, ResolvedSpec, Shaped } from "./types.ts";

/** Density scatter stats [cells, fewest, most], left by the mark's draw for describe (same spec object). */

export const titleText = (spec: ResolvedSpec): string =>
  spec.title ??
  `${spec.titles.get(spec.y) ?? spec.y}` +
    (spec.x || spec.path.length
      ? ` by ${spec.titles.get(spec.x) ?? (spec.x || spec.path.join(" / "))}`
      : "");

/** Types whose a11y table lists the raw rows (no category x series grid). */
const ROWS = [
  "scatter",
  "treemap",
  "sunburst",
  "sankey",
  "hexmap",
  "boxplot",
  "units",
  "orbit",
  "constellation",
];
const CAP = 1000;
/** Types whose description names every measure. */
const ALL = ["constellation", "kpi"];

export type Fmt = (field: string, v: unknown, step?: number) => string;

export function describe(spec: ResolvedSpec, shaped: Shaped, fmt: Fmt, noun: string): string {
  if (spec.description !== null) return spec.description;
  const ti = (f: string) => spec.titles.get(f) ?? f;
  let s =
    spec.x || spec.path.length
      ? t(
          spec,
          "chartOf",
          noun,
          // A constellation or a kpi with a y array has no single value: name every measure.
          ALL.includes(spec.type) ? spec.measures.map(ti).join(", ") : ti(spec.y),
          spec.x ? ti(spec.x) : spec.path.join(" / "),
        )
      : t(
          spec,
          "chartOfAll",
          noun,
          ALL.includes(spec.type) ? spec.measures.map(ti).join(", ") : ti(spec.y),
        );
  if (spec.series !== null && shaped.series.length) {
    // Name only series that hold a value (a series of nulls is not in the picture).
    const live = new Set(shaped.cells.flatMap((c) => (c.value === null ? [] : [c.si])));
    const names = shaped.series.filter((_, i) => live.has(i));
    s += `, ${spec.stack ? "stacked" : "grouped"} by ${ti(spec.series)} (${(names.length ? names : shaped.series).join(", ")})`;
  }
  if (ROWS.includes(spec.type))
    return `${s}. ${fmt("", spec.data.length)} ${spec.data.length === 1 ? "row" : "rows"}.`;
  // Reduce loops: Math.min(...v) throws RangeError past ~65k values.
  let n = 0;
  let lo = Infinity;
  let hi = -Infinity;
  for (const c of shaped.cells)
    if (c.value !== null) (n++, (lo = Math.min(lo, c.value)), (hi = Math.max(hi, c.value)));
  const f = (v: number) => fmt(spec.y, v);
  if (!n) return s + ". No data.";
  // A kpi with a y array mixes units, so no range (the mark may add a note).
  if (spec.type === "kpi" && spec.measures.length > 1) return s + ".";
  const tm = shaped.time;
  if (tm?.length)
    s +=
      ", " +
      (tm.length === 1
        ? fmt(spec.x, shaped.categories[0])
        : t(
            spec,
            "fromTo",
            fmt(spec.x, shaped.categories[0]),
            fmt(spec.x, shaped.categories.at(-1)),
          ));
  const cut = shaped.reduced
    ? " " + t(spec, "reduced", ...shaped.reduced.map((v) => fmt("", v))) + "."
    : "";
  return (
    (n === 1 ? `${s}. 1 value: ${f(lo)}` : `${s}. ${n} values from ${f(lo)} to ${f(hi)}`) +
    // A single-value goal (kpi, gauge) names its target; the data table adds the tone word.
    (typeof spec.colorBy === "object" && spec.colorBy?.target != null
      ? `, ${t(spec, "target")} ${f(spec.colorBy.target)}.`
      : ".") +
    cut
  );
}

/**
 * Visually hidden table. Cartesian/heatmap: category rows x series columns. Units: rows per
 * group. Scatter and path types: the raw rows, only the encoded fields. A mark's own
 * `MarkOut.table` wins over all of these. Capped at 1000 rows. `tone` returns the tone word for
 * a value (never colour alone) or null.
 */
export function dataTable(
  spec: ResolvedSpec,
  shaped: Shaped,
  fmt: Fmt,
  tone: (v: number, field: string) => string | null,
  own?: MarkOut["table"],
): string {
  const ti = (f: string) => spec.titles.get(f) ?? f;
  const cell = (f: string, v: unknown) => {
    if (v == null) return "";
    const tn = (f === spec.y || spec.goals.has(f)) && typeof v === "number" ? tone(v, f) : null;
    return esc(fmt(f, v)) + (tn ? ` (${esc(tn)})` : "");
  };
  const cap = (n: number) => (n > CAP ? t(spec, "firstOf", CAP, n) : titleText(spec));
  let h: string;
  let rows: string;
  let n: number;
  if (own) {
    n = own.rows.length;
    h = own.head.map((c) => `<th>${esc(c)}</th>`).join("");
    rows = own.rows
      .slice(0, CAP)
      .map(
        ([c, ...cs]) =>
          `<tr><th scope="row">${esc(c ?? "")}</th>${cs.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`,
      )
      .join("");
  } else if (spec.type === "units") {
    // One row per group: how many rows (dots) it holds.
    const c = new Map<string, number>();
    for (const r of spec.data) c.set(String(r[spec.x]), (c.get(String(r[spec.x])) ?? 0) + 1);
    n = c.size;
    h = `<th>${esc(ti(spec.x))}</th><th>${esc(t(spec, "count"))}</th>`;
    rows = [...c]
      .map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(fmt("", v))}</td></tr>`)
      .join("");
  } else if (ROWS.includes(spec.type)) {
    const cols = [
      ...new Set(
        [
          spec.x,
          ...spec.path,
          spec.series,
          spec.name,
          spec.size,
          ...(spec.type === "constellation" ? spec.measures : [spec.y]),
          spec.y2,
          cbField(spec),
        ].filter((f): f is string => !!f),
      ),
    ];
    n = spec.data.length;
    h = cols.map((f) => `<th>${esc(ti(f))}</th>`).join("");
    rows = spec.data
      .slice(0, CAP)
      .map((row) => `<tr>${cols.map((f) => `<td>${cell(f, row[f])}</td>`).join("")}</tr>`)
      .join("");
  } else {
    // A kpi with a y array: one column per measure (its cells' si is the measure index).
    const wide = spec.type === "kpi" && spec.measures.length > 1;
    const keys = wide
      ? shaped.visible.map((j) => ti(spec.measures[j]!))
      : spec.series === null
        ? [ti(spec.y)]
        : shaped.visible.map((j) => shaped.series[j]!);
    n = shaped.categories.length;
    // spec.was: a previous-value column after each value column.
    const was = spec.was;
    const wv = was === null ? null : colorVals(spec, was);
    const wt = was === null ? "" : ti(was);
    h =
      `<th>${esc(ti(spec.x))}</th>` +
      keys
        .map(
          (k) =>
            `<th>${esc(k)}</th>` +
            (wv ? `<th>${esc(spec.series === null ? wt : `${k} ${wt}`)}</th>` : ""),
        )
        .join("");
    const by = new Map(shaped.cells.map((c) => [c.ci + "," + c.si, c.value]));
    rows = "";
    for (let i = 0; i < Math.min(n, CAP); i++) {
      rows += `<tr><th scope="row">${esc(!spec.x ? ti(spec.y) : shaped.time ? fmt(spec.x, shaped.categories[i]) : shaped.categories[i]!)}</th>`;
      for (const j of shaped.visible)
        rows +=
          `<td>${cell(wide ? spec.measures[j]! : spec.y, by.get(i + "," + j))}</td>` +
          (wv ? `<td>${esc(fmt(spec.y, wv(shaped.categories[i]!, shaped.series[j]!)))}</td>` : "");
      rows += "</tr>";
    }
  }
  return `<table class="maya-sr"><caption>${esc(cap(n))}</caption><thead><tr>${h}</tr></thead><tbody>${rows}</tbody></table>`;
}
