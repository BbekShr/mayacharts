// The pure half of the chart builder (builder.html): sample specs, field guessing, paste parsing,
// option controls read from schema.json, and the copy-paste snippets. No DOM, so
// test/builder.test.ts runs all of it in node.
//
// Staying current: chart types and options come from schema.json, which option shows for which
// type comes from ONLY in validate.ts, and the CDN version from package.json. A new chart type
// fails test/builder.test.ts until it has a sample here; a new option fails it until it maps to a
// control kind or joins SKIP.
import schema from "../schema.json" with { type: "json" };
import pkg from "../package.json" with { type: "json" };
import type { ChartSpec, ChartType, Row } from "../src/index.ts";
import { MAX_MARKS, MayaSpecError, ONLY, TEMPLATE, validateSpec } from "../src/core/validate.ts";
import { MODULE_OF } from "../src/core/registry.ts";
import { REGION_OF, mulberry32 } from "./data.ts";

export const VERSION: string = pkg.version;
export const TYPES = schema.properties.type.enum as ChartType[];

// ---------------------------------------------------------------------------------------------
// Samples: one small, synthetic, readable dataset per type. Field names are display-ready
// ("Sales", "Margin %") so axis titles read well with no `titles` map.

const rnd = mulberry32(20261005);
const between = (lo: number, hi: number) => Math.round(lo + rnd() * (hi - lo));
// ISO months, so Month is a date column with date formats (and a time axis on line and area).
const MONTHS = Array.from({ length: 12 }, (_, i) => `2025-${String(i + 1).padStart(2, "0")}`);
const REGIONS = ["North", "South", "East", "West"];
const FAMILIES = ["Outerwear", "Tops", "Bottoms", "Accessories"];
const ITEMS = [
  ["Parka", "Outerwear"],
  ["Rain shell", "Outerwear"],
  ["Fleece", "Outerwear"],
  ["Tee", "Tops"],
  ["Oxford shirt", "Tops"],
  ["Sweater", "Tops"],
  ["Jeans", "Bottoms"],
  ["Chinos", "Bottoms"],
  ["Shorts", "Bottoms"],
  ["Cap", "Accessories"],
  ["Scarf", "Accessories"],
  ["Tote", "Accessories"],
] as const;

const monthly: Row[] = MONTHS.map((Month, i) => ({
  Month,
  Sales: 42000 + i * 2600 + between(0, 9000),
  Units: 310 + i * 22 + between(0, 80),
}));
const regionFamily: Row[] = REGIONS.flatMap((Region) =>
  FAMILIES.map((Family) => ({
    Region,
    Family,
    Sales: between(20000, 90000),
    Units: between(200, 900),
  })),
);
const items: Row[] = ITEMS.map(([Item, Family]) => ({
  Item,
  Family,
  Price: between(15, 180),
  "Margin %": between(18, 62),
  Units: between(120, 1600),
}));
const regionMonth: Row[] = MONTHS.flatMap((Month, i) =>
  REGIONS.map((Region, j) => ({
    Month,
    Region,
    Sales: 9000 + i * (500 + j * 260) + between(0, 4000),
  })),
);
const halves: Row[] = ["CA", "TX", "NY", "FL", "IL", "WA"].flatMap((State) =>
  ["H1", "H2"].map((Half) => ({ State, Half, Sales: between(40000, 120000) })),
);
const states: Row[] = Object.keys(REGION_OF).map((State) => ({
  State,
  Sales: between(5000, 95000),
}));
const growth: Row[] = FAMILIES.map((Family) => ({
  Family,
  Sales: between(20000, 90000),
  "Growth %": between(-12, 30),
}));
const bridge: Row[] = [
  { Step: "Start", Change: 120000 },
  { Step: "New customers", Change: 46000 },
  { Step: "Upsell", Change: 18000 },
  { Step: "Churn", Change: -31000 },
  { Step: "Discounts", Change: -12000 },
  { Step: "End", Change: 0 },
];

const stages: Row[] = [
  { Stage: "Visits", Users: 12000 },
  { Stage: "Product view", Users: 7400 },
  { Stage: "Cart", Users: 2900 },
  { Stage: "Checkout", Users: 1600 },
  { Stage: "Paid", Users: 1100 },
];

