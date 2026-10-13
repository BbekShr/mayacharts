import type { TEXT, TextKey } from "./strings.ts";

export type { TextKey };

/** A data row. Field values are read by name via `spec.x`, `spec.y`, `spec.series`… */
export type Row = Readonly<Record<string, string | number | boolean | null | undefined>>;

export type ChartType =
  | "bar"
  | "line"
  | "area"
  | "scatter"
  | "heatmap"
  | "waterfall"
  | "kpi"
  | "dumbbell"
  | "ridgeline"
  | "beeswarm"
  | "parallel"
  | "table"
  | "list"
  | "treemap"
  | "sunburst"
  | "sankey"
  | "chord"
  | "marimekko"
  | "waffle"
  | "radial"
  | "gauge"
  | "hexmap"
  | "boxplot"
  | "funnel"
  | "weave"
  | "units"
  | "orbit"
  | "constellation";

export type Aggregate = "sum" | "mean" | "count" | "min" | "max";
/** A ratio aggregate: a group's y is sum(numerator) / sum(denominator). */
export interface Ratio<F extends string = string> {
  readonly ratio: readonly [F, F];
}

/** Points `annotate` labels: the largest and smallest value, the first and last category. */
export type Annotate = "max" | "min" | "first" | "last";

/** A spec.annotate item that labels the mark at one x value with its own text. */
export interface AnnotateAt {
  readonly x: string | number;
  readonly text: string;
}

/** One spec.rules item. */
export type Rule =
  | number
  | "mean"
  | { readonly y: number | "mean"; readonly label?: string }
  | { readonly y2: number; readonly label?: string }
  | { readonly slope: number | "mean"; readonly intercept?: number; readonly label?: string }
  | { readonly x: string | number; readonly label?: string }
  | { readonly band: readonly [number, number]; readonly label?: string };

export type NumberPreset = "auto" | "integer" | "decimal" | "compact" | "percent" | "currency";
export type DatePreset = "date" | "month" | "year" | "time" | "datetime";
export type FormatPreset = NumberPreset | DatePreset;
/** A preset inside a template string: `"{value:percent} of revenue"`. One `{value}` per template. */
export type FormatTemplate =
  `${string}{value}${string}` | `${string}{value:${FormatPreset}}${string}`;

/** Text added around a formatted value. */
export interface Affix {
  prefix?: string;
  suffix?: string;
}
/**
 * One field's format: a preset, or Intl options plus `prefix`/`suffix`. Options holding
 * any date key (`year`, `month`, `dateStyle`, `timeZone`…) are date options; else number.
 */
export type FieldFormat =
  | FormatPreset
  | FormatTemplate
  | (Intl.NumberFormatOptions & Affix)
  | (Intl.DateTimeFormatOptions & Affix);

export type ThemeToken =
  | "font"
  | "fontSize"
  | "fg"
  | "fgMuted"
  | "grid"
  | "bg"
  | "accent"
  | "radius"
  | "tooltipBg"
  | "tooltipFg"
  | "focus"
  | "good"
  | "warn"
  | "bad"
  | "line"
  | "gridDash"
  | "titleSize"
  | "titleWeight"
  | "axisSize"
  | "subtitleSize"
  | "labelSize"
  | "legendSize"
  | "heroSize"
  | "heroWeight"
  | "emptySize"
  | "numeric"
  | "rampLow"
  | "rampHigh"
  | "rampMid"
  | "rampMidValue"
  | "up"
  | "down"
  | "total"
  | "neutral"
  | "cellGap"
  | "cellRadius"
  | "labelInk"
  | "labelInkOnFill"
  | "lineEmphasis"
  | "ghost"
  | "series1"
  | "series2"
  | "series3"
  | "series4"
  | "series5"
  | "series6"
  | "series7"
  | "series8";

/** Theme token values: CSS strings (allowlisted), except `rampMidValue` (a number) and `numeric` ("tabular" or "proportional"). */
export type ThemeTokens = Readonly<
  Partial<Record<Exclude<ThemeToken, "rampMidValue">, string>> & { rampMidValue?: number }
>;

/** spec.theme: a registered theme's name, `[name, overrides]`, or the tokens themselves. */
export type ThemeSpec = string | readonly [name: string, overrides: ThemeTokens] | ThemeTokens;

/** A spec.tooltip.fields item: a field, or a ratio shown under `field` (sum(num) / sum(den) wherever rows combine). */
export type TipField<F extends string = string> =
  F | { readonly field: string; readonly ratio: readonly [F, F] };

/**
 * colorBy thresholds. `better` says which way is good (default "higher"); `warn` sits on the bad
 * side of `target` and marks the near band. Types other than kpi and gauge need `target` and take no `warn`.
 */
export interface Goal {
  readonly target?: number;
  readonly warn?: number;
  readonly better?: "higher" | "lower";
}

/** A table `cells` entry: one square per distinct `by` value holding `field`, toned by sign. */
export interface StripCell<F extends string = string> {
  readonly type: "strip";
  readonly field: F;
  readonly by: F;
  /** Keep the last n `by` values (data order). */
  readonly last?: number;
  /** The only tone: "sign" (the default). */
  readonly tone?: "sign";
}

/** Field names of row type `R` (autocompletes for typed rows; `string` for `Row`). */
export type Field<R> = Extract<keyof R, string>;

/**
 * The whole public API surface. Plain JSON on purpose: it must stay serializable,
 * LLM-generatable, diffable and hashable. Never add function-valued options.
 * Rule: `x` is always the category and `y` always the value, whatever the orientation.
 * An option set to `null` (other than `type` and `data`) is treated as unset, as JSON hosts write it.
 */
export interface ChartSpec<R extends object = Row> {
  /** Ignored; lets editors and LLMs find the JSON schema.
   * @example "$schema": "https://unpkg.com/mayacharts/schema.json" */
  $schema?: string;
  /** Chart type. treemap/sunburst/marimekko/waffle need `mayacharts/hierarchy`, sankey/chord `flow`, radial/gauge `radial`, hexmap `geo`, boxplot/funnel `stats`; weave, units, orbit and constellation each need the module of the same name.
   * @example type: "bar" */
  type: ChartType;
  /** Row objects.
   * @example data: [{ month: "Jan", revenue: 10 }] */
  data: readonly R[];
  /** How rows sharing a (category, series) combine. `count` counts non-null y. Default "sum". `{ ratio: [numerator, denominator] }` sums both fields per group and divides (a zero denominator gives null), at every level of a drill, in Other and in "mean" rules; `y` then only names the measure (titles, format) and need not be in the rows; other fields (y2, tooltip fields, a colorBy field) sum. Ratio: bar line area heatmap dumbbell table kpi gauge hexmap; not with `stack` or `was`. With a `y` array that toggles the measure, key it by y field (unlisted fields sum).
   * @example aggregate: "mean" or aggregate: { ratio: ["sales", "units"] } or y: ["gap", "price"], aggregate: { price: { ratio: ["sales", "units"] } } */
  aggregate?:
    Aggregate | Ratio<Field<R>> | Readonly<Partial<Record<Field<R>, Aggregate | Ratio<Field<R>>>>>;
  /** Order categories by total across all series (hidden ones too). Default: data order. "change" (dumbbell only) orders by to minus from, largest gain first. bar line area heatmap dumbbell table radial waffle orbit.
   * @example sort: "desc" or sort: "change" */
  sort?: "asc" | "desc" | "change";
  /** Keep the top N categories by total; the rest roll up into a final "Other". A bar with more categories than fit (past 10000 marks) does this on its own when limit is unset, and says so in `warnings`. bar line area heatmap dumbbell table radial waffle orbit.
   * @example limit: 10 */
  limit?: number;

