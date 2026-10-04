/*
 * Every user-visible string the library writes (SVG, table, live region, controls).
 * `spec.text` overrides any key; `{0}`, `{1}`… are positional placeholders.
 */
export const TEXT = {
  noData: "No data",
  other: "Other",
  back: "Back",
  reset: "Reset zoom",
  /** Live region after a measure toggle: {0} = measure title. */
  showing: "Showing {0}",
  /** Live region after drill: {0} = branch path joined with " / ". */
  drilledInto: "Drilled into {0}",
  /** Live region after zoom: {0}, {1} = first and last category (or range ends). */
  zoomedTo: "Zoomed to {0} – {1}",
  /** Live region after selection: {0} = count. */
  selected: "{0} selected",
  selectionCleared: "Selection cleared",
  /** Auto description: {0} = noun, {1} = y title, {2} = x title. */
  chartOf: "{0} chart of {1} by {2}",
  /** Auto description without a category field: {0} = noun, {1} = y title. */
  chartOfAll: "{0} chart of {1}",
  /** Table caption when rows are capped: {0} = shown, {1} = total. */
  firstOf: "First {0} of {1} rows",
  /** aria-label of the measure radiogroup. */
  measures: "Measure",
  /** aria-label of the breadcrumb nav. */
  crumbs: "Drill path",
  /** Tone text (never colour alone): colorBy "sign" and { target }. */
  positive: "positive",
  negative: "negative",
  above: "above target",
  below: "below target",
  /** kpi delta: {0} = signed change, {1} = previous period. */
  vs: "{0} vs {1}",
  /** Live region after a table header click: {0} = column title, {1} = ascending/descending. */
  sortedBy: "Sorted by {0}, {1}",
  ascending: "ascending",
  descending: "descending",
  /** kpi bullet: {0} = share of target, {1} = target. */
  ofTarget: "{0} of target {1}",
} as const;

export type TextKey = keyof typeof TEXT;

/** Localised string for `key` with `{n}` placeholders filled from `args`. */
export function t(
  spec: { text?: Partial<Record<TextKey, string>> | undefined },
  key: TextKey,
  ...args: (string | number)[]
): string {
  const own = spec.text && Object.hasOwn(spec.text, key) ? spec.text[key] : undefined;
  return (own ?? TEXT[key]).replace(/\{(\d)\}/g, (_, i: string) => String(args[+i] ?? ""));
}