const s = (spec: Omit<ChartSpec, "type">): Omit<ChartSpec, "type"> => spec;
const MONTHLY = { Month: "month", Sales: "compact" } as const;
export const SAMPLES: Readonly<Record<string, Omit<ChartSpec, "type">>> = {
  bar: s({
    title: "Sales by product family",
    x: "Family",
    y: "Sales",
    series: "Region",
    format: "compact",
    data: regionFamily,
  }),
  line: s({ title: "Monthly sales", x: "Month", y: "Sales", format: MONTHLY, data: monthly }),
  area: s({
    title: "Sales by region",
    x: "Month",
    y: "Sales",
    series: "Region",
    stack: true,
    format: MONTHLY,
    data: regionMonth,
  }),
  scatter: s({
    title: "Price against margin",
    x: "Price",
    y: "Margin %",
    size: "Units",
    name: "Item",
    series: "Family",
    data: items,
  }),
  heatmap: s({
    title: "Sales by region and family",
    x: "Family",
    y: "Sales",
    series: "Region",
    format: "compact",
    data: regionFamily,
  }),
  waterfall: s({
    title: "Revenue bridge",
    x: "Step",
    y: "Change",
    totals: ["End"],
    labels: true,
    format: "compact",
    data: bridge,
  }),
  kpi: s({ title: "Monthly sales", x: "Month", y: "Sales", format: MONTHLY, data: monthly }),
  dumbbell: s({
    title: "Sales by state, first half to second half",
    x: "State",
    y: "Sales",
    series: "Half",
    format: "compact",
    data: halves,
  }),
  ridgeline: s({
    title: "Monthly sales by region",
    x: "Month",
    y: "Sales",
    series: "Region",
    format: MONTHLY,
    data: regionMonth,
  }),
  beeswarm: s({
    title: "Margin by product family",
    x: "Family",
    y: "Margin %",
    name: "Item",
    data: items,
  }),
  parallel: s({
    title: "Items across price, margin and units",
    x: "Item",
    y: ["Price", "Margin %", "Units"],
    data: items,
  }),
  table: s({ title: "Item scorecard", x: "Item", y: ["Price", "Margin %", "Units"], data: items }),
  treemap: s({
    title: "Units by family and item",
    path: ["Family", "Item"],
    y: "Units",
    data: items,
  }),
  sunburst: s({
    title: "Units by family and item",
    path: ["Family", "Item"],
    y: "Units",
    data: items,
  }),
  sankey: s({
    title: "Region to product family",
    path: ["Region", "Family"],
    y: "Sales",
    format: "compact",
    data: regionFamily,
  }),
  chord: s({
    title: "Region to product family",
    path: ["Region", "Family"],
    y: "Sales",
    format: "compact",
    data: regionFamily,
  }),
  marimekko: s({
    title: "Region size and family mix",
    x: "Region",
    y: "Sales",
    series: "Family",
    format: "compact",
    data: regionFamily,
  }),
  waffle: s({ title: "Share of units by family", x: "Family", y: "Units", data: regionFamily }),
  radial: s({ title: "Sales by month", x: "Month", y: "Sales", format: MONTHLY, data: monthly }),
  gauge: s({
    title: "Margin this year",
    y: "Margin %",
    aggregate: "mean",
    yDomain: [0, 100],
    colorBy: { target: 40, warn: 30 },
    data: items,
  }),
  hexmap: s({ title: "Sales by state", x: "State", y: "Sales", format: "compact", data: states }),
  boxplot: s({
    title: "Monthly sales by region",
    x: "Region",
    y: "Sales",
    name: "Month",
    format: MONTHLY,
    data: regionMonth,
  }),
  funnel: s({ title: "Checkout funnel", x: "Stage", y: "Users", labels: true, data: stages }),
  weave: s({
    title: "Sales rank by region",
    x: "Month",
    y: "Sales",
    series: "Region",
    format: MONTHLY,
    data: regionMonth,
  }),
  units: s({ title: "Items by family", x: "Family", y: "Units", name: "Item", data: items }),
  orbit: s({
    title: "Sales and growth by family",
    x: "Family",
    y: "Sales",
    y2: "Growth %",
    format: { Sales: "compact" },
    data: growth,
  }),
  constellation: s({
    title: "Items alike in price, margin and units",
    x: "Item",
    y: ["Price", "Margin %", "Units"],
    size: "Units",
    series: "Family",
    data: items,
  }),
};

/** A fresh copy of a type's sample spec (callers mutate it). */
export const sample = (t: ChartType): ChartSpec =>
  structuredClone({ type: t, ...SAMPLES[t]! }) as ChartSpec;

/**
 * New numbers for the same rows: each value scaled by 0.6 to 1.4 and rounded, so categories,
 * keys and signs stay and the preview animates from the old values to the new ones.
 */
export const reroll = (spec: ChartSpec, rand: () => number = Math.random): ChartSpec => ({
  ...spec,
  data: spec.data.map((r) =>
    Object.fromEntries(
      Object.entries(r).map(([k, v]) => [
        k,
        typeof v === "number" ? Math.round(v * (0.6 + rand() * 0.8)) : v,
      ]),
    ),
  ),
});

const NAMES: Record<string, string> = {
  kpi: "KPI",
  hexmap: "Hex map",
  radial: "Radial bar",
  parallel: "Parallel",
  boxplot: "Box plot",
};
/** "hexmap" -> "Hex map", "drillOut" -> "Drill out": type names and option keys as labels. */
export const label = (t: string): string =>
  NAMES[t] ?? t[0]!.toUpperCase() + t.slice(1).replace(/[A-Z]/g, (c) => " " + c.toLowerCase());