  /** Category field (scatter: numeric x; hexmap: US state; kpi: optional period, last one is the headline; beeswarm: optional row; parallel: one line each; table: row label; boxplot: one box each; funnel: the stage, omitted when `y` lists the stages). Not used by path types.
   * @example x: "month" */
  x?: Field<R>;
  /** How x is spaced. "auto": a time axis when every x is an ISO 8601 date ("2024-03" or longer) on line, area or vertical bar without sort or limit; else categories. "time" also accepts epoch ms numbers. Default "auto".
   * @example xType: "category" */
  xType?: "auto" | "category" | "time";
  /** Value field; an array adds a measure toggle, first one active (parallel: one axis each; table: one column each; funnel without `x`: one stage each, its rows combined by `aggregate`; kpi: one tile each, or one at a time with `toggle`; gauge: only with `toggle`).
   * @example y: ["revenue", "units"] */
  y: Field<R> | readonly Field<R>[];
  /** With a `y` array: one measure at a time behind the measure control (view.measure) instead of one tile each (kpi); a gauge takes a `y` array only with it. kpi gauge.
   * @example toggle: true */
  toggle?: boolean;
  /** Splits rows into series (heatmap: the row category; dumbbell: exactly two, from and to; ridgeline: one row each; marimekko: the segments; radial: stacked outward; boxplot: boxes side by side; weave: one thread each, required; constellation: colours the stars by group). bar line area scatter heatmap dumbbell ridgeline beeswarm parallel marimekko radial boxplot weave constellation.
   * @example series: "region" */
  series?: Field<R>;
  /** Hierarchy fields, outer to inner. treemap sunburst sankey chord (chord: 2 or 3 levels, a third splits the target arcs while the sources stay); bar line area dumbbell table radial waffle hexmap waterfall marimekko with `drill` (replaces `x`; hexmap draws a drilled level as bars; marimekko without `series`: the next level is the series); heatmap with `drill` (replaces `series`, the rows); list: [headline, evidence].
   * @example path: ["region", "state"] */
  path?: readonly Field<R>[];
  /** Series hierarchy, outer to inner: the series is the current level, and the drill gesture on a mark splits its series into the next level (view.drill holds the series values). Not with `path` or `series`. bar line area.
   * @example seriesPath: ["family", "itemType"] */
  seriesPath?: readonly Field<R>[];
  /** Column hierarchy, outer to inner: replaces `x` and drills on its own from a column header (view.xDrill), beside `path` on the rows. heatmap only.
   * @example xPath: ["family", "itemType"] */
  xPath?: readonly Field<R>[];
  /** Levels drawn at once below the current branch, each parent holding its children under a name strip; a click drills into the parent under the pointer. Default: 1 with `drill`, every level without. treemap only.
   * @example depth: 2 */
  depth?: number;
  /** Sunburst slices narrower than this many whole degrees fold into one "Other (n)" slice per ring (the largest sibling never folds). 0 folds nothing. Default: slices under 4 px across fold. sunburst only.
   * @example minAngle: 2 */
  minAngle?: number;
  /** Bubble area field (sqrt scale). scatter beeswarm constellation.
   * @example size: "population" */
  size?: Field<R>;
  /** Point identity and tooltip title (units: one dot per row, keyed by it). scatter, beeswarm, boxplot (outliers and dots) and units.
   * @example name: "country" */
  name?: Field<R>;
  /** x values drawn as running-total bars; one before any step opens at its own y (last year's figure). waterfall; heatmap: `true` adds a Total row and column (combined by `aggregate` over the visible rows).
   * @example totals: ["Q1", "FY"] or totals: true */
  totals?: readonly string[] | true;
  /** The x value of the opening total: drawn first, at its own y (last year's figure). A drilled level opens at the running total before the drilled step and closes after it (text.before, text.after). waterfall only.
   * @example start: "2025 YTD" */
  start?: string;
  /** Stack series instead of grouping them; "percent" shows each category's visible values as shares of its total, axis 0 to 100% (with negatives: shares of the summed magnitudes, below 0); "stream" (area only) centres the stack on a wiggle baseline (a streamgraph: values 0 or more, value axis and grid off by default, the tooltip shows each value). bar and area only.
   * An array of 2 or more distinct modes (false: grouped bars or overlaid areas) adds a control that switches between them, first one shown (view.stack indexes it).
   * @example stack: "percent" or stack: "stream" or stack: [true, "percent"] */
  stack?: boolean | "percent" | "stream" | readonly (boolean | "percent" | "stream")[];
  /** Categories on the left axis. bar and dumbbell.
   * @example horizontal: true */
  horizontal?: boolean;
  /** Playback: one frame per distinct value (data order); the chart shows one frame at a time, the last by default, and the element adds a Play button. Value axes span every frame. Values match as strings (1 and "1" are one frame); null rows belong to none; at most 200 frames. bar line area scatter dumbbell kpi (a scope such as YTD or All); not with `drill` or `zoom`.
   * @example frame: "year" */
  frame?: Field<R>;
  /** Second value field, drawn as a line on a right axis over the bars (vertical bar only); orbit: growth, which sets each planet's speed and direction.
   * @example y2: "units" */
  y2?: Field<R>;
  /** Previous value field: a ghost bar at the old value over each bar (dashed, keyed in the legend), "was" in the tooltip, a table column and a sentence naming the 2 largest relative moves (kpi: a second comparison, e.g. same period last year; gauge: a marker at the old value; heatmap: a "was" tooltip row and table column). Long data: `{ by }` names the period field; the latest distinct value is current, the one before it previous (ISO dates and epoch ms sort as time, else data order), other periods are dropped, and the ghosts are titled by the previous period. `current`/`previous` pick periods (matched as strings). With a `y` array, key it by y field (`{ sales: "salesLY" }`): the ghosts follow the measure toggle (kpi tiles: one each), unlisted measures have none; an object with a string `by` is the long form. With `series` (bar): one ghost per grouped bar. bar kpi gauge heatmap; not with `stack`.
   * @example was: "lastYear" or was: { by: "year" } or was: { sales: "salesLY", units: "unitsLY" } */
  was?:
    | Field<R>
    | {
        readonly by: Field<R>;
        readonly current?: string | number;
        readonly previous?: string | number;
      }
    | Readonly<Partial<Record<Field<R>, Field<R>>>>;
  /** Which change lines a kpi prints under the headline, in this order: "previous" (the previous category), "was" (spec.was), "target" (colorBy target; the bullet and status stay). `[]` prints none. Default all three. kpi only.
   * @example compare: ["was"] */
  compare?: readonly ("previous" | "was" | "target")[];
  /** How a kpi headline moves to a new number (element only; off under reduced motion): "count" counts up, "roll" rolls each digit like an odometer. Default "count". kpi only.
   * @example numberMotion: "roll" */
  numberMotion?: "count" | "roll";
  /** A second face: a chart spec over the kpi's rows (no `data` of its own, any type but kpi). A Details button turns the card over (view.face); Escape returns. kpi only.
   * @example back: { type: "bar", x: "month", y: "sales", horizontal: true, sort: "desc", limit: 3 } */
  back?: Omit<ChartSpec<R>, "data" | "back">;
  /** Sweep of the gauge dial in degrees: 180 (a half dial), 270 or 360 (a closed ring). Default 180. gauge only.
   * @example arc: 360 */
  arc?: 180 | 270 | 360;
  /** Radial form: "bars" (stacked radial bars) or "line" (radar: one closed line per series, angle = x, radius = y from zero; `dash` draws series dashed). Default "bars". radial only.
   * @example form: "line" */
  form?: "bars" | "line";
  /** table: a sub-chart under a row (a spec without `data`, over that row's rows; without `x` or `path` it takes the table's x); a click or Enter opens it, one row at a time (view.expanded). list: which moves start open, "first" (default), "none" or "all". table list.
   * @example expand: { type: "bar", x: "month", y: "sales", was: "lastYear" } or expand: "all" */
  expand?: Omit<ChartSpec<R>, "data" | "expand"> | "first" | "none" | "all";
  /** A sub-chart that replaces the line when a series is drilled (a spec without `data`, over that series' rows; without `x` it takes the line's x). `was: "previous"` compares with the previous series at the same x. view.drill holds the series; Back and Escape return. line only, with `series`.
   * @example drillTo: { type: "bar", y: "monthly", was: "previous" } */
  drillTo?: Omit<ChartSpec<R>, "data" | "drillTo">;
  /** Rows shown at first; a "Show n more" row (text.showMore) adds n each time (view.page). The table grows and scrolls inside the tile. table only.
   * @example page: 25 */
  page?: number;
  /** Draw every row (at most 1000) and scroll inside the tile, the header held at the top. table only.
   * @example scroll: true */
  scroll?: boolean;
  /** A search box (text.filter) keeping rows whose x or `columns` value contains the text, ignoring case (view.filter). table only.
   * @example filter: true */
  filter?: boolean;
  /** table: the bar in each measure cell, "bar" (default, magnitude), "diverging" (left or right of the cell centre, theme `up` and `down`) or "none". list: `true` draws the evidence as bars on a scale local to each move. table list.
   * @example bars: { sales: "bar", vsType: "diverging", units: "none" } or bars: true */
  bars?: Readonly<Partial<Record<Field<R>, "bar" | "diverging" | "none">>> | boolean;
  /** Text fields shown as their own columns after the row label (each row's first value), sortable and matched by `filter`. table only.
   * @example columns: ["itemType", "region"] */
  columns?: readonly Field<R>[];
  /** Extra columns keyed by title. "strip": one square per distinct `by` value (data order; the last `last` of them) holding `field` combined by `aggregate`, toned by sign. table only.
   * @example cells: { Form: { type: "strip", field: "change", by: "month", last: 5 } } */
  cells?: Readonly<Record<string, StripCell<Field<R>>>>;
  /** Text field shown under each headline (at most two lines on small tiles). list only.
   * @example body: "text" */
  body?: Field<R>;
  /** Field holding each row's own format, a preset or a template ("currency", "{value} pts"). list only.
   * @example rowFormat: "format" */
  rowFormat?: Field<R>;
  /** Forms a units chart switches between, first one shown (view.form picks another); the element adds a form control when there are 2 or more. Default all three. units only.
   * @example forms: ["waffle", "swarm"] */
  forms?: readonly ("waffle" | "bars" | "swarm")[];

