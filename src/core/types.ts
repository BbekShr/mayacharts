/** A data row. Field values are read by name via `spec.x`, `spec.y`, `spec.series`. */
export type Row = Readonly<Record<string, string | number | boolean | null | undefined>>;

export type ChartType = "bar" | "line" | "area";

export type NumberFormat = "auto" | "compact" | "percent" | "currency";

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
  | "focus";

/**
 * The whole public API surface. Plain JSON on purpose: it must stay serializable,
 * LLM-generatable, diffable and hashable. Never add function-valued options.
 */
export interface ChartSpec {
  type: ChartType;
  data: readonly Row[];
  /** Field for the category axis. */
  x: string;
  /** Field holding numbers. */
  y: string;
  /** Field that splits rows into series (grouped or stacked). */
  series?: string;
  /** Stack series instead of grouping them. `bar` and `area` only. */
  stack?: boolean;

  /** Visible heading, also the accessible name. */
  title?: string;
  /** Accessible description; auto-generated when omitted. */
  description?: string;

  /** Default: true when `series` is set. */
  legend?: boolean;
  tooltip?: boolean;
  grid?: boolean;
  xAxis?: boolean;
  yAxis?: boolean;
  xLabel?: string;
  yLabel?: string;
  yFormat?: NumberFormat;
  /** BCP 47 locale for number formatting. Default "en-US" (deterministic SSR). */
  locale?: string;
  /** ISO 4217 code used when `yFormat` is "currency". Default "USD". */
  currency?: string;
  /** Fixed y domain. Default: nice-extended data extent, 0-anchored for bars. */
  yDomain?: readonly [number, number];
  /** Visually hidden data table for screen readers. Default true. */
  table?: boolean;
  /** Animate data updates (element only). Default true. */
  animate?: boolean;

  /** Overrides the categorical palette, in series order. */
  colors?: readonly string[];
  /** Overrides theme tokens (written as CSS custom properties). */
  theme?: Partial<Record<ThemeToken, string>>;
}

export interface RenderOptions {
  /** Pixel size of the plot box. Default 640 x 320. */
  width?: number;
  height?: number;
  /** Series keys to omit (legend toggling). */
  hidden?: readonly string[];
}

/* ------------------------------------------------------------------ */
/* Internal pipeline types (exported for tests and the element layer). */
/* ------------------------------------------------------------------ */

/** Spec with every default applied. Produced by `resolve()` in validate.ts. */
export interface ResolvedSpec {
  type: ChartType;
  data: readonly Row[];
  x: string;
  y: string;
  series: string | null;
  stack: boolean;
  title: string | null;
  description: string | null;
  legend: boolean;
  tooltip: boolean;
  grid: boolean;
  xAxis: boolean;
  yAxis: boolean;
  xLabel: string | null;
  yLabel: string | null;
  yFormat: NumberFormat;
  locale: string;
  currency: string;
  yDomain: readonly [number, number] | null;
  table: boolean;
  animate: boolean;
  colors: readonly string[] | null;
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
  /** Category labels in first-appearance order. */
  categories: string[];
  /** Series keys in first-appearance order ([""] when there is no series field). */
  series: string[];
  /** Visible series only (excludes `RenderOptions.hidden`), as indexes into `series`. */
  visible: number[];
  /** Cells for visible series, category-major order. */
  cells: Cell[];
  /** Min/max over all cell spans (includes 0 for bars). [0, 0] when empty. */
  extent: [number, number];
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

/** Pieces the shell and the element assemble. */
export interface Parts {
  /** `<svg>` markup without an embedded `<style>`. */
  svg: string;
  /** Legend HTML (`""` when hidden). */
  legend: string;
  /** Hidden data table HTML (`""` when disabled). */
  table: string;
  /** Visible title HTML (`""` when no title). */
  title: string;
  /** Inline style for overrides from `spec.colors` / `spec.theme` (`""` when none). */
  style: string;
}