/** Picker groups. A type missing here still shows, under "More". */
export const GROUPS: readonly (readonly [string, readonly string[]])[] = [
  ["Compare", ["bar", "dumbbell", "waterfall", "kpi", "gauge", "funnel", "table", "orbit"]],
  ["Trend", ["line", "area", "ridgeline", "radial", "weave"]],
  ["Distribution", ["scatter", "beeswarm", "boxplot", "heatmap", "parallel", "constellation"]],
  ["Part to whole", ["treemap", "sunburst", "marimekko", "waffle", "units"]],
  ["Flow and map", ["sankey", "chord", "hexmap"]],
];

// ---------------------------------------------------------------------------------------------
// Field roles and option controls.

export const ROLES = ["x", "y", "y2", "was", "series", "size", "name", "path"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABEL: Record<Role, string> = {
  x: "Category",
  y: "Value",
  y2: "Right axis line",
  was: "Previous value",
  series: "Split by",
  size: "Bubble size",
  name: "Point name",
  path: "Levels",
};

/** Whether spec option `k` is allowed on type `t` (validate.ts ONLY). */
export const applies = (k: string, t: string): boolean =>
  !Object.hasOwn(ONLY, k) || ONLY[k]!.includes(t);

/** Roles a type offers: the ones its sample uses, plus optional ones validate.ts allows on it. */
export const roles = (t: ChartType): Role[] =>
  ROLES.filter(
    (k) =>
      SAMPLES[t]![k] !== undefined ||
      (k !== "x" && k !== "path" && Object.hasOwn(ONLY, k) && applies(k, t)),
  );

/** Spec keys the builder deliberately has no control for (set them in the copied code). */
export const SKIP = new Set([
  "$schema",
  "type",
  "data",
  "totals",
  "titles",
  "text",
  "yDomain",
  "xDomain",
  "rules",
  "colors",
  "colorBy",
  "theme",
  "format", // set per field under Fields, see formatFields()
  "forms", // units: an array of forms, set in the copied code
  ...ROLES,
]);

// ---------------------------------------------------------------------------------------------
// Hover help: what each chart, field and option does, in plain words. A key missing here falls
// back to its schema.json description, so a new option still explains itself.

export const TYPE_HELP: Readonly<Record<string, string>> = {
  bar: "Compare amounts across categories with bars.",
  line: "Show how values change over time or along an order.",
  area: "Like a line, with the area below filled. Stack it to show parts of a total over time.",
  scatter:
    "Plot two numbers against each other to show a relationship. Bubble size can add a third.",
  heatmap: "A grid of coloured cells: two categories across and down, the value as colour.",
  waterfall: "Show how a starting value rises and falls step by step to an end total.",
  kpi: "One headline number with a small trend line.",
  dumbbell: "Two values per category joined by a line, such as before and after.",
  ridgeline: "One small area chart per series, stacked so their shapes compare.",
  beeswarm: "One dot per row along a value axis, spread out so none overlap.",
  parallel: "Each row is a line across several value axes, to compare many measures at once.",
  table: "The values in a sortable table.",
  treemap: "Nested rectangles sized by value, for parts of a whole with levels.",
  sunburst: "Rings of slices sized by value, for parts of a whole with levels.",
  sankey: "Flows between groups, with band widths sized by value.",
  chord: "Flows between groups arranged in a circle.",
  marimekko: "Bars whose widths and inner splits both show share of the total.",
  waffle: "A 10 by 10 grid of squares showing each category's share.",
  radial: "Bars arranged around a circle.",
  gauge: "One number on a dial with a fixed range, coloured by a target.",
  hexmap: "US states as equal hexagons coloured by value.",
  boxplot: "How values spread in each category: the middle half as a box, the median as a line.",
  funnel: "How many remain at each step of a process, with the share kept from step to step.",
  weave: "Ranks over time as threads, so you see who passes whom.",
  units: "One dot per row that regroups as a grid, bars or a swarm.",
  orbit: "Categories as planets: size shows the value, speed shows the growth.",
  constellation: "Rows as stars placed near the rows they are most alike.",
};

const HELP: Readonly<Record<string, string>> = {
  x: "The column that names each bar, point or slice, such as month or region.",
  y: "The number to plot. Tick more than one to add a toggle between them.",
  y2: "A second number drawn as a line against its own axis on the right. On an orbit, the growth.",
  was: "The earlier value of each bar, drawn as a faint bar behind it so the change shows.",
  series: "Split the rows into coloured groups by this column, such as region.",
  size: "A number that sets each bubble's size.",
  name: "The column that names each point in its tooltip.",
  path: "Columns from the outer level to the inner one, such as region then state.",
  aggregate:
    "How rows with the same category combine: add them, average them, count them, or keep the smallest or largest.",
  sort: "Order the categories by their total: smallest first (asc) or largest first (desc).",
  limit: 'Show only the top N categories. The rest are grouped into one "Other".',
  xType:
    "How the category axis is spaced. Time spaces dates by real time; category puts them side by side evenly.",
  stack: "Pile the groups on top of each other instead of side by side.",
  horizontal: "Lay the chart on its side, with the categories down the left.",
  labels: "Print each value on its mark.",
  locale: "Language and region for numbers and dates, such as en-US or de-DE.",
  currency: "Currency for the currency format, as a three-letter code such as USD or EUR.",
  title: "The heading above the chart. Screen readers also use it as the chart's name.",
  description:
    "A sentence for screen readers about what the chart shows. Written for you when empty.",
  tooltip: "Show the exact values in a small box when someone points at or focuses a mark.",
  legend: "Show the colour key. Clicking an entry hides or shows that group.",
  drill: "Clicking a part zooms into the next level. A breadcrumb and Escape lead back out.",
  drillOut: "While zoomed in, clicking empty space goes back up one level.",
  select:
    'Clicking a mark highlights it and fades the rest, so it stands out. "multi" lets people pick several. Your page can react to what is picked. Escape clears.',
  zoom: "Drag across the chart to zoom into a range. Double-click or Escape resets.",
  animate: "Animate the chart when it first draws and whenever the data changes.",
  grid: "Light guide lines behind the marks.",
  xAxis: "The bottom axis with its labels.",
  yAxis: "The left axis with its labels.",
  table: "A hidden data table that screen readers can browse.",
};

/** What `key` (a field role or option) does, for its hover help. */
export function helpFor(key: string): string {
  if (Object.hasOwn(HELP, key)) return HELP[key]!;
  const p = (schema.properties as Record<string, Prop>)[key];
  const d = p?.description ?? p?.oneOf?.map((b) => b.description ?? "").join(" ") ?? "";
  return d.replace(/`(\w+)`/g, (_, k: string) => `"${nameOf(k)}"`).trim();
}

// ---------------------------------------------------------------------------------------------
// Formats, chosen per field. The spec takes one preset for every value, or a map by field.

const DATE_PRESETS = ["date", "month", "year", "time", "datetime"];
const PRESETS = (schema.properties.format.oneOf[0] as { enum: string[] }).enum;
/** Presets that fit a column of numbers or of dates, with an example of each. */
export const FORMATS: Readonly<Record<"number" | "date", readonly string[]>> = {
  number: PRESETS.filter((p) => !DATE_PRESETS.includes(p)),
  date: PRESETS.filter((p) => DATE_PRESETS.includes(p)),
};
export const FORMAT_EXAMPLE: Readonly<Record<string, string>> = {
  auto: "picked for you",
  integer: "1,235",
  decimal: "1,234.57",
  compact: "1.2K",
  percent: "0.25 → 25%",
  currency: "$1,234.57",
  date: "Mar 5, 2025",
  month: "Mar 2025",
  year: "2025",
  time: "2:30 PM",
  datetime: "Mar 5, 2025, 2:30 PM",
};
export const FORMAT_HELP =
  'How each column reads on axes, labels and tooltips. Numbers and dates pick a style; percent expects fractions, so 0.25 shows as 25%, and currency uses the Currency option. A text category can get words before or after it, such as "Q" before 1.';

/**
 * Fields a format applies to, in field order (category first), each with its kind: numbers and
 * dates take a preset; a text category takes words before and after it.
 */
export function formatFields(
  spec: ChartSpec,
  cols: readonly Col[],
): { field: string; kind: Kind; role: Role }[] {
  const used: [Role, unknown][] = [
    ["x", spec.x],
    ...[spec.y].flat().map((f): [Role, unknown] => ["y", f]),
    ["y2", spec.y2],
    ["size", spec.size],
  ];
  const out: { field: string; kind: Kind; role: Role }[] = [];
  for (const [role, f] of used) {
    if (typeof f !== "string" || out.some((o) => o.field === f)) continue;
    const kind = cols.find((c) => c.name === f)?.kind;
    if (kind && (kind !== "text" || role === "x")) out.push({ field: f, kind, role });
  }
  return out;
}

/** A text format as the words around the value: "{value} units" -> ["", " units"]. */
export function aroundOf(format: string): [string, string] {
  const m = TEMPLATE.exec(format);
  return m ? [m[1]!, m[3]!] : ["", ""];
}
/** Words around the value as a format template, or "" when there are none. Braces are dropped. */
export function around(before: string, after: string): string {
  const b = before.replace(/[{}]/g, "");
  const a = after.replace(/[{}]/g, "");
  return b || a ? `${b}{value}${a}`.slice(0, 80) : "";
}

/** The preset a field shows with now ("" for the default). A single preset covers every y. */
export function formatOf(spec: ChartSpec, field: string): string {
  const f = spec.format;
  if (typeof f === "string") return [spec.y].flat().includes(field) ? f : "";
  const v = f && Object.hasOwn(f, field) ? (f as Record<string, unknown>)[field] : undefined;
  return typeof v === "string" ? v : "";
}

/**
 * The spec's `format` after setting `field` to `preset` ("" for the default), as a map of the
 * listed fields only, so a field no longer in use never lingers as an unknown-field key.
 */
export function withFormat(
  spec: ChartSpec,
  fields: readonly string[],
  field: string,
  preset: string,
): ChartSpec["format"] {
  const map: Record<string, string> = {};
  for (const f of fields) {
    const v = f === field ? preset : formatOf(spec, f);
    if (v) map[f] = v;
  }
  return Object.keys(map).length ? (map as ChartSpec["format"]) : undefined;
}

export type Control = {
  key: string;
  kind: "bool" | "enum" | "int" | "text" | "unknown";
  values: string[];
  def: unknown;
  help: string;
};
type Prop = {
  type?: string;
  enum?: unknown[];
  oneOf?: Prop[];
  default?: unknown;
  description?: string;
};

/** One control per schema.json option the builder offers, in schema order. */
export function controls(): Control[] {
  return Object.entries(schema.properties as Record<string, Prop>)
    .filter(([k]) => !SKIP.has(k))
    .map(([key, p]) => {
      const c: Control = {
        key,
        kind: "unknown",
        values: [],
        def: p.default,
        help: p.description ?? "",
      };
      if (p.type === "boolean") c.kind = "bool";
      else if (p.type === "integer") c.kind = "int";
      else if (p.type === "string") c.kind = p.enum ? "enum" : "text";
      else if (p.oneOf) c.kind = "enum";
      // `format`: the preset branch; `select`: true or "multi". Templates and maps are code-only.
      if (c.kind === "enum")
        for (const b of p.oneOf ?? [p])
          if (b.type === "boolean") c.values.push("true");
          else if (b.enum) c.values.push(...b.enum.map(String));
      if (c.kind === "enum" && !c.values.length) c.kind = "unknown";
      return c;
    });
}

/** A control's string value back to the spec value ("true" from a select becomes true). */
export const fromControl = (c: Control, v: string): unknown =>
  v === "" ? undefined : c.kind === "int" ? Number(v) : v === "true" ? true : v;

// ---------------------------------------------------------------------------------------------
// Guidance: the library's own validation, said in the builder's words.

/** The builder's name for a spec key: "series" -> "Split by", "drillOut" -> "Drill out". */
export const nameOf = (k: string): string =>
  (ROLES as readonly string[]).includes(k) ? ROLE_LABEL[k as Role] : label(k);

/**
 * A MayaSpecError message as a headline and one hint, with spec keys named the way the builder
 * labels them. The error page link is dropped; the page links the error code itself.
 */
export function explain(message: string, code = "", path = ""): { headline: string; hint: string } {
  const say = (l: string) =>
    l
      .trim()
      .replace(/^mayacharts: /, "")
      .replace(/spec\.data\[(\d+)\]\.?(\S*)/g, (_, i: string, f: string) =>
        f ? `"${f}" in row ${+i + 1}` : `row ${+i + 1}`,
      )
      .replace(/spec\.type = "(\w+)"/g, (_, t: string) => `a ${label(t)} chart`)
      .replace(/spec\.(\w+)/g, (_, k: string) => `"${nameOf(k)}"`);
  const [head = "", ...rest] = message.split("\n");
  // A missing field is fixed in the Fields step; the library's hint lists spec keys instead.
  const hint =
    code === "missing-field" && path
      ? `Choose a column for "${nameOf(path)}" under Fields.`
      : say(rest.find((l) => l.trim() && !l.trim().startsWith("->")) ?? "");
  return { headline: say(head), hint };
}

/** Rows a probe validates: option rules do not depend on how many rows there are. */
const PROBE_ROWS = 200;
const check = (spec: object): MayaSpecError | null => {
  try {
    validateSpec(spec);
    return null;
  } catch (e) {
    return e instanceof MayaSpecError ? e : null;
  }
};

export type Block = { hide: boolean; why: string };

/**
 * Asks the library whether setting option `key` to `value` would break the current spec. Null
 * means it is fine (or the spec is already broken, so the probe cannot tell). `hide` is set when
 * the fix needs a field this chart type does not offer in the builder, such as drill on a
 * dumbbell needing path: the option can never work here.
 */
export function prober(spec: ChartSpec): (key: string, value: unknown) => Block | null {
  const base = { ...spec, data: spec.data.slice(0, PROBE_ROWS) };
  if (check(base)) return () => null;
  const offered = roles(spec.type);
  return (key, value) => {
    const e = check({ ...base, [key]: value });
    if (!e) return null;
    const needs = [...e.message.split("\n")[0]!.matchAll(/spec\.(\w+)/g)].map((m) => m[1]!);
    const hide = needs.some(
      (k) => (ROLES as readonly string[]).includes(k) && !offered.includes(k as Role),
    );
    return { hide, why: explain(e.message).headline };
  };
}

// ---------------------------------------------------------------------------------------------
// Pasted data.

// ponytail: the builder's preview takes at most 1 MB, MAX_MARKS rows and 50 columns of pasted data,
// so a huge paste cannot freeze the tab. The generated code has no such limit.
export const LIMITS = { bytes: 1_000_000, rows: MAX_MARKS, cols: 50 } as const;

export type Kind = "number" | "date" | "text";
export type Col = { name: string; kind: Kind };
export type Parsed = { rows: Row[]; cols: Col[] } | { error: string };

const n = (v: number) => v.toLocaleString("en-US");
const NUM = /^[-+]?\$?(\d+(\.\d*)?|\.\d+)(e[-+]?\d+)?%?$/i;
const GROUPED = /^[-+]?\$?\d{1,3}(,\d{3})+(\.\d+)?%?$/;
const DATE = /^\d{4}-\d{2}(-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?)?$/;
const isNum = (v: string) => NUM.test(v) || GROUPED.test(v);
const toNum = (v: string) => Number(v.replace(/[$,%]/g, ""));

/** Size of a paste in UTF-8 bytes. */
export const bytes = (text: string): number => new TextEncoder().encode(text).length;

/** CSV, TSV, semicolon-separated or a JSON array of objects, within LIMITS. */
export function parse(text: string): Parsed {
  const size = bytes(text);
  if (size > LIMITS.bytes)
    return {
      error: `This paste is ${n(Math.ceil(size / 1000))} KB. The builder takes up to ${n(LIMITS.bytes / 1000)} KB. Paste a sample here; the code it writes works with all of your data.`,
    };
  const t = text.replace(/^\uFEFF/, "").trim();
  if (!t) return { error: "Paste CSV with a header row, or a JSON array of objects." };
  return t[0] === "[" || t[0] === "{" ? json(t) : csv(t);
}

function json(t: string): Parsed {
  let v: unknown;
  try {
    v = JSON.parse(t);
  } catch (e) {
    return { error: `This is not valid JSON: ${(e as Error).message}` };
  }
  if (!Array.isArray(v)) return { error: "JSON must be an array of objects, one per row." };
  const names: string[] = [];
  for (const [i, r] of v.entries()) {
    if (r === null || typeof r !== "object" || Array.isArray(r))
      return { error: `Row ${i + 1} is not an object. JSON must be an array of objects.` };
    for (const [k, x] of Object.entries(r)) {
      if (x !== null && typeof x === "object")
        return { error: `Row ${i + 1}, "${k}" holds a nested value. Use plain numbers and text.` };
      if (!names.includes(k)) names.push(k);
    }
  }
  return finish(names, v as Row[]);
}

function csv(t: string): Parsed {
  const first = t.slice(0, t.search(/\r?\n|$/));
  const count = (c: string) => first.split(c).length - 1;
  const d = count("\t") ? "\t" : count(";") > count(",") ? ";" : ",";
  const lines: string[][] = [];
  let row: string[] = [];
  let f = "";
  let quoted = false;
  let line = 1;
  let start = 1;
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (quoted) {
      if (c === '"' && t[i + 1] === '"') ((f += '"'), i++);
      else if (c === '"') quoted = false;
      else {
        if (c === "\n") line++;
        f += c;
      }
    } else if (c === '"' && f === "") ((quoted = true), (start = line));
    else if (c === d) (row.push(f), (f = ""));
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      (row.push(f), lines.push(row), (row = []), (f = ""), line++);
    } else f += c;
  }
  if (quoted) return { error: `Line ${start} opens a quote that never closes.` };
  (row.push(f), lines.push(row));
  const body = lines.filter((r) => r.length > 1 || r[0]!.trim() !== "");
  const head = body.shift()!.map((h, i) => h.trim() || `Column ${i + 1}`);
  const dup = head.find((h, i) => head.indexOf(h) !== i);
  if (dup) return { error: `Column names must be unique: "${dup}" appears twice.` };
  const wide = body.findIndex((r) => r.length > head.length);
  if (wide >= 0)
    return {
      error: `Row ${wide + 1} has ${body[wide]!.length} values but the header has ${head.length}.`,
    };
  if (!body.length) return { error: "Add at least one row of data under the header." };
  if (body.length > LIMITS.rows) return tooMany(body.length, head.length);
  const kinds = head.map((_, j) => {
    const vals = body.map((r) => (r[j] ?? "").trim()).filter((v) => v !== "");
    return !vals.length
      ? "text"
      : vals.every(isNum)
        ? "number"
        : vals.every((v) => DATE.test(v))
          ? "date"
          : "text";
  });
  const rows = body.map((r) =>
    Object.fromEntries(
      head.map((h, j) => {
        const v = (r[j] ?? "").trim();
        return [h, v === "" ? null : kinds[j] === "number" ? toNum(v) : v];
      }),
    ),
  );
  return finish(head, rows);
}

