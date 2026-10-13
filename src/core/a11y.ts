import { colorVals, wide as allY } from "./shape.ts";
import { t } from "./strings.ts";
import { cbField, esc, OTHER } from "./svg.ts";
import type { MarkOut, ResolvedSpec, Shaped } from "./types.ts";

/** Density scatter stats [cells, fewest, most], left by the mark's draw for describe (same spec object). */

export const titleText = (spec: ResolvedSpec): string =>
  spec.title ??
  `${spec.titles.get(spec.y) ?? spec.y}` +
    (spec.x || spec.path.length
      ? ` by ${spec.titles.get(spec.x) ?? (spec.x || spec.path.join(" / "))}`
      : "");

/** A data token: {max.x} ... {last.y}, {total}, {mean}, {count.below}, {count.above}, each with an optional series selector {max.y:2025}.
 * Global flag: use only with replace and search, which reset lastIndex (test and exec keep it). */
export const TOKEN =
  /\{(?:(max|min|first|last)\.([xy])|(total|mean|count\.below|count\.above))(?::([^{}]*))?\}/g;

/**
 * Fill the exact data tokens in a title or subtitle, formatted by the field's format. Anything
 * else in braces, and a token with no value (no points, an unknown series), stays as written.
 * max, min, first and last name one drawn point (category x series), or the category total when
 * `stack` is set; Other is left out of them. `total` adds every drawn value; `mean` is the "mean"
 * rule's value. A selector (`:2025`) reads only that series value: its points, their sum and
 * their mean. Scatter (`pts`): max and min by y, first and last by x, `.x` the x value or the name.
 */
export function resolveTokens(
  text: string,
  s: ResolvedSpec,
  shaped: Shaped,
  fmt: Fmt,
  mean: () => number,
  pts?: () => readonly { x: number; y: number; si: number; name: string | null }[],
): string {
  if (!text.includes("{")) return text;
  // [x, value, series index, order]: scatter points ordered by x, else drawn cells by category.
  const all: [unknown, number, number, number][] = pts
    ? pts().map((p) => [p.name ?? p.x, p.y, p.si, p.x])
    : shaped.cells.flatMap((c) =>
        c.value === null ? [] : [[shaped.categories[c.ci], c.value, c.si, c.ci]],
      );
  // One pass per distinct token, and an unknown series costs no pass: a long title stays linear.
  const seen = new Map<string, string>();
  const one = (m: string, k?: string, a?: string, o?: string, q?: string): string => {
    const qi = q === undefined || s.series === null ? -1 : shaped.series.indexOf(q);
    let es = q === undefined ? all : qi < 0 ? [] : all.filter((e) => e[2] === qi);
    if (!es.length) return m;
    const sum = es.reduce((t, e) => t + e[1], 0);
    if (o?.startsWith("count")) {
      // Drawn values below / at or above the colorBy target (Other left out); no target: as written.
      const g = s.colorBy;
      const tg = typeof g === "object" && g !== null ? g.target : null;
      if (tg === null) return m;
      const below = o === "count.below";
      return es
        .filter((e) => e[0] !== OTHER && e[1] < tg === below)
        .length.toLocaleString(s.locale);
    }
    if (o) {
      const v = o === "total" ? sum : q === undefined ? mean() : sum / es.length;
      return Number.isFinite(v) ? fmt(s.y, v) : m;
    }
    if (s.stack && q === undefined) {
      const by = new Map<number, [unknown, number, number, number]>();
      for (const e of es) {
        const t = by.get(e[3]);
        if (t) t[1] += e[1];
        else by.set(e[3], [e[0], e[1], -1, e[3]]);
      }
      es = [...by.values()];
    }
    const e = es
      .filter((c) => c[0] !== OTHER)
      .reduce<(typeof es)[number] | undefined>(
        (p, c) =>
          !p ||
          (k === "max"
            ? c[1] > p[1]
            : k === "min"
              ? c[1] < p[1]
              : k === "last"
                ? c[3] >= p[3]
                : c[3] < p[3])
            ? c
            : p,
        undefined,
      );
    if (!e) return m;
    return a === "y"
      ? fmt(s.y, e[1])
      : fmt(pts && s.name && typeof e[0] === "string" ? s.name : s.x, e[0]);
  };
  return text.replace(TOKEN, (m: string, ...g: (string | undefined)[]) => {
    if (!seen.has(m)) seen.set(m, one(m, ...(g as [string?, string?, string?, string?])));
    return seen.get(m)!;
  });
}

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

export type Fmt = (field: string, v: unknown, step?: number) => string;

export function describe(spec: ResolvedSpec, shaped: Shaped, fmt: Fmt, noun: string): string {
  if (spec.description !== null) return spec.description;
  const ti = (f: string) => spec.titles.get(f) ?? f;
  // A constellation or a kpi with a y array (not toggle) has no single value: name every measure.
  const ys =
    spec.type === "constellation" || allY(spec) ? spec.measures.map(ti).join(", ") : ti(spec.y);
  let s =
    spec.x || spec.path.length
      ? t(spec, "chartOf", noun, ys, spec.x ? ti(spec.x) : spec.path.join(" / "))
      : t(spec, "chartOfAll", noun, ys);
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
  if (allY(spec)) return s + ".";
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
      ? `, ${t(spec, "target")} ${f(spec.colorBy.target)}` +
        (spec.colorBy.warn == null
          ? "."
          : `, ${t(spec, spec.colorBy.better === "lower" ? "offAbove" : "offBelow", f(spec.colorBy.warn))}.`)
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
          ...(spec.ratio ?? []),
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
    const wide = allY(spec);
    const keys = wide
      ? shaped.visible.map((j) => ti(spec.measures[j]!))
      : spec.series === null
        ? [ti(spec.y)]
        : shaped.visible.map((j) => shaped.series[j]!);
    n = shaped.categories.length;
    // spec.was: a previous-value column after each value column (a wide kpi: each measure's own).
    const wasOf = (j: number) => (wide ? (spec.wasOf.get(spec.measures[j]!) ?? null) : spec.was);
    const wvs = shaped.visible.map((j) => {
      const f = wasOf(j);
      return f === null ? null : colorVals(spec, f);
    });
    h =
      `<th>${esc(ti(spec.x))}</th>` +
      keys
        .map((k, i) => {
          const f = wasOf(shaped.visible[i]!);
          return (
            `<th>${esc(k)}</th>` +
            (f === null
              ? ""
              : `<th>${esc(spec.series === null && !wide ? ti(f) : `${k} ${ti(f)}`)}</th>`)
          );
        })
        .join("");
    const by = new Map(shaped.cells.map((c) => [c.ci + "," + c.si, c.value]));
    rows = "";
    for (let i = 0; i < Math.min(n, CAP); i++) {
      rows += `<tr><th scope="row">${esc(!spec.x ? ti(spec.y) : shaped.time ? fmt(spec.x, shaped.categories[i]) : shaped.categories[i]!)}</th>`;
      shaped.visible.forEach((j, v) => {
        const m = wide ? spec.measures[j]! : spec.y;
        const wv = wvs[v];
        // A wide kpi's cells are keyed by measure, its rows have no series ("").
        rows +=
          `<td>${cell(m, by.get(i + "," + j))}</td>` +
          (wv
            ? `<td>${esc(fmt(m, wv(shaped.categories[i]!, wide ? "" : shaped.series[j]!)))}</td>`
            : "");
      });
      rows += "</tr>";
    }
  }
  return `<table class="maya-sr"><caption>${esc(cap(n))}</caption><thead><tr>${h}</tr></thead><tbody>${rows}</tbody></table>`;
}