  /** A preset for every `y`, or a preset / Intl options per field; Intl options also take `prefix` and `suffix` text. Display only.
   * @example format: { revenue: "currency", month: "month", gap: { maximumFractionDigits: 1, signDisplay: "exceptZero", suffix: " pts" } } */
  format?: FormatPreset | FormatTemplate | Readonly<Partial<Record<Field<R>, FieldFormat>>>;
  /** Display names by field: axis titles (shown only when set), tooltip, legend, table.
   * @example titles: { revenue: "Revenue ($)" } */
  titles?: Readonly<Partial<Record<Field<R>, string>>>;
  /** Formatted values on marks. Default false (heatmap: true when cells are ≥ 24 px; treemap and sunburst: names, marimekko: shares, true).
   * @example labels: true */
  labels?: boolean;
  /** Localised UI strings with `{0}` placeholders; each key's own doc (hover, or "Text keys" in llms.txt) says which string it controls.
   * @example text: { noData: "Keine Daten", back: "Zurück" } */
  text?: Readonly<{ [K in keyof typeof TEXT]?: string }>;
  /** BCP 47 locale for formatting. Default "en-US" (deterministic SSR).
   * @example locale: "de-DE" */
  locale?: string;
  /** ISO 4217 code for the "currency" preset. Default "USD".
   * @example currency: "EUR" */
  currency?: string;
  /** Visible heading, also the accessible name. Data tokens fill in from the chart: {max.x} {max.y} {min.x} {min.y} {first.x} {first.y} {last.x} {last.y} {total} {mean}, formatted by `format`. Without a selector max, min, first and last read one drawn point (stacked: category totals) and total sums every series; a series selector reads one series (`{last.y:2025}`). Scatter: max and min by y, first and last by x, `.x` the x value or `name`. With no rows a title holding a token is dropped. Only these exact names are replaced; any other brace text stays as written. One line with an ellipsis in an element under 200 px tall.
   * @example title: "{max.x} leads with {max.y}, 2025 total {total:2025}" */
  title?: string;
  /** Second line under the title, smaller and muted; takes the same data tokens. Hidden in an element under 200 px tall; not in the bare render() SVG.
   * @example subtitle: "Sales by state, 2025" */
  subtitle?: string;
  /** Accessible description; auto-generated when omitted.
   * @example description: "Revenue doubled from January to December." */
  description?: string;
  /** Value axis includes zero. false fits the axis to the values (recomputed at each drill level), for small changes between large values. Default true. dumbbell only.
   * @example zero: false */
  zero?: boolean;
  /** Fixed value-axis domain; [hi, lo] reverses it (ranks with 1 on top). kpi: the bullet scale; gauge: the dial range. Not with a `y` array, except keyed by y field on kpi and gauge (unlisted measures take the default).
   * @example yDomain: [0, 100] or yDomain: { sales: [0, 26e6] } */
  yDomain?:
    readonly [number, number] | Readonly<Partial<Record<Field<R>, readonly [number, number]>>>;
  /** Fixed x domain. scatter only.
   * @example xDomain: [0, 1] */
  xDomain?: readonly [number, number];
  /** Reference lines (at most 4): a number or "mean" across the value axis (mean of the visible values; stacked: of the category totals), `{ x }` across the category axis at that x, `{ band: [lo, hi] }` a shaded value range, `{ y2 }` across the right axis of a bar with `y2`; each optionally labelled. Scatter also takes `{ slope, intercept? }`: the line y = slope * x + intercept, slope "mean" = sum of y / sum of x, labelled with its value as y per x. `[]` is unset. bar line area scatter dumbbell beeswarm.
   * @example rules: [{ y: 100, label: "Target" }, { x: "2025-06-01", label: "Launch" }, { band: [80, 100] }, { y2: 0.8, label: "80%" }] */
  rules?: readonly Rule[];
  /** Log value axis (powers of 10 ticks); every plotted value must be above 0. line scatter beeswarm (bars start at zero, so not bar).
   * @example yScale: "log" */
  yScale?: "log";
  /** Log x axis; every x must be above 0. scatter only.
   * @example xScale: "log" */
  xScale?: "log";
  /** Label these points of each visible series with their value: "max", "min", "first", "last" (scatter: max and min by y, first and last by x); `{ x, text }` labels the mark at that x with the text. `[]` is unset. bar line area scatter.
   * @example annotate: ["max", "last", { x: "CA", text: "Largest store" }] */
  annotate?: readonly (Annotate | AnnotateAt)[];
  /** Series values drawn dashed (line, the area outline, a radar line), e.g. last year against this year. line area radial (with `form: "line"`); needs `series`; `[]` is unset.
   * @example dash: ["2024"] */
  dash?: readonly string[];
  /** Series values drawn with a heavier stroke (theme `lineEmphasis`), e.g. this year against earlier years. line only; needs `series`; `[]` is unset.
   * @example emphasis: ["2026"] */
  emphasis?: readonly string[];
  /** How values map to the colour ramp: "linear" (default), "rank" (even steps by order, for skewed totals), "quantile" (five equal-count classes; the legend shows the breaks) or "log" (values above 0). heatmap hexmap.
   * @example colorScale: "rank" */
  colorScale?: "linear" | "rank" | "quantile" | "log";
  /** Children take evenly spaced tints of their parent's colour instead of their own palette slots: drilled levels of a `path` (the parent is the drilled value, coloured by `colors` or its slot), and weave threads under a group `colorBy` (the parent is the group). A `colors` map then names path values or groups. treemap sunburst sankey chord waffle weave.
   * @example tint: true */
  tint?: boolean;
  /** Drag a range on an axis to keep the lines inside it (ranges on several axes combine with AND; the rest dim); a click on the axis clears it. State in view.brush, reported by maya-view. parallel only.
   * @example brush: true */
  brush?: boolean;