const tooMany = (rows: number, cols: number): Parsed => ({
  error:
    rows > LIMITS.rows
      ? `This paste has ${n(rows)} rows. The builder previews up to ${n(LIMITS.rows)}. Paste a sample here; the code it writes works with all of your data.`
      : `This paste has ${n(cols)} columns. The builder takes up to ${LIMITS.cols}. Keep the columns the chart needs.`,
});

function finish(names: string[], rows: Row[]): Parsed {
  if (!rows.length) return { error: "Add at least one row of data." };
  if (rows.length > LIMITS.rows || names.length > LIMITS.cols)
    return tooMany(rows.length, names.length);
  return { rows, cols: columnsOf(rows, names) };
}

/** Each column's kind: all numbers, all ISO dates, or text. */
export function columnsOf(
  rows: readonly Row[],
  names: readonly string[] = [...new Set(rows.flatMap((r) => Object.keys(r)))],
): Col[] {
  return names.map((name): Col => {
    const vals = rows.map((r) => r[name]).filter((v) => v != null && v !== "");
    const kind: Kind =
      vals.length && vals.every((v) => typeof v === "number")
        ? "number"
        : vals.length && vals.every((v) => typeof v === "string" && DATE.test(v))
          ? "date"
          : "text";
    return { name, kind };
  });
}

