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
  positive: "Positive",
  negative: "Negative",
  above: "above target",
  below: "below target",
  /** Tone text for the warn band (colorBy { target, warn }). */
  near: "near target",
  /** kpi and gauge status word for the good tone. */
  onTrack: "On track",
  /** kpi and gauge status word for the warn tone. */
  atRisk: "At risk",
  /** kpi and gauge status word for the bad tone. */
  offTrack: "Off track",
  /** kpi delta: {0} = signed change, {1} = previous period. */
  vs: "{0} vs {1}",
  /** kpi comparison: {0} = arrow, {1} = absolute change, {2} = percent change, {3} = what it is compared with. */
  change: "{0} {1} ({2}) vs {3}",
  /** kpi comparison label for colorBy.target (the {3} of `change`). */
  target: "target",
  /** Live region after a table header click: {0} = column title, {1} = ascending/descending. */
  sortedBy: "Sorted by {0}, {1}",
  ascending: "ascending",
  descending: "descending",
  /** kpi bullet: {0} = share of target, {1} = target. */
  ofTarget: "{0} of target {1}",
  /** Sunburst centre at the root. */
  total: "Total",
  /** Sunburst tooltip share: {0} = percent, {1} = parent name. */
  shareOf: "{0} of {1}",
  /** Auto description on a time axis: {0} = first date, {1} = last date. */
  fromTo: "from {0} to {1}",
  /** Description when a time axis was downsampled: {0} = points drawn, {1} = points in the data. */
  reduced: "Showing {0} of {1} points",
  /** Scatter density cell (too many points to draw): {0} = point count. */
  points: "{0} points",
  /** One scatter density cell holding a single point: {0} = 1. */
  point: "{0} point",
  /** A span of values: {0} = from, {1} = to. */
  range: "{0} to {1}",
  /** Description of a density scatter: {0} = cells drawn, {1} = fewest points in a cell, {2} = most. */
  density: "Shown as {0} density cells, {1} to {2} points each",
  /** Title of the density colour legend. */
  perCell: "Points per cell",
  /** Label of an unlabelled rules: ["mean"] line. */
  mean: "Average",
  /** Description name of an unlabelled numeric rule ("Reference line: 100."). */
  rule: "Reference line",
  /** Frame playback button (spec.frame), and its label while playing. */
  play: "Play",
  pause: "Pause",
  /** Title with spec.frame: {0} = title, {1} = formatted frame value. */
  frameOf: "{0}, {1}",
  /** Auto description with spec.frame: {0} = frame number, {1} = frame count. */
  frame: "Frame {0} of {1}",
  /** Tooltip line of a bar with spec.was: {0} = previous value. */
  was: "was {0}",
  /** Description with spec.was: {0} = was title, {1} = the 2 largest moves ("North +12%, West -10%"). */
  since: "Since {0}: {1}",
  /** aria-label of the units form radiogroup, and its three options. */
  forms: "Form",
  waffle: "Waffle",
  bars: "Bars",
  swarm: "Swarm",
  /** Units description: {0} = the name (or x) title. */
  perDot: "Each dot is one {0}",
  /** Units data table: header of the rows-per-group column. */
  count: "Count",
  /** Weave tooltip and description: {0} = rank (1 is the highest value). */
  rank: "Rank {0}",
  /** Orbit description: {0} = y2 title. */
  speedBy: "Orbit speed shows {0}",
  /** Orbit sun title when a value is negative (the total is the sum of magnitudes): {0} = y title. */
  gross: "Gross {0}",
  /** Constellation description: {0} = measure titles joined with ", ". */
  alike: "Closer points are more alike across {0}",
  /** Constellation tooltip: {0} = the nearest names joined with ", ". */
  nearest: "Closest: {0}",
  /** Boxplot tooltip and table labels: the five numbers and the row count. */
  max: "Max",
  q3: "Upper quartile",
  median: "Median",
  q1: "Lower quartile",
  min: "Min",
  rows: "Rows",
  /** Funnel tooltip and table labels: step conversion. */
  ofPrevious: "% of previous",
  ofFirst: "% of first",
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