  /** Hover/keyboard tooltip. Default true. `{ fields }` adds those fields as rows (also data table columns), formatted by `format`; where rows combine (bar, line, area, heatmap, dumbbell) numeric fields combine by `aggregate`, and `{ field, ratio: [num, den] }` shows sum(num) / sum(den) under the name `field` (titles and format key it; it need not be in the rows). fields: bar line area scatter heatmap dumbbell beeswarm gauge (combined over every row).
   * @example tooltip: false or tooltip: { fields: ["units", { field: "price", ratio: ["sales", "units"] }] } */
  tooltip?: boolean | { readonly fields: readonly TipField<Field<R>>[] };
  /** Legend; clicking toggles series. "top", "bottom" or "right" places it (true is "top"). Default: true when `series` is set, and for waffle, hexmap (colour ramp) and units (toggles groups).
   * @example legend: "right" */
  legend?: boolean | "top" | "bottom" | "right";
  /** Line and area: name each series at its right end and drop the legend (keep it with `legend: true`). Default true.
   * @example endLabels: false */
  endLabels?: boolean;
  /** Click/Enter zooms into a branch of `path`; breadcrumb, Back and Escape pop. With `select` too, click/Enter selects and double-click/Shift+Enter drills. At the last level the drill gesture fires `maya-drill-leaf`. Sankey: any node but the last column. treemap sunburst sankey chord; bar line area dumbbell table heatmap radial waffle hexmap waterfall marimekko with `path`; bar line area with `seriesPath`; heatmap with `xPath`.
   * @example drill: true */
  drill?: boolean;
  /** With `drill`: a click on empty chart space goes back up one level. Default true.
   * @example drillOut: false */
  drillOut?: boolean;
  /** Click/Enter/legend selects marks, others dim; Escape clears. With `drill`, double-click/Shift+Enter drills. `{ peers: field }` (beeswarm) selects one mark and also lights every mark sharing its value of that field, with their average (view.peers). kpi: the sparkline points; list: a move. bar line area waterfall scatter heatmap kpi dumbbell ridgeline beeswarm parallel table list marimekko waffle radial treemap sunburst hexmap boxplot funnel weave units orbit constellation.
   * @example select: "multi" or select: { peers: "itemType" } */
  select?: true | "multi" | { readonly peers: Field<R> };
  /** Drag to zoom. line, area, scatter. Reset chip, double-click and Escape restore.
   * @example zoom: true */
  zoom?: boolean;
  /** Animate the first draw and every update (element only; off under reduced motion). Default true.
   * @example animate: false */
  animate?: boolean;