/** A best first guess at field roles for type `t` from the pasted columns. */
export function guess(t: ChartType, cols: readonly Col[]): Partial<ChartSpec> {
  const sm = SAMPLES[t]!;
  const num = cols.filter((c) => c.kind === "number").map((c) => c.name);
  const cat = [
    ...cols.filter((c) => c.kind === "date"),
    ...cols.filter((c) => c.kind === "text"),
  ].map((c) => c.name);
  const pick = (from: string[], ...not: unknown[]) => from.find((f) => !not.includes(f));
  const out: Record<string, unknown> = {};
  if (sm.path) out["path"] = cat.slice(0, Math.max(2, sm.path.length));
  if (sm.x) out["x"] = t === "scatter" ? num[0] : cat[0];
  out["y"] = Array.isArray(sm.y)
    ? num.filter((f) => f !== out["x"]).slice(0, sm.y.length)
    : pick(num, out["x"]);
  if (sm.series) out["series"] = pick(cat, out["x"]);
  if (sm.size) out["size"] = pick(num, out["x"], out["y"]);
  if (sm.name) out["name"] = pick(cat, out["x"], out["series"]);
  for (const k in out)
    if (out[k] === undefined || (Array.isArray(out[k]) && !(out[k] as unknown[]).length))
      delete out[k];
  return out as Partial<ChartSpec>;
}

