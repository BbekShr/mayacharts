import type { TextKey } from "./strings.ts";

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
  | "treemap"
  | "sunburst"
  | "sankey"
  | "chord"
  | "marimekko"
  | "waffle"
  | "radial"
  | "hexmap"
  | "boxplot"
  | "funnel"
  | "weave"
  | "units"
  | "orbit"
  | "constellation";

export type Aggregate = "sum" | "mean" | "count" | "min" | "max";

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
  | "bad"
  | "series1"
  | "series2"
  | "series3"
  | "series4"
  | "series5"
  | "series6"
  | "series7"
  | "series8";

/** Field names of row type `R` (autocompletes for typed rows; `string` for `Row`). */
export type Field<R> = Extract<keyof R, string>;

/**
 * The whole public API surface. Plain JSON on purpose: it must stay serializable,
 * LLM-generatable, diffable and hashable. Never add function-valued options.
 * Rule: `x` is always the category and `y` always the value, whatever the orientation.
 */
export interface ChartSpec<R extends object = Row> {
  /** Ignored; lets editors and LLMs find the JSON schema.
   * @example "$schema": "https://unpkg.com/mayacharts/schema.json" */
  $schema?: string;
  /** Chart type. treemap/sunburst/marimekko/waffle need `mayacharts/hierarchy`, sankey/chord `flow`, radial `radial`, hexmap `geo`, boxplot/funnel `stats`; weave, units, orbit and constellation each need the module of the same name.
   * @example type: "bar" */
  type: ChartType;
  /** Row objects.
   * @example data: [{ month: "Jan", revenue: 10 }] */
  data: readonly R[];
  /** How rows sharing a (category, series) combine. `count` counts non-null y. Default "sum".
   * @example aggregate: "mean" */
  aggregate?: Aggregate;
  /** Order categories by total across all series (hidden ones too). Default: data order.
   * @example sort: "desc" */
  sort?: "asc" | "desc";
  /** Keep the top N categories by total; the rest roll up into a final "Other".
   * @example limit: 10 */
  limit?: number;

  /** Category field (scatter: numeric x; hexmap: US state; kpi: optional period, last one is the headline; beeswarm: optional row; parallel: one line each; table: row label; boxplot: one box each; funnel: the stage, omitted when `y` lists the stages). Not used by path types.
   * @example x: "month" */
  x?: Field<R>;
  /** How x is spaced. "auto": a time axis when every x is an ISO 8601 date ("2024-03" or longer) on line, area or vertical bar without sort or limit; else categories. "time" also accepts epoch ms numbers. Default "auto".
   * @example xType: "category" */
  xType?: "auto" | "category" | "time";
  /** Value field; an array adds a measure toggle, first one active (parallel: one axis each; table: one column each; funnel without `x`: one stage each, its rows combined by `aggregate`).
   * @example y: ["revenue", "units"] */
  y: Field<R> | readonly Field<R>[];
  /** Splits rows into series (heatmap: the row category; dumbbell: exactly two, from and to; ridgeline: one row each; marimekko: the segments; radial: stacked outward; boxplot: boxes side by side; weave: one thread each, required). bar line area scatter heatmap dumbbell ridgeline beeswarm parallel marimekko radial boxplot weave.
   * @example series: "region" */
  series?: Field<R>;
  /** Hierarchy fields, outer to inner. treemap sunburst sankey; bar/line/area/dumbbell with `drill` (replaces `x`).
   * @example path: ["region", "state"] */
  path?: readonly Field<R>[];
  /** Bubble area field (sqrt scale). scatter constellation.
   * @example size: "population" */
  size?: Field<R>;
  /** Point identity and tooltip title (units: one dot per row, keyed by it). scatter, beeswarm, boxplot (outliers and dots) and units.
   * @example name: "country" */
  name?: Field<R>;
  /** x values drawn as running-total bars. waterfall only.
   * @example totals: ["Q1", "FY"] */
  totals?: readonly string[];
  /** Stack series instead of grouping them; "percent" shows each category's visible values as shares of its total, axis 0 to 100% (with negatives: shares of the summed magnitudes, below 0). bar and area only.
   * @example stack: "percent" */
  stack?: boolean | "percent";
  /** Categories on the left axis. bar and dumbbell.
   * @example horizontal: true */
  horizontal?: boolean;
  /** Playback: one frame per distinct value (data order); the chart shows one frame at a time, the last by default, and the element adds a Play button. Value axes span every frame. Values match as strings (1 and "1" are one frame); null rows belong to none; at most 200 frames. bar line area scatter dumbbell; not with `drill` or `zoom`.
   * @example frame: "year" */
  frame?: Field<R>;
  /** Second value field, drawn as a line on a right axis over the bars (vertical bar only); orbit: growth, which sets each planet's speed and direction.
   * @example y2: "units" */
  y2?: Field<R>;
  /** Previous value field: a ghost bar at the old value behind each bar, "was" in the tooltip, a table column and a sentence naming the 2 largest relative moves. bar; not with `stack` or a `y` array.
   * @example was: "lastWeek" */
  was?: Field<R>;
  /** Forms a units chart switches between, first one shown (view.form picks another); the element adds a form control when there are 2 or more. Default all three. units only.
   * @example forms: ["waffle", "swarm"] */
  forms?: readonly ("waffle" | "bars" | "swarm")[];

