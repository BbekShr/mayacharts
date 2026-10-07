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
const ROWS = ["scatter", "treemap", "sunburst", "sankey", "hexmap", "boxplot"];
const CAP = 1000;

export type Fmt = (field: string, v: unknown, step?: number) => string;

export function describe(spec: ResolvedSpec, shaped: Shaped, fmt: Fmt, noun: string): string {
  if (spec.description !== null) return spec.description;
  const ti = (f: string) => spec.titles.get(f) ?? f;
  let s =
    spec.x || spec.path.length
      ? t(spec, "chartOf", noun, ti(spec.y), spec.x ? ti(spec.x) : spec.path.join(" / "))
      : t(spec, "chartOfAll", noun, ti(spec.y));
  if (spec.series !== null && shaped.series.length)
    s += `, ${spec.stack ? "stacked" : "grouped"} by ${ti(spec.series)} (${shaped.series.join(", ")})`;
  if (ROWS.includes(spec.type)) return `${s}. ${fmt("", spec.data.length)} rows.`;
  // Reduce loops: Math.min(...v) throws RangeError past ~65k values.
  let n = 0;
  let lo = Infinity;
  let hi = -Infinity;
  for (const c of shaped.cells)
    if (c.value !== null) (n++, (lo = Math.min(lo, c.value)), (hi = Math.max(hi, c.value)));
  const f = (v: number) => fmt(spec.y, v);
  if (!n) return s + ". No data.";
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
    (n === 1 ? `${s}. 1 value: ${f(lo)}.` : `${s}. ${n} values from ${f(lo)} to ${f(hi)}.`) + cut
  );
}

/**
 * Visually hidden table. Cartesian/heatmap: category rows x series columns. Scatter and path
 * types: the raw rows, only the encoded fields. A mark's own `MarkOut.table` wins over both.
 * Capped at 1000 rows. `tone` returns the tone word for a value (never colour alone) or null.
 */
export function dataTable(
  spec: ResolvedSpec,
  shaped: Shaped,
  fmt: Fmt,
  tone: (v: number) => string | null,
  own?: MarkOut["table"],
): string {
  const ti = (f: string) => spec.titles.get(f) ?? f;
  const cell = (f: string, v: unknown) => {
    if (v == null) return "";
    const tn = f === spec.y && typeof v === "number" ? tone(v) : null;
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
  } else if (ROWS.includes(spec.type)) {
    const cols = [
      ...new Set(
        [spec.x, ...spec.path, spec.series, spec.name, spec.size, spec.y, cbField(spec)].filter(
          (f): f is string => !!f,
        ),
      ),
    ];
    n = spec.data.length;
    h = cols.map((f) => `<th>${esc(ti(f))}</th>`).join("");
    rows = spec.data
      .slice(0, CAP)
      .map((row) => `<tr>${cols.map((f) => `<td>${cell(f, row[f])}</td>`).join("")}</tr>`)
      .join("");
  } else {
    const keys = spec.series === null ? [ti(spec.y)] : shaped.visible.map((j) => shaped.series[j]!);
    n = shaped.categories.length;
    h = `<th>${esc(ti(spec.x))}</th>` + keys.map((k) => `<th>${esc(k)}</th>`).join("");
    const by = new Map(shaped.cells.map((c) => [c.ci + "," + c.si, c.value]));
    rows = "";
    for (let i = 0; i < Math.min(n, CAP); i++) {
      rows += `<tr><th scope="row">${esc(shaped.time ? fmt(spec.x, shaped.categories[i]) : shaped.categories[i]!)}</th>`;
      for (const j of shaped.visible) rows += `<td>${cell(spec.y, by.get(i + "," + j))}</td>`;
      rows += "</tr>";
    }
  }
  return `<table class="maya-sr"><caption>${esc(cap(n))}</caption><thead><tr>${h}</tr></thead><tbody>${rows}</tbody></table>`;
}