  /** Palette in series order (at most 8 distinct colours), or colours by series value (any number of keys; series beyond 8 share slots). Precedence: a key by value beats colorBy tones, which beat theme `series1..8`, which beat the array, which beats `accent`; a value ramp (colorBy field, heatmap, hexmap) ignores the map. treemap and sunburst: by `path[0]` value; sankey and chord: by node name (links and inner levels inherit); waffle: by category; weave with a group colorBy and `tint` with `path`: by group or path value. Keys that match nothing are ignored. Path types keep each name's colour through drill; a sankey root missing from the map takes theme `neutral`.
   * @example colors: { North: "#0b6", South: "oklch(.6 .17 30)" } */
  colors?: readonly string[] | Readonly<Record<string, string>>;
  /** Tone by sign of y (theme `up` and `down`), by a target (good at or past it; `better: "lower"` flips it), or a ramp by a numeric field. Not with `series` (dumbbell: "sign" of to minus from; kpi and gauge: thresholds only, any of target, warn and better, warn needs target and sits on the bad side; kpi with a `y` array: also keyed by y field; weave: a group field, one colour per group from `colors`, up to 20 threads). bar line area waterfall scatter dumbbell kpi gauge treemap sunburst hexmap units orbit constellation weave.
   * @example colorBy: { target: 100, warn: 80 } or colorBy: { revenue: { target: 1.8e6 }, churn: { better: "lower" } } or colorBy: "family" */
  colorBy?: "sign" | Goal | Readonly<Partial<Record<Field<R>, Goal>>> | Field<R>;
  /** Theme tokens (CSS values, allowlisted), a registered theme's name, or `[name, overrides]`. Names come from `mayacharts/themes` (`maya.themes` in maya.global.js) or `registerTheme(name, tokens)`. `line` is the line width, `gridDash` a grid dash array; `series1..8` palette slots; `rampLow`, `rampHigh` and `rampMid` the value ramp (rampMid makes it diverging, centred on `rampMidValue`, default 0); `up`, `down`, `total` direction colours (waterfall, colorBy "sign", dumbbell connectors); `neutral` uncoloured marks (Other, unmapped names); `labelInk` / `labelInkOnFill` label colours on light and dark fills; `numeric` "tabular" or "proportional" figures. Precedence: `colors` map > colorBy > `series1..8` > `accent`.
   * @example theme: { accent: "#0b6", font: "'Inter', sans-serif", gridDash: "3 3" } or theme: ["slate", { accent: "#6A7891" }] */
  theme?: ThemeSpec;
  /** Grid lines perpendicular to the value axis. Default true.
   * @example grid: false */
  grid?: boolean;
  /** Bottom axis. Default true.
   * @example xAxis: false */
  xAxis?: boolean;
  /** Left axis. Default true.
   * @example yAxis: false */
  yAxis?: boolean;
  /** Visually hidden data table for screen readers. Default true.
   * @example table: false */
  table?: boolean;
}

/** A selected mark, by raw values (never formatted text). */
export interface Sel {
  x?: unknown;
  series?: unknown;
  name?: unknown;
}

/** Interaction state outside the spec. SSR can render any of it. */
export interface View {
  /** Active index into a `y` array. */
  measure?: number;
  /** Drilled branch: one raw value per `path` level, outer first. */
  drill?: readonly string[];
  /** Zoom: category index slice [i0, i1] (inclusive), or scatter box [x0, x1, y0, y1]. */
  window?: readonly [number, number] | readonly [number, number, number, number];
  /** Series keys hidden by the legend. */
  hidden?: readonly string[];
  /** Table column sort from a header click: [field, direction]. */
  sortBy?: readonly [field: string, dir: "asc" | "desc"];
  /** Index into the distinct `frame` values (data order). Default: the last; larger is clamped. */
  frame?: number;
  /** Index into the units `forms`. Default 0; larger is clamped. */
  form?: number;
  /** Parallel `brush` ranges: [field, lo, hi] per brushed axis (data units, lo <= hi); a line is kept when it is inside every range. */
  brush?: readonly (readonly [field: string, lo: number, hi: number])[];
  /** `select: { peers }`: the selected mark's value of the peers field (as a string); its peers light up with their average. */
  peers?: string;
  /** Index into a `stack` array of modes. Default 0; larger is clamped. */
  stack?: number;
  /** kpi with `back`: which face shows. Default "front". */
  face?: "front" | "back";
  /** heatmap `xPath`: drilled column branch, one raw value per level, outer first. */
  xDrill?: readonly string[];
  /** table `expand` and list: the open row's raw x value; "" closes every row. Default: none open (list: spec.expand). */
  expanded?: string;
  /** table `page`: pages added by "Show n more" (0 = the first page only). */
  page?: number;
  /** table `filter`: the search text. */
  filter?: string;
}

export interface RenderOptions {
  /** Pixel size of the plot box. Default 640 x 320. */
  width?: number;
  height?: number;
  view?: View;
  selected?: readonly Sel[];
  /** CSP nonce for the shell's `<style>` (renderShell). */
  nonce?: string;
}

/* Events dispatched by <maya-chart> (bubbles, composed; never include the spec). */
export interface MayaSelectDetail {
  selected: Sel[];
  target: (Sel & { value: unknown }) | null;
}
export type MayaViewDetail = View;
export interface MayaErrorDetail {
  code: ErrorCode;
  path: string;
  message: string;
}
/** maya-drill-leaf: the drill gesture on a mark at the last level. `path`: one raw value per `path` level, root first. */
export interface MayaDrillLeafDetail {
  path: string[];
  /** "x" when a heatmap column (xPath) is at its last level; `path` then holds xPath values. */
  axis?: "x";
}
/** maya-settled: after the last animation of a render (with maya-render when nothing animates), and after maya-error with that error. */
export interface MayaSettledDetail {
  error: Error | null;
}

export type ErrorCode =
  | "spec-not-object"
  | "missing-field"
  | "unknown-type"
  | "data-not-array"
  | "row-not-object"
  | "unknown-field"
  | "non-numeric-y"
  | "non-numeric-field"
  | "non-positive-value"
  | "unknown-option"
  | "invalid-option"
  | "option-unsupported"
  | "stack-unsupported"
  | "invalid-domain"
  | "invalid-format"
  | "invalid-theme"
  | "unsafe-css-value"
  | "invalid-size"
  | "unknown-state"
  | "too-many-marks"
  | "invalid-date"
  | "too-few-measures";

/* ------------------------------------------------------------------ */
/* Internal pipeline types (exported for tests, marks, the element).   */
/* ------------------------------------------------------------------ */

