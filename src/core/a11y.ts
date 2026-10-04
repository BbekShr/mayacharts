import { esc } from "./svg.ts";
import type { ResolvedSpec, Shaped } from "./types.ts";

export const titleText = (spec: ResolvedSpec): string => spec.title ?? `${spec.y} by ${spec.x}`;

export function describe(spec: ResolvedSpec, shaped: Shaped, fmt: (v: number) => string): string {
  if (spec.description !== null) return spec.description;
  let s = `Bar chart of ${spec.y} by ${spec.x}`;
  if (spec.series !== null && shaped.series.length)
    s += `, ${spec.stack ? "stacked" : "grouped"} by ${spec.series} (${shaped.series.join(", ")})`;
  const v = shaped.cells.flatMap((c) => (c.value === null ? [] : [c.value]));
  if (!v.length) return s + ". No data.";
  const lo = Math.min(...v),
    hi = Math.max(...v);
  return v.length === 1
    ? `${s}. 1 value: ${fmt(lo)}.`
    : `${s}. ${v.length} values from ${fmt(lo)} to ${fmt(hi)}.`;
}

export function dataTable(spec: ResolvedSpec, shaped: Shaped, fmt: (v: number) => string): string {
  const keys = spec.series === null ? [spec.y] : shaped.visible.map((j) => shaped.series[j]!);
  let t = `<table class="maya-sr"><caption>${esc(titleText(spec))}</caption><thead><tr><th>${esc(spec.titles.get(spec.x) ?? spec.x)}</th>`;
  for (const k of keys) t += `<th>${esc(k)}</th>`;
  t += "</tr></thead><tbody>";
  const by = new Map(shaped.cells.map((c) => [c.ci + "," + c.si, c.value]));
  shaped.categories.forEach((cat, i) => {
    t += `<tr><th scope="row">${esc(cat)}</th>`;
    for (const j of shaped.visible) {
      const v = by.get(i + "," + j);
      t += `<td>${v == null ? "" : esc(fmt(v))}</td>`;
    }
    t += "</tr>";
  });
  return t + "</tbody></table>";
}