// ---------------------------------------------------------------------------------------------
// Snippets.

export const TABS = [
  "HTML",
  "ThoughtSpot",
  "React",
  "Vue",
  "Svelte",
  "Angular",
  "JSON",
  "Node",
] as const;
export type Tab = (typeof TABS)[number];
export type File = { name: string; code: string };

/** Rows inlined in the code. Longer data is cut to SHOWN rows with a note to paste the rest. */
export const INLINE = 60;
export const SHOWN = 20;

const CDN = `https://cdn.jsdelivr.net/npm/mayacharts@${VERSION}/dist/maya.global.js`;

/**
 * The spec as a JS/JSON literal: options first, one row per line. `<` is written as \u003c (valid
 * in JSON and JS strings) so data holding "</script>" cannot end a script element.
 */
export function literal(spec: ChartSpec, pad = ""): string {
  const { data, ...rest } = spec;
  const cut = data.length > INLINE;
  const rows = (cut ? data.slice(0, SHOWN) : data).map((r) => `${pad}    ${JSON.stringify(r)}`);
  const head = flat(JSON.stringify(rest, null, 2)).replace(/\n}$/, "");
  const body = rows.length ? `[\n${rows.join(",\n")}\n${pad}  ]` : "[]";
  return `${head.replace(/\n/g, `\n${pad}`)},\n${pad}  "data": ${body}\n${pad}}`.replace(
    /</g,
    "\\u003c",
  );
}