/** Spec with every default and the view's measure/drill applied. From `resolve()`. */
export interface ResolvedSpec {
  type: ChartType;
  /** Rows after the drill filter. */
  data: readonly Row[];
  /** Category field ("" for path types). With `path` + drill: the current level. */
  x: string;
  /** spec.xType; shape() decides whether "auto" becomes a time axis (Shaped.time). */
  xType: "auto" | "category" | "time";
  /** Active measure. */
  y: string;
  /** Every measure (`[y]` when `spec.y` is a string). */
  measures: string[];
  /** spec.toggle (kpi, gauge): a kpi draws the active measure only. */
  toggle: boolean;
  /** kpi change lines to print, in order (default all three). */
  compare: readonly ("previous" | "was" | "target")[];
  /** Gauge sweep in degrees (default 180). */
  arc: 180 | 270 | 360;
  /** Index of `y` in `measures`. */
  measure: number;
  series: string | null;
  /** Right-axis line measure (bar), or growth (orbit); null when unset. */
  y2: string | null;
  /** The field marks read the previous value from (bar, kpi, gauge): spec.was, or with the long form
   * `wasBy.by`, which the pivot fills with the previous period's value; null when unset. */
  was: string | null;
  /** The previous-value field per measure: a string or long-form was applies to every measure, a keyed was to its keys (empty when unset). `was` is the active measure's entry. */
  wasOf: ReadonlyMap<string, string>;
  /** spec.was long form: period field and the explicit periods as strings (null = latest, one before).
   * `data` is already pivoted (shape.ts pivotWas); titles default `by` to the previous period, formatted. */
  wasBy: { by: string; current: string | null; previous: string | null } | null;
  /** spec.dash as a set of series keys (empty when unset). */
  dash: ReadonlySet<string>;
  /** spec.tooltip.fields names ([] when tooltip is a boolean); a ratio item contributes its `field`. */
  tipFields: readonly string[];
  /** Tooltip fields shown as a ratio: name -> [numerator, denominator] (shape.ts colorVals divides the sums). */
  tipRatio: ReadonlyMap<string, readonly [num: string, den: string]>;
  /** spec.emphasis as a set of series keys (empty when unset). */
  emphasis: ReadonlySet<string>;
  /** spec.colorScale (default "linear"); scale.ts ramp() maps values with it. */
  colorScale: "linear" | "rank" | "quantile" | "log";
  /** spec.form "line" on radial (a radar). */
  radar: boolean;
  /** spec.tint. */
  tint: boolean;
  /** spec.zero (dumbbell; default true). */
  zero: boolean;
  /** view.brush entries on measures of a parallel with spec.brush (null when brushing is off). */
  brush: readonly (readonly [field: string, lo: number, hi: number])[] | null;
  /** select { peers }: the field and view.peers (null until a mark is selected); null otherwise. */
  peers: { field: string; value: string | null } | null;
  /** Diverging ramp centre: theme.rampMidValue (default 0) when the theme sets rampMid; else null. */
  rampMid: number | null;
  xScale: "linear" | "log";
  yScale: "linear" | "log";
  /** spec.annotate kinds ([] when unset). */
  annotate: readonly Annotate[];
  /** spec.annotate `{ x, text }` items ([] when unset). */
  notes: readonly AnnotateAt[];
  /** Units forms ([] for other types; all three when unset). */
  forms: readonly ("waffle" | "bars" | "swarm")[];
  /** Index into `forms` from view.form, clamped. */
  form: number;
  /** Remaining path levels below the drilled branch ([] when no path). */
  path: string[];
  /** Applied drill values, outer first ([] at the root). seriesPath: series values; a chord with 3 levels: the target only. */
  drilled: string[];
  /** What the drill gesture pushes now: "x" (the category or branch), "series" (seriesPath, drillTo: the mark's data-series), or null (nothing deeper, or drill off). */
  drillOn: "x" | "series" | null;
  /** heatmap: xPath levels below view.xDrill ([] without xPath); x is its first. */
  xPath: string[];
  /** heatmap: applied column drill values, outer first. */
  xDrilled: string[];
  /** waterfall spec.start (it is also a total); null when unset. */
  start: string | null;
  /** heatmap totals: true (Shaped.margins). */
  margins: boolean;
  /** table: most rows drawn (page * (view.page + 1); 1000 with scroll); null = the rows that fit. */
  shown: number | null;
  /** table page or scroll: the svg is as tall as its rows (MarkOut.height) and scrolls in the tile. */
  scroll: boolean;
  /** table: view.filter when spec.filter (data is already filtered); null otherwise. */
  filter: string | null;
  /** table: spec.columns ([] when unset). */
  columns: readonly string[];
  /** table: spec.cells strips by column title, in spec order. */
  cells: ReadonlyMap<string, { field: string; by: string; last: number | null }>;
  /** Bar kind per measure: table spec.bars (unlisted "bar"); list: y is "bar" with bars: true, else "none". */
  bars: ReadonlyMap<string, "bar" | "diverging" | "none">;
  /** Rows open: table with an expand sub-spec, list with an evidence level. */
  expand: boolean;
  /** Open rows (raw x values): view.expanded ("" = none), else list's spec.expand default. */
  expanded: readonly string[];
  /** list: path[1], the evidence field; null otherwise. */
  evidence: string | null;
  /** list: spec.body; null otherwise. */
  body: string | null;
  /** list: spec.rowFormat; null otherwise. */
  rowFormat: string | null;
  /** Drilled: `slots` of the outermost drilled value (its palette slot, so a sunburst keeps the
   * branch's colour); null at the root. */
  hue: number | null;
  /** Path types (treemap sunburst sankey chord): palette slot (before % 8) per path value, from all
   * of spec.data before frame and drill: level by level, outer first, first appearance; a value
   * an outer level already holds keeps its slot. Also `tint` with `path` on the drill types (path
   * values, the same way) and weave with a group colorBy (group values, first appearance). Empty
   * otherwise. A colors map keys these when they are set (render.ts). */
  slots: ReadonlyMap<string, number>;
  /** spec.depth; null = the default (1 with drill, every level without). */
  depth: number | null;
  /** spec.minAngle in degrees; null = the default 4 px rule. */
  minAngle: number | null;
  /** Scatter zoom box [x0, x1, y0, y1] from view.window; null otherwise. */
  window: readonly [number, number, number, number] | null;
  size: string | null;
  name: string | null;
  totals: string[];
  /** The stack mode shown: spec.stack, or the view.stack entry of a stack array. */
  stack: boolean | "percent" | "stream";
  /** spec.stack as an array of modes ([] when it is not one): the control lists them, `stack` is the active one. */
  stacks: readonly (boolean | "percent" | "stream")[];
  /** spec.frame: [field, distinct values in data order, index shown]; `data` holds that frame's rows. */
  frame: readonly [field: string, values: readonly string[], i: number] | null;
  horizontal: boolean;
  /** "sum" under a ratio aggregate (both of its fields sum). */
  aggregate: Aggregate;
  /** spec.aggregate.ratio [numerator, denominator]: a group's y is sum(num) / sum(den), null when sum(den) is 0. */
  ratio: readonly [num: string, den: string] | null;
  sort: "asc" | "desc" | "change" | null;
  /** Table header sort from the view; null when unset. */
  sortBy: readonly [field: string, dir: "asc" | "desc"] | null;
  limit: number | null;
  /** Per-field format; a bare-string `spec.format` is expanded to every measure. */
  format: ReadonlyMap<string, FieldFormat>;
  titles: ReadonlyMap<string, string>;
  /** null = the type's default. */
  labels: boolean | null;
  text: Partial<Record<TextKey, string>>;
  /** As written: data tokens are resolved at render (a11y.ts titleText). */
  title: string | null;
  subtitle: string | null;
  description: string | null;
  legend: boolean;
  /** Where the legend sits (spec.legend true = "top"). */
  legendAt: "top" | "bottom" | "right";
  tooltip: boolean;
  drill: boolean;
  select: false | true | "multi";
  zoom: boolean;
  grid: boolean;
  xAxis: boolean;
  yAxis: boolean;
  locale: string;
  currency: string;
  /** The active measure's domain (keyed yDomain: its entry or null). */
  yDomain: readonly [number, number] | null;
  /** Domains per measure: the array form applies to every measure, the keyed form (kpi, gauge) to its keys. */
  domains: ReadonlyMap<string, readonly [number, number]>;
  xDomain: readonly [number, number] | null;
  /** spec.rules across the value axis, in object form ([] when unset). */
  rules: readonly { y: number | "mean"; label: string | null }[];
  /** spec.rules `{ slope }` items (scatter): y = k * x + b. */
  slopes: readonly { k: number | "mean"; b: number; label: string | null }[];
  /** spec.rules `{ x }` items: rules across the category (or scatter x) axis. */
  xRules: readonly { x: string | number; label: string | null }[];
  /** spec.rules `{ y2 }` items: rules across the right axis (bar with y2). */
  y2Rules: readonly { y: number; label: string | null }[];
  /** spec.rules `{ band }` items, lo <= hi: shaded value-axis ranges. */
  bands: readonly { lo: number; hi: number; label: string | null }[];
  table: boolean;
  animate: boolean;
  colors: readonly string[] | ReadonlyMap<string, string> | null;
  /** "sign", a field (ramp), or the active measure's thresholds (null when a keyed colorBy has none for it). */
  colorBy: "sign" | ResolvedGoal | string | null;
  /** Thresholds per measure: the object form applies to every measure, the keyed form (kpi) to its keys. Empty otherwise. */
  goals: ReadonlyMap<string, ResolvedGoal>;
  /** The theme's tokens: a name or [name, overrides] resolved through the registry. */
  theme: ThemeTokens;
}

