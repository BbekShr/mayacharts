/*
 * Every user-visible string the library writes (SVG, table, live region, controls).
 * `spec.text` overrides any key; `{0}`, `{1}`… are positional placeholders.
 */
export const TEXT = {
  /** Empty-state text in the plot when no row holds a number; "\n" breaks a line, long text wraps. */
  noData: "No data",
  /** Category name of the spec.limit roll-up, and the sunburst fold "Other (n)". */
  other: "Other",
  /** Category label for a row whose x (or path level) is null or missing. */
  blank: "(blank)",
  /** Root breadcrumb button, and the live region after drilling back to the top. */
  back: "Back",
  /** Button that resets a zoom window. */
  reset: "Reset zoom",
  /** Live region after a measure toggle: {0} = measure title. */
  showing: "Showing {0}",
  /** Live region after drill: {0} = branch path joined with " / ". */
  drilledInto: "Drilled into {0}",
  /** Pinned tooltip action when drill and select are both on: {0} = the mark's name. */
  drillInto: "Drill into {0}",
  /** Live region after zoom: {0}, {1} = first and last category (or range ends). */
  zoomedTo: "Zoomed to {0} – {1}",
  /** Live region after selection: {0} = count. */
  selected: "{0} selected",
  /** Live region after the selection is cleared. */
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
  /** Tone word of a positive value with colorBy "sign" (tooltip, table, tone legend; not kpi). */
  positive: "Positive",
  /** Tone word of a negative value with colorBy "sign" (not kpi). */
  negative: "Negative",
  /** Tone word of a value on the good side of colorBy.target (tooltip, table, tone legend; the bad side when lower is better; not kpi, whose tile and tooltip say onTrack). */
  above: "above target",
  /** Tone word of a value on the bad side of colorBy.target (the good side when lower is better; not kpi). */
  below: "below target",
  /** Tone word for the warn band, colorBy { target, warn } (tooltip, table, tone legend; not kpi, whose tile and tooltip say atRisk). */
  near: "at risk",
  /** kpi and gauge status word for the good tone (the kpi tooltip too). */
  onTrack: "On track",
  /** kpi and gauge status word for the warn tone (the kpi tooltip too). */
  atRisk: "At risk",
  /** kpi and gauge status word for the bad tone (the kpi tooltip too). */
  offTrack: "Off track",
  /** kpi delta: {0} = signed change, {1} = previous period. */
  vs: "{0} vs {1}",
  /** kpi comparison: {0} = arrow, {1} = absolute change, {2} = percent change, {3} = what it is compared with. A gauge on a percent measure drops the first " (...)". */
  change: "{0} {1} ({2}) vs {3}",
  /** kpi and gauge change on a percent measure: {0} = signed difference in points. */
  pts: "{0} pts",
  /** kpi and gauge label of colorBy.target (the {3} of `change`, the gauge's target label) and the description's target. */
  target: "target",
  /** Live region after a table header click: {0} = column title, {1} = ascending/descending. */
  sortedBy: "Sorted by {0}, {1}",
  /** The {1} of sortedBy for an ascending sort. */
  ascending: "ascending",
  /** The {1} of sortedBy for a descending sort. */
  descending: "descending",
  /** Chart description of a warn threshold when higher is better: {0} = the warn value. */
  offBelow: "off track below {0}",
  /** Chart description of a warn threshold when lower is better: {0} = the warn value. */
  offAbove: "off track above {0}",
  /** Sunburst centre at the root; the heatmap `totals: true` Total row and column. */
  total: "Total",
  /** Sunburst tooltip share: {0} = percent, {1} = parent name. */
  shareOf: "{0} of {1}",
  /** Auto description on a time axis: {0} = first date, {1} = last date. */
  fromTo: "from {0} to {1}",
  /** Description when a time axis was downsampled: {0} = points drawn, {1} = points in the data. */
  reduced: "Showing {0} of {1} points",
  /** Scatter density cell tooltip (too many points to draw): {0} = point count. */
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
  /** Scatter slope rule value after its label: {0} = slope formatted by format[y], {1} = x title. */
  perX: "{0} per {1}",
  /** Description name of an unlabelled numeric rule ("Reference line: 100."). */
  rule: "Reference line",
  /** Description with spec.xScale or spec.yScale "log": {0} = the axis title. */
  log: "{0} on a log scale",
  /** Frame playback button (spec.frame). */
  play: "Play",
  /** Frame playback button while playing. */
  pause: "Pause",
  /** Title with spec.frame: {0} = title, {1} = formatted frame value. */
  frameOf: "{0}, {1}",
  /** Auto description with spec.frame: {0} = frame number, {1} = frame count. */
  frame: "Frame {0} of {1}",
  /** Tooltip line of a bar with spec.was: {0} = previous value. */
  was: "was {0}",
  /** Description with spec.was: {0} = was title, {1} = the 2 largest moves ("North +12%, West -10%"). */
  since: "Since {0}: {1}",
  /** aria-label of the units form radiogroup. */
  forms: "Form",
  /** Units form option: waffle. */
  waffle: "Waffle",
  /** Units form option: bars. */
  bars: "Bars",
  /** Units form option: swarm. */
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
  /** Boxplot maximum label (tooltip, table); annotate "max" in the description. */
  max: "Max",
  /** Boxplot upper quartile label. */
  q3: "Upper quartile",
  /** Boxplot median label. */
  median: "Median",
  /** Boxplot lower quartile label. */
  q1: "Lower quartile",
  /** Boxplot minimum label (tooltip, table); annotate "min" in the description. */
  min: "Min",
  /** Boxplot row count label. */
  rows: "Rows",
  /** Funnel tooltip and table label: conversion from the previous step. */
  ofPrevious: "% of previous",
  /** Funnel tooltip and table label: conversion from the first step. */
  ofFirst: "% of first",
  /** Annotate "first" in the description. */
  first: "First",
  /** Annotate "last" in the description. */
  last: "Last",
  /** Description of annotate: {0} = the kinds joined with ", ". */
  labelled: "Labelled points: {0}",
  /** Beeswarm select { peers }: label of the peers' average line, {0} = the peers' value. */
  peerMean: "{0} average",
  /** Live region after a parallel brush: {0} = lines kept, {1} = all lines. */
  brushed: "{0} of {1} shown",
  /** Live region after the parallel brush is cleared. */
  brushCleared: "Filter cleared",
  /** kpi with spec.back: the button that turns the card over (aria-pressed says which face shows). */
  flip: "Details",
  /** aria-label of the stack mode radiogroup (spec.stack as an array). */
  stacks: "Layout",
  /** Stack mode option for false: grouped bars, overlaid areas. */
  unstacked: "Separate",
  /** Stack mode option for true. */
  stacked: "Stacked",
  /** Stack mode option for "percent". */
  percent: "Percent",
  /** Stack mode option for "stream". */
  stream: "Stream",
  /** aria-label and placeholder of the table search box (spec.filter). */
  filter: "Filter",
  /** Table row that shows the next page (spec.page): {0} = rows it adds. */
  showMore: "Show {0} more",
  /** Table whose filter matches no row: {0} = the search text. */
  noMatch: 'No rows match "{0}"',
  /** Overflow row of a list: {0} = the moves not shown. */
  moreMoves: "+{0} more",
  /** Table row count when rows are paged or limited: {0} = rows shown, {1} = rows in all. */
  rowsOf: "{0} of {1}",
  /** aria-label of the heatmap column breadcrumb (spec.xPath with drill). */
  crumbsX: "Column drill path",
  /** Drilled waterfall opening total: {0} = the drilled value. */
  before: "Before {0}",
  /** Drilled waterfall closing total: {0} = the drilled value. */
  after: "After {0}",
  /** aria-label of the frame slider, tabs or select (spec.frameControl). */
  frames: "Frame",
  /** facet panel title and accessible name: {0} = the facet value, {1} = its formatted total. */
  panelOf: "{0}, {1}",
  /** Description of a facet chart: {0} = the facet field's title, {1} = panel count. */
  facets: "One panel per {0}, {1} panels",
  /** aria-label of the facetScale radiogroup. */
  facetScales: "Scale",
  /** facetScale option "shared". */
  shared: "Same scale",
  /** facetScale option "own". */
  own: "Own scale",
  /** aria-label of the params group, and its button on a chart under 300 px wide. */
  params: "Adjust",
  /** Button that puts every param back to its spec value. */
  resetParams: "Reset",
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