/** Arrays of plain values on one line: `"path": ["Region", "Family"]`. */
const flat = (json: string) =>
  json.replace(/\[\n\s*([^[\]{}]*?)\n\s*\]/g, (_, v: string) => `[${v.replace(/,\n\s*/g, ", ")}]`);

/** Note for code that holds only some of the rows, or "". */
export const cutNote = (spec: ChartSpec): string =>
  spec.data.length > INLINE
    ? `The code holds the first ${SHOWN} of ${n(spec.data.length)} rows. Load your full data where it says data.`
    : "";

/** Constant names for column names: "Total sales" -> TOTAL_SALES, unique, never a digit first. */
function constNames(fields: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  const taken = new Set<string>();
  for (const f of fields) {
    if (out.has(f)) continue;
    let base =
      f
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "") || "FIELD";
    if (/^\d/.test(base)) base = `F_${base}`;
    let name = base;
    for (let i = 2; taken.has(name); i++) name = `${base}_${i}`;
    taken.add(name);
    out.set(f, name);
  }
  return out;
}

/**
 * chart.js for ThoughtSpot: the column names as constants, the spec with data from the search,
 * and the plumbing every tile shares. Cells may arrive wrapped ({ value } or { v }), so readRows
 * unwraps them.
 */
export function thoughtSpotJs(spec: ChartSpec): string {
  const { data: _, type, ...rest } = spec;
  const q = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");
  const used = ROLES.flatMap((k) => [spec[k] ?? []].flat() as string[]);
  const names = constNames(used);
  const ref = (f: string) => names.get(f) ?? q(f);
  const value = (k: string, v: unknown): string => {
    if ((ROLES as readonly string[]).includes(k))
      return Array.isArray(v) ? `[${v.map(ref).join(", ")}]` : ref(v as string);
    if (k === "format" && v && typeof v === "object")
      return `{ ${Object.entries(v)
        .map(([f, p]) => `${names.has(f) ? `[${ref(f)}]` : q(f)}: ${q(p)}`)
        .join(", ")} }`;
    return q(v);
  };
  const lines = [
    `  type: ${q(type)},`,
    "  data: readRows(),",
    ...Object.entries(rest).map(([k, v]) => `  ${k}: ${value(k, v)},`),
  ];
  return `// Column names from your search. Rename the quoted names to match the "Available Columns"
// list ThoughtSpot shows at the top of this tab.
${[...names].map(([f, n]) => `const ${n} = ${q(f)};`).join("\n")}

document.getElementById("chart").spec = {
${lines.join("\n")}
};
renderDone();

// ThoughtSpot plumbing (the same in every tile).
function readRows() {
  const result = viz?.getDataFromSearchQuery?.()?.getData() ?? { schema: [], data: [] };
  const cell = (v) =>
    v && typeof v === "object" ? (typeof v.value === "function" ? v.value() : (v.value ?? v.v)) : v;
  return result.data.map((r) =>
    Object.fromEntries(result.schema.map((col, i) => [col.name, cell(r[i])])),
  );
}
function renderDone() {
  customElements.whenDefined("maya-chart").then(() => viz?.events?.emitRenderCompletedEvent());
}
`;
}