/** spec.colorBy thresholds with defaults: null when unset, better "higher". */
export interface ResolvedGoal {
  target: number | null;
  warn: number | null;
  better: "higher" | "lower";
}

/** One (category, series) value after grouping/stacking. */
export interface Cell {
  /** Category index into `Shaped.categories`. */
  ci: number;
  /** Series index into `Shaped.series` (0 when there is no series field). */
  si: number;
  /** Raw value, or null when the row is missing / null. */
  value: number | null;
  /** Bar/area span in data units. Grouped: [0, value]. Stacked: cumulative. */
  y0: number;
  y1: number;
}

export interface Shaped {
  /** Category labels (String of the raw value; `OTHER` for the limit roll-up). */
  categories: string[];
  /** Waterfall: true where the category is in `spec.totals`. Parallel to `categories`. */
  totals: boolean[];
  /** Series keys in first-appearance order ([""] when there is no series field; kpi with a `y` array: the measures, so a cell's si is its measure index). */
  series: string[];
  /** Visible series only (excludes `view.hidden`), as indexes into `series`. */
  visible: number[];
  /** Cells for visible series, category-major order. */
  cells: Cell[];
  /** Min/max over all cell spans (includes 0 for bars). [0, 0] when empty. */
  extent: [number, number];
  /** spec.y2 aggregated per category (parallel to `categories`); [] without y2. */
  y2: (number | null)[];
  /** Time axis: UTC ms per category (parallel to `categories`, ascending); null for a band axis. */
  time: number[] | null;
  /** Downsampled: [categories kept, categories before]; null when nothing was dropped. */
  reduced: [kept: number, total: number] | null;
  /** Each category's index in the list before window and reduction (view.window's space): time axis, or a categorical line thinned past MAX_POINTS; null otherwise. */
  index: number[] | null;
  /** A bar with more categories than fit kept the top N and rolled the rest into Other: [N, categories before]; null otherwise. */
  capped: [kept: number, total: number] | null;
  /** heatmap totals: true: each column's total (parallel to categories), each row's (parallel to series) and the grand total, combined by aggregate over the rows of visible series; absent otherwise. */
  margins?: { x: (number | null)[]; series: (number | null)[]; all: number | null };
}

export interface BandScale {
  domain: readonly string[];
  /** Distance between band starts. */
  step: number;
  /** Width of one band. */
  bandwidth: number;
  /** Start coordinate of the band for `value`'s index. */
  at(index: number): number;
}

export interface LinearScale {
  domain: readonly [number, number];
  range: readonly [number, number];
  /** Logarithmic (spec.xScale / yScale "log"): `of` maps log10 of the value; domain stays in data units. */
  log?: boolean;
  of(value: number): number;
}

/**
 * A band scale whose bands sit at their time: `at(i)` is the start of a band centred on
 * `t[i]`, so marks written for bands need no change. `bandwidth` comes from the smallest gap.
 */
export interface TimeScale extends BandScale {
  kind: "time";
  /** Pixel position of a UTC ms value (tick placement). */
  of(ms: number): number;
}

/** Narrow with `"bandwidth" in s`; a time scale also has `kind === "time"`. */
export type Scale = BandScale | LinearScale | TimeScale;

export type TimeUnit = "year" | "quarter" | "month" | "week" | "day" | "hour" | "minute" | "second";

export interface TimeTicks {
  /** UTC ms of each tick, aligned to the unit's calendar boundary, inside [min, max]. */
  values: number[];
  unit: TimeUnit;
  /** Multiple of the unit between ticks (e.g. 3 with "hour" for every 3 hours). */
  every: number;
}