  /** A preset for every `y`, or a preset / Intl options per field. Display only.
   * @example format: { revenue: "currency", month: "month", margin: { style: "percent", suffix: " gm" } } */
  format?: FormatPreset | FormatTemplate | Readonly<Partial<Record<Field<R>, FieldFormat>>>;
  /** Display names by field: axis titles (shown only when set), tooltip, legend, table.
   * @example titles: { revenue: "Revenue ($)" } */
  titles?: Readonly<Partial<Record<Field<R>, string>>>;
  /** Formatted values on marks. Default false (heatmap: true when cells are ≥ 24 px; treemap and sunburst: names, marimekko: shares, true).
   * @example labels: true */
  labels?: boolean;
  /** Localised UI strings with `{0}` placeholders (see strings.ts for keys).
   * @example text: { noData: "Keine Daten", back: "Zurück" } */
  text?: Readonly<Partial<Record<TextKey, string>>>;
  /** BCP 47 locale for formatting. Default "en-US" (deterministic SSR).
   * @example locale: "de-DE" */
  locale?: string;
  /** ISO 4217 code for the "currency" preset. Default "USD".
   * @example currency: "EUR" */
  currency?: string;
  /** Visible heading, also the accessible name.
   * @example title: "Revenue by month" */
  title?: string;
  /** Accessible description; auto-generated when omitted.
   * @example description: "Revenue doubled from January to December." */
  description?: string;
  /** Fixed value-axis domain; [hi, lo] reverses it (ranks with 1 on top). Not allowed with a `y` array.
   * @example yDomain: [0, 100] */
  yDomain?: readonly [number, number];
  /** Fixed x domain. scatter only.
   * @example xDomain: [0, 1] */
  xDomain?: readonly [number, number];
  /** Reference lines across the value axis (at most 4): a number, or "mean" of the visible values (stacked: of the category totals), optionally labelled. bar line area scatter.
   * @example rules: [100, "mean"] or rules: [{ y: 100, label: "Target" }] */
  rules?: readonly (number | "mean" | { readonly y: number | "mean"; readonly label?: string })[];

  /** Hover/keyboard tooltip. Default true.
   * @example tooltip: false */
  tooltip?: boolean;
  /** Legend; clicking toggles series. Default: true when `series` is set, and for waffle, hexmap (colour ramp) and units (toggles groups).
   * @example legend: false */
  legend?: boolean;
  /** Line and area: name each series at its right end and drop the legend (keep it with `legend: true`). Default true.
   * @example endLabels: false */
  endLabels?: boolean;
  /** Click/Enter zooms into a branch of `path`; breadcrumb, Back and Escape pop.
   * @example drill: true */
  drill?: boolean;
  /** With `drill`: a click on empty chart space goes back up one level. Default true.
   * @example drillOut: false */
  drillOut?: boolean;
  /** Click/Enter/legend selects marks, others dim; Escape clears. Not with `drill`.
   * @example select: "multi" */
  select?: true | "multi";
  /** Drag to zoom. line, area, scatter. Reset chip, double-click and Escape restore.
   * @example zoom: true */
  zoom?: boolean;
  /** Animate the first draw and every update (element only; off under reduced motion). Default true.
   * @example animate: false */
  animate?: boolean;