/** Every tab's files for `spec`. */
export function snippets(spec: ChartSpec): Record<Tab, File[]> {
  const mod = Object.hasOwn(MODULE_OF, spec.type) ? MODULE_OF[spec.type] : undefined;
  const imports = `import "mayacharts/element";\n${mod ? `import "mayacharts/${mod}";\n` : ""}`;
  const install = `// npm install mayacharts@${VERSION}\n`;
  const lit = literal(spec);
  return {
    HTML: [
      {
        name: "chart.html",
        code: `<maya-chart id="chart"></maya-chart>
<!-- Pin this file: add integrity="sha384-..." and crossorigin="anonymous" from the release summary at https://github.com/BbekShr/mayacharts/releases -->
<script src="${CDN}"></script>
<script>
  // A style attribute needs unsafe-inline under a strict CSP; a CSSOM write does not.
  document.getElementById("chart").style.height = "360px";
  document.getElementById("chart").spec = ${literal(spec, "  ")};
</script>
`,
      },
    ],
    // A Muze Studio chart: the HTML, CSS and JS tabs of a ThoughtSpot custom chart, in the shape of
    // the tiles already running there. Rows come from the search, so only the spec's shape is
    // pasted, with each column name in a constant to rename.
    ThoughtSpot: [
      {
        name: "chart.html",
        code: `<!-- mayaCharts draws the chart into this element. -->
<!-- Pin this file: add integrity="sha384-..." and crossorigin="anonymous" from the release summary at https://github.com/BbekShr/mayacharts/releases -->
<script src="${CDN}"></script>
<maya-chart id="chart"></maya-chart>
`,
      },
      {
        name: "chart.css",
        code: `html,
body {
  height: 100%;
  margin: 0;
  overflow: hidden;
  background: #fff;
}
#chart {
  display: block;
  height: 100%;
  color-scheme: light;
}
`,
      },
      { name: "chart.js", code: thoughtSpotJs(spec) },
    ],
    React: [
      {
        name: "Chart.jsx",
        code: `${install}${imports}
const spec = ${lit};

// React 19 passes spec to the element as a property.
export function Chart() {
  return <maya-chart spec={spec} style={{ height: 360 }} />;
}
`,
      },
    ],
    Vue: [
      {
        name: "Chart.vue",
        code: `<script setup>
${install}// vite.config: vue({ template: { compilerOptions: { isCustomElement: (t) => t === "maya-chart" } } })
${imports}
const spec = ${lit};
</script>

<template>
  <maya-chart :spec.prop="spec" :style="{ height: '360px' }" />
</template>
`,
      },
    ],
    Svelte: [
      {
        name: "Chart.svelte",
        code: `<script>
  ${install.trim()}
  ${imports.trim().replace(/\n/g, "\n  ")}

  const spec = ${literal(spec, "  ")};
</script>

<maya-chart {spec} style:height="360px"></maya-chart>
`,
      },
    ],
    Angular: [
      {
        name: "chart.component.ts",
        code: `${install}import { CUSTOM_ELEMENTS_SCHEMA, Component } from "@angular/core";
${imports}
@Component({
  selector: "app-chart",
  standalone: true,
  template: \`<maya-chart [spec]="spec" [style.height.px]="360"></maya-chart>\`,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ChartComponent {
  spec = ${literal(spec, "  ")};
}
`,
      },
    ],
    JSON: [{ name: "spec.json", code: `${lit}\n` }],
    Node: [
      {
        name: "server.js",
        code: `${install}import { renderShell } from "mayacharts";
${mod ? `import "mayacharts/${mod}";\n` : ""}
const spec = ${lit};

// Plain HTML and SVG that show without JavaScript. Load mayacharts/element in the page to make
// the chart interactive.
const html = renderShell(spec, { width: 640, height: 360 });
`,
      },
    ],
  };
}