export interface Ticks {
  /** Nice, step-aligned domain covering the input. */
  domain: [number, number];
  values: number[];
  step: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Layout {
  width: number;
  height: number;
  /** The plot rectangle (marks live here). */
  plot: Box;
  /** Draw every nth x label (1 = all). */
  xLabelEvery: number;
}

/** One screen axis a mark asks for. `field` names the title/format source. */
export type Axis =
  | { kind: "band"; field: string; domain: readonly string[] }
  | { kind: "linear"; field: string; domain: readonly [number, number]; log?: boolean }
  /** Categories placed at their time; `t` parallel to `domain` (Shaped.time). */
  | { kind: "time"; field: string; domain: readonly string[]; t: readonly number[] }
  | null;

export type Fail = (code: ErrorCode, path: string, headline: string, ...details: string[]) => never;

/** A colorBy tone, written as data-tone. "warn" only with a warn threshold, "zero" only under "sign". */
export type Tone = "good" | "warn" | "bad" | "zero";

/** Where `ctx.label` places text relative to its anchor point. */
export type LabelPlace = "center" | "above" | "below" | "start" | "end";

/** Everything a mark may use. Closures are built in render.ts. */
export interface MarkCtx {
  spec: ResolvedSpec;
  shaped: Shaped;
  width: number;
  height: number;
  plot: Box;
  /** Right gutter (px) reserved for direct end labels; 0 = none, and the legend is dropped. */
  gutter: number;
  /** With spec.frame and spec.size: the largest |size| over every frame (so a radius means one value in all frames); else null. */
  sizeMax: number | null;
  /** The [name, last value] pairs those end labels show (empty when there is no gutter). */
  ends: readonly [string, string][];
  /** Scale of the bottom (horizontal) axis; null when the mark has none. */
  x: Scale | null;
  /** Scale of the left (vertical) axis; null when the mark has none. */
  y: Scale | null;
  /** Scale of the right axis (bar with y2); null otherwise. */
  y2: LinearScale | null;
  /** Display text for a raw value of `field` (step = tick step for number decimals). */
  fmt(field: string, v: unknown, step?: number): string;
  /** Queue a value label into `<g data-maya="labels">`; false if it collided and was dropped. `key` = the data-key of the mark it labels; `ann` marks a spec.annotate label (written as data-ann; "note" for an `{ x, text }` item). */
  label(
    x: number,
    y: number,
    text: string,
    place: LabelPlace,
    key?: string,
    ann?: Annotate | "note",
  ): boolean;
  /** colorBy tone for a value of `field` (default the active measure): "good" | "warn" | "bad" ("zero" for 0 under sign), or null without sign or a target for that field. */
  tone(v: number, field?: string): Tone | null;
  /** colorBy ramp bucket 0..9 for a value of the colorBy field; null when colorBy is not a field. */
  q(v: number): number | null;
  /** Shared aggregation (same rules as shape: nulls skipped, count = non-null). */
  agg(kind: Aggregate): (values: readonly (number | null | undefined)[]) => number | null;
  fail: Fail;
  t(key: TextKey, ...args: (string | number)[]): string;
}

/** Markup for each SVG group a mark fills. Absent groups render empty. */
export interface MarkOut {
  marks: string;
  hits: string;
  labels?: string;
  legend?: string;
  grid?: string;
  cross?: string;
  /** A sentence appended to the auto description (scatter density cells). */
  note?: string;
  /** Replaces the hidden data table (plain text, escaped by a11y.ts): boxplot five numbers, funnel steps.
   * The first cell of each row is its row header. */
  table?: { head: readonly string[]; rows: readonly (readonly string[])[] };
  /** The svg's height when the content is taller than the box (table page or scroll). */
  height?: number;
  /** Where an expanded table row's sub-chart goes: render.ts draws it there as `<svg data-maya="expand">`. */
  expand?: Box;
}

/** A chart type. Core marks live in render.ts's CORE map; modules `register()` theirs. */
export interface Mark {
  /** Noun for the auto description ("Bar" -> "Bar chart of …"). */
  noun: string;
  /** Bottom and left axes, plus an optional right linear axis (bar with y2). Absent: no axes (path types, kpi). */
  axes?(spec: ResolvedSpec, shaped: Shaped): [bottom: Axis, left: Axis, right?: Axis];
  /** `[name, last value]` per series when the mark draws direct end labels; absent or empty otherwise. */
  ends?(spec: ResolvedSpec, shaped: Shaped, fmt: MarkCtx["fmt"]): [string, string][];
  /** Extra validation after the core checks (e.g. hexmap `unknown-state`). */
  check?(spec: ChartSpec, fail: Fail): void;
  draw(ctx: MarkCtx): MarkOut;
}

/** Pieces the shell and the element assemble. */
export interface Parts {
  /** `<svg>` markup without an embedded `<style>`. */
  svg: string;
  /** Legend HTML (`""` when hidden). */
  legend: string;
  /** Measure toggle HTML, a `.maya-ctl` radiogroup (`""` without a `y` array). */
  controls: string;
  /** Breadcrumb HTML, `.maya-crumbs` (`""` when not drilled). */
  crumbs: string;
  /** Legend placement for `.maya[data-legend]` (spec.legend true = "top"; absent = "top"). */
  legendAt?: "top" | "bottom" | "right";
  /** Hidden data table HTML (`""` when disabled). */
  table: string;
  /** Visible title HTML, tokens resolved, then `<p class="maya-sub">` with the subtitle (`""` when neither). */
  title: string;
  /** Inline style for overrides from `spec.colors` / `spec.theme` (`""` when none). */
  style: string;
  /** The same overrides as [custom property, value] pairs (applied via CSSOM). */
  vars: [string, string][];
  /** Non-fatal notes for the developer (never rendered). */
  warnings: string[];
  /** With spec.frame: [index shown, frame count]. */
  frame?: readonly [i: number, n: number];
}

/* ------------------------------------------------------------------ */
/* Element interaction contracts (src/element/{measure,drill,select,zoom}.ts). */
/* ------------------------------------------------------------------ */

/** Interaction state the element owns; rendered through RenderOptions.view/selected. */
export interface State {
  view: View;
  selected: readonly Sel[];
}

/** Sent to every reducer when the element's spec object changes (incl. `el.data =`). */
export interface SpecEvent {
  type: "spec";
  prev: ChartSpec | undefined;
  next: ChartSpec;
}

/** What <maya-chart> hands each interaction module's `mount()`. */
export interface Host {
  root: ShadowRoot;
  el: HTMLElement;
  spec(): ChartSpec | undefined;
  state(): State;
  /** User-initiated transition: re-render, then dispatch maya-view / maya-select if changed. */
  commit(next: State, target?: (Sel & { value: unknown }) | null): void;
  /** Polite live-region announcement (debounced 300 ms). */
  announce(text: string): void;
  /** The mark a pointer event stands for (the tooltip's pick: hits and nearest points resolved). */
  mark(e: Event): Element | undefined;
}

/** Returned by `mount()`. Keyboard handlers return true when they handled the key. */
export interface Handlers {
  /** Abort an in-progress gesture (zoom brush). Escape priority 2. */
  cancel?(): boolean;
  /** Escape at this module's priority: select 3, zoom window 4, drill pop 5. */
  escape?(): boolean;
  /** Enter on the keyboard-active mark: drill first, then select. */
  enter?(mark: Element): boolean;
  /** After every paint (re-apply data-selected, restore focus). */
  painted?(): void;
  off(): void;
}