  /** Palette in series order (max 8), or colours by series value.
   * @example colors: { North: "#0b6", South: "oklch(.6 .17 30)" } */
  colors?: readonly string[] | Readonly<Record<string, string>>;
  /** Tone by sign of y, by a target, or a ramp by a numeric field. Not with `series` (dumbbell: "sign" of to minus from; kpi: target only, drawn as a bullet bar).
   * @example colorBy: { target: 100 } */
  colorBy?: "sign" | { readonly target: number } | Field<R>;
  /** Theme token overrides (CSS values, allowlisted).
   * @example theme: { accent: "#0b6", font: "'Inter', sans-serif" } */
  theme?: Readonly<Partial<Record<ThemeToken, string>>>;
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
  /** Index of `y` in `measures`. */
  measure: number;
  series: string | null;
  /** Right-axis line measure (bar), or growth (orbit); null when unset. */
  y2: string | null;
  /** spec.was, the previous value field (bar); null when unset. */
  was: string | null;
  /** Units forms ([] for other types; all three when unset). */
  forms: readonly ("waffle" | "bars" | "swarm")[];
  /** Index into `forms` from view.form, clamped. */
  form: number;
  /** Remaining path levels below the drilled branch ([] when no path). */
  path: string[];
  /** Applied drill values, outer first ([] at the root). */
  drilled: string[];
  /** Drilled: first-appearance index of the outermost branch among its siblings (its palette
   * slot, so a sunburst keeps the branch's colour); null at the root. */
  hue: number | null;
  /** Scatter zoom box [x0, x1, y0, y1] from view.window; null otherwise. */
  window: readonly [number, number, number, number] | null;
  size: string | null;
  name: string | null;
  totals: string[];
  stack: boolean | "percent";
  /** spec.frame: [field, distinct values in data order, index shown]; `data` holds that frame's rows. */
  frame: readonly [field: string, values: readonly string[], i: number] | null;
  horizontal: boolean;
  aggregate: Aggregate;
  sort: "asc" | "desc" | null;
  /** Table header sort from the view; null when unset. */
  sortBy: readonly [field: string, dir: "asc" | "desc"] | null;
  limit: number | null;
  /** Per-field format; a bare-string `spec.format` is expanded to every measure. */
  format: ReadonlyMap<string, FieldFormat>;
  titles: ReadonlyMap<string, string>;
  /** null = the type's default. */
  labels: boolean | null;
  text: Partial<Record<TextKey, string>>;
  title: string | null;
  description: string | null;
  legend: boolean;
  tooltip: boolean;
  drill: boolean;
  select: false | true | "multi";
  zoom: boolean;
  grid: boolean;
  xAxis: boolean;
  yAxis: boolean;
  locale: string;
  currency: string;
  yDomain: readonly [number, number] | null;
  xDomain: readonly [number, number] | null;
  /** spec.rules in object form ([] when unset). */
  rules: readonly { y: number | "mean"; label: string | null }[];
  table: boolean;
  animate: boolean;
  colors: readonly string[] | ReadonlyMap<string, string> | null;
  colorBy: "sign" | { readonly target: number } | string | null;
  theme: Partial<Record<ThemeToken, string>>;
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
  /** Series keys in first-appearance order ([""] when there is no series field). */
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
  /** Time axis: each category's index in the time-ordered list before window and reduction (view.window's space); null otherwise. */
  index: number[] | null;
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
  | { kind: "linear"; field: string; domain: readonly [number, number] }
  /** Categories placed at their time; `t` parallel to `domain` (Shaped.time). */
  | { kind: "time"; field: string; domain: readonly string[]; t: readonly number[] }
  | null;

export type Fail = (code: ErrorCode, path: string, headline: string, ...details: string[]) => never;

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
  /** Queue a value label into `<g data-maya="labels">`; false if it collided and was dropped. `key` = the data-key of the mark it labels. */
  label(x: number, y: number, text: string, place: LabelPlace, key?: string): boolean;
  /** colorBy tone for a value: "good" | "bad", or null when colorBy is not sign/target. */
  tone(v: number): "good" | "bad" | null;
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
  /** Hidden data table HTML (`""` when disabled). */
  table: string;
  /** Visible title HTML (`""` when no title). */
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
