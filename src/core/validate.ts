/*
 * Validation: hand-written guards, zero deps. Errors only. Every error:
 *   mayacharts: <headline naming the spec path>\n  <detail lines>\n  -> https://bbekshr.github.io/mayacharts/errors.html#<code>
 * Order (first failure wins): object, unknown-option (HINTS, then "did you mean"), type, data/rows,
 * required fields, option types/values, ONLY + pair rules, field existence, numeric checks, Mark.check().
 * Codes:
 *   spec-not-object     spec is not a plain object
 *   missing-field       type/data/x|path/y absent (required fields + example)
 *   unknown-type        not core or registered (valid types, alias hint, "did you mean", or module import)
 *   data-not-array      data is not an array
 *   row-not-object      data[i] is not a plain object
 *   unknown-field       a field-valued option names no field in data
 *   non-numeric-y       data[i][y] not a finite number within 1e300 (null allowed; numeric strings get a coercion hint)
 *   non-numeric-field   size / scatter x / colorBy field, as above
 *   non-positive-value  treemap/sunburst/sankey y <= 0, funnel and ridgeline y < 0, a log axis value <= 0
 *   unknown-option      top-level key not in ChartSpec (HINTS, else "did you mean")
 *   invalid-option      wrong type/value for a known option
 *   option-unsupported  option not valid for this type or pair
 *   stack-unsupported   stack (true or "percent") with type "line"
 *   invalid-domain      yDomain/xDomain not [lo, hi] with lo < hi, |bounds| <= 1e300, span >= 1e-300
 *   invalid-format      unknown preset, bad Intl options, unsupported locale, bad currency
 *   invalid-theme       unknown theme token
 *   unsafe-css-value    colors/theme value outside the CSS allowlist
 *   invalid-size        RenderOptions width/height not finite > 0
 *   unknown-state       hexmap x names no US state (geo's Mark.check)
 *   too-many-marks      more than MAX_MARKS marks or MAX_FRAMES frames (thrown by render)
 *   invalid-date        xType "time" with an x that is neither ISO 8601 nor epoch ms
 *   too-few-measures    constellation with a y that is not an array of 2 or more measures
 * "Did you mean": smallest score (|len diff| + chars not shared; ties to longest prefix), only if <= 3.
 * Lookups keyed by user input go through Object.hasOwn or Array#includes.
 */
import { CORE_TYPES, MODULE_OF, MODULES, types } from "./registry.ts";
import { t as txt, TEXT } from "./strings.ts";
import { formatter } from "./format.ts";
import { pivotWas } from "./shape.ts";
import { memo } from "./svg.ts";
import { toTime } from "./ticks.ts";
import type {
  Aggregate,
  AnnotateAt,
  Annotate,
  ChartSpec,
  ErrorCode,
  FieldFormat,
  Goal,
  RenderOptions,
  ResolvedGoal,
  ResolvedSpec,
  Rule,
  View,
} from "./types.ts";

export type { ErrorCode };

export class MayaSpecError extends Error {
  readonly code: ErrorCode;
  /** Spec path such as "y", "data[3].revenue", "theme.accent". */
  readonly path: string;
  constructor(code: ErrorCode, path: string, message: string) {
    super(message);
    this.name = "MayaSpecError";
    this.code = code;
    this.path = path;
  }
}

// ponytail: hard cap instead of virtualisation; suggest limit/aggregate.
export const MAX_MARKS = 10000;
/** Most distinct `frame` values (every render shapes every frame). */
export const MAX_FRAMES = 200;
// ponytail: fixed downsampling target; a time axis keeps at most this many categories (LTTB).
export const MAX_POINTS = 1000;

const w = (s: string) => s.split(" ");
const S: Record<string, "string" | "boolean"> = Object.fromEntries([
  ...w("$schema x y2 series size name title subtitle description locale currency frame").map(
    (k) => [k, "string"],
  ),
  ...w("horizontal labels endLabels drill drillOut zoom grid xAxis yAxis table animate").map(
    (k) => [k, "boolean"],
  ),
]);
/** Every spec key (schema.json is tested against this). */
export const KEYS = [
  ...w(
    "type data y path totals aggregate sort limit format titles text yDomain xDomain rules select xType stack forms",
  ),
  ...w("was tooltip xScale yScale annotate dash depth minAngle legend"),
  ...w("colors colorBy theme"),
  ...Object.keys(S),
];
const CART = ["bar", "line", "area"];
/** Types whose x can come from path with drill (the current level is the category). */
const PATHX = [...CART, "dumbbell", "table", "marimekko"];
/** Types that take path only for drill: PATHX, and heatmap, whose path replaces series (its rows). */
const DRILLP = [...PATHX, "heatmap"];
const PATH = ["treemap", "sunburst", "sankey", "chord"];
/** Types that take aggregate: { ratio }: values compared side by side, never summed into a whole. */
const RATIO = w("bar line area heatmap dumbbell table kpi gauge hexmap");
/** Types whose x is not a category (a number, a date or unused): a null stays null. */
const NOBLANK = ["scatter", "kpi", "gauge", "constellation", "hexmap", ...PATH];
/** y arrays on these types are shown together (axes, columns), never a measure toggle. */
export const ALL_Y = ["parallel", "table", "funnel", "constellation", "kpi"];
/** Option -> types that accept it (option-unsupported otherwise). */
const CPA = "bar,line,area";
const PTH = "treemap,sunburst,sankey,chord";
const DRL = `${CPA},dumbbell,table,heatmap,marimekko,${PTH}`;
export const ONLY: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  w(
    `horizontal:bar,dumbbell y2:bar,orbit was:bar,kpi,gauge forms:units size:scatter,constellation name:scatter,beeswarm,boxplot,units path:${DRL} totals:waterfall series:${CPA},scatter,heatmap,dumbbell,ridgeline,beeswarm,parallel,marimekko,radial,boxplot,weave,constellation xType:${CPA} sort:${CPA},heatmap,dumbbell,table,radial,waffle,orbit limit:${CPA},heatmap,dumbbell,table,waffle,radial,orbit stack:bar,area colorBy:${CPA},waterfall,scatter,dumbbell,kpi,gauge,treemap,sunburst,hexmap,units,orbit,constellation xDomain:scatter drill:${DRL} drillOut:${DRL} depth:treemap minAngle:sunburst select:${CPA},waterfall,scatter,heatmap,dumbbell,beeswarm,parallel,table,marimekko,waffle,radial,treemap,sunburst,hexmap,boxplot,funnel,weave,units,orbit,constellation zoom:line,area,scatter endLabels:line,area rules:${CPA},scatter,dumbbell frame:${CPA},scatter,dumbbell xScale:scatter yScale:line,scatter annotate:${CPA},scatter dash:line,area`,
  )
    .map((e) => e.split(":"))
    .map(([k, v]) => [k, v!.split(",")]),
);
const AGGS = w("sum mean count min max");
const ANN = w("max min first last");
const LEG = w("top bottom right");
/** Types whose tooltip takes extra fields (tooltip: { fields }). */
const TIPF = [...CART, "scatter"];
const FORMS = w("waffle bars swarm");
const PRESETS = w("auto integer decimal compact percent currency date month year time datetime");
/** A format template: text, one `{value}` or `{value:preset}`, text. Braces elsewhere are not allowed. */
export const TEMPLATE = /^([^{}]*)\{value(?::(\w+))?\}([^{}]*)$/;
const DATE = w(
  "dateStyle timeStyle weekday era year month day dayPeriod hour minute second fractionalSecondDigits timeZoneName timeZone hour12 hourCycle calendar",
);
/** Format options holding any date key are Intl.DateTimeFormat options. */
export const isDateOpts = (o: object): boolean => DATE.some((k) => Object.hasOwn(o, k));
export const TOKENS = [
  ...w(
    "font fontSize fg fgMuted grid bg accent radius tooltipBg tooltipFg focus good warn bad line gridDash titleSize titleWeight axisSize",
  ),
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => "series" + n),
];
const HORIZ = "Use horizontal: true.";
const SIZED = "Size comes from CSS, or render(spec, { width, height }).";
const LOG = 'Use yScale: "log" or xScale: "log".';
const DOM = "Use yDomain: [min, max] (gauge: the dial range; kpi: the bullet scale).";
const PIE = 'Pie and donut charts are not supported: use "bar" or "treemap".';
const GEO = 'Use type: "hexmap" (import "mayacharts/geo").';
const EX =
  'Example: { type: "bar", data: [{ month: "Jan", revenue: 10 }], x: "month", y: "revenue" }';
/** Replacement text for foreign or retired option names, checked before "did you mean". */
const HINTS: Record<string, string> = {
  label: 'Use titles: { <field>: "Name" }, or labels: true for values on marks.',
  xLabel: 'Use titles: { <x field>: "Name" }.',
  yLabel: 'Use titles: { <y field>: "Name" }.',
  yFormat: 'Use format: "compact", or format: { <field>: "currency" }.',
  dataKey: 'Use y: "<field>" and x: "<field>".',
  indexAxis: HORIZ,
  orientation: HORIZ,
  width: SIZED,
  height: SIZED,
  color: 'Use colors: [...], or colorBy: "sign" | { target: n } | "<field>".',
  groupBy: 'Use series: "<field>".',
  formatter: "Functions are not supported (the spec is JSON). Use presets or Intl options.",
  "size:number": "spec.size names a field for bubble area. " + SIZED,
  "select:boolean": 'Use select: true or "multi".',
  timeline: 'Use frame: "<field>".',
  previous: 'Use was: "<field>" (bar, kpi, gauge).',
  target: "Use colorBy: { target: n }.",
  warn: "Use colorBy: { target: n, warn: n } (kpi, gauge).",
  min: DOM,
  max: DOM,
  scale: LOG,
  logScale: LOG,
  interaction: "Click selects; double-click or Shift+Enter drills.",
  styles: 'Use dash: ["<series value>"].',
  measures: 'Use aggregate: { ratio: ["<numerator>", "<denominator>"] }.',
  nested: "Use depth: 2.",
  legendPosition: 'Use legend: "bottom" or "right".',
};
/** Foreign type names -> what to write instead. */
const ALIAS: Record<string, string> = {
  column: 'Use type: "bar".',
  barh: 'Use type: "bar" with horizontal: true.',
  bubble: 'Use type: "scatter" with size: "<field>".',
  choropleth: GEO,
  map: GEO,
  pie: PIE,
  donut: PIE,
  bump: 'Use type: "weave" (import "mayacharts/weave").',
};
const GOAL = w("target warn better");
const FN = w("rgb rgba hsl hsla oklch oklab lab lch color color-mix light-dark var calc");
const FAM = String.raw`\s*(?:"[\w\s.\-]*"|'[\w\s.\-]*'|[\w\-]+(?:\s+[\w\-]+)*)\s*`;
const FONT = new RegExp(`^${FAM}(?:,${FAM})*$`);

const own = <T>(o: Readonly<Record<string, T>>, k: string): T | undefined =>
  Object.hasOwn(o, k) ? o[k] : undefined;
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const strs = (v: unknown, min = 0): v is string[] =>
  Array.isArray(v) && v.length >= min && v.every((c) => typeof c === "string");
const ty = (v: unknown) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);
/** Every key of `o` is in `ks`. */
const only = (o: object, ks: readonly string[]) => Object.keys(o).every((k) => ks.includes(k));
const fin = (n: unknown, m: number) => Number.isFinite(n) && Math.abs(n as number) <= m;
const show = (v: unknown) => {
  const t = typeof v === "string" || isObj(v) || Array.isArray(v) ? JSON.stringify(v) : String(v);
  return t.length > 60 ? t.slice(0, 59) + "…" : t;
};

const dym = (s: string, c: readonly string[]): string => {
  const a = s.toLowerCase();
  let best = "";
  let min = 40;
  for (const k of c) {
    const l = k.toLowerCase();
    const n = Math.abs(a.length - l.length) + [...l].filter((ch) => !a.includes(ch)).length;
    let p = 0; // ties go to the longest shared prefix
    while (p < 9 && a[p] !== undefined && a[p] === l[p]) p++;
    if (n < 4 && n * 10 - p < min) [min, best] = [n * 10 - p, k];
  }
  return best && `Did you mean "${best}"?`;
};

export const fail = (code: ErrorCode, path: string, headline: string, ...d: string[]): never => {
  const lines = [...d, `-> https://bbekshr.github.io/mayacharts/errors.html#${code}`];
  const body = lines.filter(Boolean).map((l) => "  " + l);
  throw new MayaSpecError(code, path, `mayacharts: ${headline}\n${body.join("\n")}`);
};

/** fail() with the headline "spec.<path> <rest>". */
const F = (code: ErrorCode, p: string, rest: string, ...d: string[]) =>
  fail(code, p, `spec.${p} ${rest}`, ...d);
const bad = (k: string, v: unknown, want: string) =>
  F(
    "invalid-option",
    k,
    `must be ${want}, received ${show(v)}.`,
    own(HINTS, `${k}:${ty(v)}`) ?? "",
  );

const css = (path: string, v: string, font: boolean) => {
  const ok = font
    ? FONT.test(v)
    : /^[#\w\s.,%()+\-\/]*$/.test(v) &&
      [...v.matchAll(/([\w-]*)\s*\(/g)].every((m) => FN.includes(m[1]!.toLowerCase()));
  if (!v || !ok)
    F(
      "unsafe-css-value",
      path,
      `= ${show(v)} is not a safe CSS value.`,
      `Allowed: colours, lengths, numbers and ${FN.join("() ")}(); fonts are family names.`,
      "Not allowed: url(), image-set(), other functions, ; { } < > \\ and (outside fonts) quotes.",
    );
};

/** One threshold object: kpi and gauge take any of target, warn, better; other types need target and take no warn. */
const goal = (t: string, p: string, v: unknown) => {
  const full = t === "kpi" || t === "gauge";
  const { target, warn, better } = (isObj(v) ? v : {}) as Record<string, unknown>;
  if (
    !isObj(v) ||
    !Object.keys(v).length ||
    !only(v, GOAL) ||
    ![target, warn].every((n) => n === undefined || fin(n, 1e300)) ||
    ![undefined, "higher", "lower"].includes(better as string)
  )
    F(
      "invalid-option",
      p,
      `must be { target${full ? "?: number, warn?" : ""}: number, better?: "higher" | "lower" }, received ${show(v)}.`,
      t === "kpi" && p === "colorBy" ? "Thresholds keyed by measure need a y array." : "",
    );
  if (!full && warn !== undefined) F("option-unsupported", `${p}.warn`, "works with: kpi, gauge.");
  if (!full && target === undefined) F("invalid-option", `${p}.target`, "is required.");
  if (warn === undefined) return;
  if (target === undefined) F("invalid-option", `${p}.warn`, `needs spec.${p}.target.`);
  const low = better === "lower";
  if (low ? (warn as number) <= (target as number) : (warn as number) >= (target as number))
    F(
      "invalid-option",
      `${p}.warn`,
      `= ${warn} must be ${low ? "above" : "below"} the target ${target} (${low ? "lower" : "higher"} is better).`,
      low ? "" : 'If lower is better, add better: "lower".',
    );
};

const bFmt = (p: string, rest: string, ...d: string[]) => F("invalid-format", p, rest, ...d);

const format = (path: string, v: unknown, locale: string) => {
  if (typeof v === "string") {
    if (/[{}]/.test(v)) {
      const m = TEMPLATE.exec(v);
      if (!m || v.length > 80 || (m[2] !== undefined && !PRESETS.includes(m[2])))
        bFmt(
          path,
          `= ${show(v)} is not a format template.`,
          'One {value} or {value:<preset>} plus text, e.g. "{value:percent} of plan".',
          m?.[2] === undefined ? "" : `Presets: ${PRESETS.join(", ")}. ${dym(m[2], PRESETS)}`,
        );
      return;
    }
    if (!PRESETS.includes(v))
      bFmt(
        path,
        `= ${show(v)} is not a format preset.`,
        `Presets: ${PRESETS.join(", ")}. Or per field: { <field>: preset or Intl options }.`,
        dym(v, PRESETS),
      );
    return;
  }
  if (!isObj(v)) bFmt(path, `must be a preset or Intl options, received ${show(v)}.`);
  const { prefix, suffix, ...o } = v as Record<string, unknown>;
  for (const [k, a] of [
    ["prefix", prefix],
    ["suffix", suffix],
  ] as const)
    if (a !== undefined && typeof a !== "string")
      bFmt(`${path}.${k}`, `must be a string, received ${show(a)}.`);
  const dt = isDateOpts(o);
  try {
    void (dt ? new Intl.DateTimeFormat(locale, o) : new Intl.NumberFormat(locale, o));
  } catch (e) {
    bFmt(
      path,
      `= ${show(v)} is not valid ${dt ? "Intl.DateTimeFormat" : "Intl.NumberFormat"} options.`,
      e instanceof Error ? e.message : String(e),
    );
  }
};

/** Table-driven option checks: [key, expected shape, predicate]. Applied only when the key is set. */
const CHECKS: [string, string, (v: any) => boolean][] = [
  [
    "y",
    "a field name or a non-empty array of field names",
    (v) => typeof v === "string" || strs(v, 1),
  ],
  ["path", "a non-empty array of field names", (v) => strs(v, 1)],
  ["totals", "an array of x values (strings)", (v) => strs(v)],
  [
    "aggregate",
    `one of ${AGGS.join(", ")}, or { ratio: [numerator field, denominator field] }`,
    (v) =>
      AGGS.includes(v) ||
      (isObj(v) &&
        Object.keys(v).length === 1 &&
        strs(v.ratio) &&
        v.ratio.length === 2 &&
        v.ratio[0] !== v.ratio[1]),
  ],
  ["legend", 'a boolean, "top", "bottom" or "right"', (v) => v === !!v || LEG.includes(v)],
  ["depth", "a positive integer", (v) => Number.isInteger(v) && v > 0],
  ["minAngle", "whole degrees from 0 to 360", (v) => Number.isInteger(v) && v >= 0 && v <= 360],
  ["sort", '"asc" or "desc"', (v) => v === "asc" || v === "desc"],
  [
    "xType",
    '"auto", "category" or "time"',
    (v) => v === "auto" || v === "category" || v === "time",
  ],
  ["limit", "a positive integer", (v) => Number.isInteger(v) && v > 0],
  ["select", 'true or "multi"', (v) => v === true || v === "multi"],
  ["stack", 'a boolean or "percent"', (v) => v === !!v || v === "percent"],
  [
    "was",
    "a field name, or { by: field, current?, previous? } for long data",
    (v) =>
      typeof v === "string" ||
      (isObj(v) &&
        typeof v.by === "string" &&
        only(v, w("by current previous")) &&
        [v.current, v.previous].every((c) => /^(st|n|u)/.test(typeof c)) &&
        (v.current === undefined || String(v.current) !== String(v.previous))),
  ],
  [
    "tooltip",
    "a boolean, or { fields: [field names] }",
    (v) => v === !!v || (isObj(v) && strs(v.fields, 1) && only(v, ["fields"])),
  ],
  ["xScale", '"log"', (v) => v === "log"],
  ["yScale", '"log"', (v) => v === "log"],
  [
    "annotate",
    `a non-empty array of distinct ${ANN.join(", ")} or { x, text (40 characters) }`,
    (v) =>
      Array.isArray(v) &&
      v.length > 0 &&
      new Set(v).size === v.length &&
      v.every((a) =>
        isObj(a)
          ? only(a, ["x", "text"]) &&
            (typeof a.x === "string" || Number.isFinite(a.x)) &&
            typeof a.text === "string" &&
            a.text.length > 0 &&
            a.text.length <= 40
          : ANN.includes(a as string),
      ),
  ],
  ["dash", "a non-empty array of series values (strings)", (v) => strs(v, 1)],
  [
    "forms",
    `a non-empty array of distinct forms: ${FORMS.join(", ")}`,
    (v) => strs(v, 1) && v.every((f) => FORMS.includes(f)) && new Set(v).size === v.length,
  ],
  // The object's keys are checked with the type (goals() below).
  [
    "colorBy",
    '"sign", { target: number } or a numeric field name',
    (v) => (typeof v === "string" && !!v) || isObj(v),
  ],
  [
    "titles",
    "an object of strings keyed by field",
    (v) => isObj(v) && Object.values(v).every((x) => typeof x === "string"),
  ],
];

export function validateSpec(spec: unknown): asserts spec is ChartSpec {
  if (!isObj(spec))
    fail(
      "spec-not-object",
      "spec",
      `spec must be a plain object, received ${ty(spec)}.`,
      `Received: ${show(spec)}`,
    );
  const s = spec as Record<string, unknown>;
  for (const k of Object.keys(s))
    if (!KEYS.includes(k))
      F(
        "unknown-option",
        k,
        `is not a known option.`,
        own(HINTS, k) ?? dym(k, KEYS),
        `Known options: ${KEYS.join(", ")}.`,
      );

  const type = s.type;
  if (type === undefined)
    F(
      "missing-field",
      "type",
      "is required but missing.",
      "Required fields: type, data, x, y.",
      EX,
    );
  const known = [...CORE_TYPES, ...types()];
  const str = typeof type === "string" ? type : undefined;
  if (str === undefined || !known.includes(str)) {
    const mod = str === undefined ? undefined : own(MODULE_OF, str);
    if (mod)
      F(
        "unknown-type",
        "type",
        `= "${type}" needs the "${mod}" module, which is not loaded.`,
        `Add: import "mayacharts/${mod}" (or load maya.${mod}.global.js).`,
      );
    F(
      "unknown-type",
      "type",
      `= ${show(type)} is not a chart type.`,
      `Valid types: ${known.join(", ")}.`,
      str === undefined ? "" : (own(ALIAS, str) ?? dym(str, [...known, ...Object.keys(MODULE_OF)])),
    );
  }
  const t = type as string;
  const isPath = PATH.includes(t);
  const need = isPath ? "path" : "x";
  const pth = (spec as Record<string, unknown>)["path"];
  if (Array.isArray(pth) && (t === "sankey" ? pth.length < 2 : t === "chord" && pth.length !== 2))
    F(
      "invalid-option",
      "path",
      `needs ${t === "sankey" ? "at least" : "exactly"} two levels for a ${t}.`,
    );
  const missing = (f: string) =>
    F(
      "missing-field",
      f,
      `is required but missing.`,
      `Required fields: type, data, ${need}, y.`,
      isPath
        ? `Example: { type: "${t}", data: [{ region: "N", state: "NY", sales: 10 }], path: ["region", "state"], y: "sales" }`
        : EX,
    );

  if (s.data === undefined) missing("data");
  if (!Array.isArray(s.data))
    F("data-not-array", "data", `must be an array of rows, received ${ty(s.data)}.`);
  const rows = s.data as Record<string, unknown>[];
  // Row checks run once per data array and the fields they read (memo): a re-render of the same
  // array skips them; a mutated array needs a new identity.
  memo(rows, "v1", () =>
    rows.forEach((r, i) => {
      if (!isObj(r))
        F(
          "row-not-object",
          `data[${i}]`,
          `must be an object, received ${ty(r)}.`,
          `Received: ${show(r)}`,
        );
    }),
  );
  if (
    s[need] === undefined &&
    t !== "kpi" &&
    t !== "gauge" &&
    t !== "beeswarm" &&
    !(t === "funnel" && Array.isArray(s.y)) &&
    !(need === "x" && PATHX.includes(t) && s.path !== undefined)
  )
    missing(need);
  if (s.y === undefined) missing("y");
  if (["dumbbell", "ridgeline", "marimekko", "weave"].includes(t) && s.series === undefined)
    missing("series");
  // parallel keeps its 0.x code; constellation has its own.
  if (t === "gauge" && Array.isArray(s.y))
    F(
      "invalid-option",
      "y",
      'on "gauge" must be one field name.',
      'A gauge shows one value. For several, use type: "kpi" with a y array.',
    );
  if ((t === "parallel" || t === "constellation") && !(Array.isArray(s.y) && s.y.length >= 2))
    fail(
      t === "parallel" ? "invalid-option" : "too-few-measures",
      "y",
      `spec.y on "${t}" needs an array of at least 2 measures.`,
    );

  for (const k in S) if (s[k] !== undefined && typeof s[k] !== S[k]) bad(k, s[k], `a ${S[k]}`);
  for (const [k, want, ok] of CHECKS) if (s[k] !== undefined && !ok(s[k])) bad(k, s[k], want);
  const { y, path, select, colors, colorBy, theme, text } = s;
  if (text !== undefined) {
    if (!isObj(text)) bad("text", text, "an object of strings");
    for (const [k, v] of Object.entries(text as object)) {
      if (!Object.hasOwn(TEXT, k))
        F("invalid-option", `text.${k}`, `is not a text key.`, dym(k, Object.keys(TEXT)));
      if (typeof v !== "string") bad(`text.${k}`, v, "a string");
    }
  }
  for (const k of ["yDomain", "xDomain"]) {
    const d = s[k] as number[] | undefined;
    const log = s[k[0] + "Scale"] === "log";
    if (
      d !== undefined &&
      !(
        Array.isArray(d) &&
        d.length === 2 &&
        fin(d[0], 1e300) && // ponytail: beyond this the span or a tick step overflows
        fin(d[1], 1e300) &&
        Math.abs(d[1]! - d[0]!) >= 1e-300 &&
        (k === "yDomain" ? d[0] !== d[1] : d[0]! < d[1]!) &&
        !(log && Math.min(d[0]!, d[1]!) <= 0)
      )
    )
      F(
        "invalid-domain",
        k,
        `= ${show(d)} is not a valid domain.`,
        `Expected [min, max]${k === "yDomain" ? " (or [max, min] to reverse)" : ""} of finite numbers${log ? " above 0 (log axis)" : ""}, e.g. [1, 100].`,
      );
  }

  if (s.rules !== undefined) {
    const v = s.rules;
    if (!Array.isArray(v) || v.length > 4) bad("rules", v, "an array of at most 4 rules");
    (v as unknown[]).forEach((e, i) => {
      const o = isObj(e) ? e : { y: e };
      // One kind per item: { y }, { slope, intercept? } (scatter), { x } or { band: [lo, hi] }.
      const k = ["slope", "x", "band"].find((q) => Object.hasOwn(o, q)) ?? "y";
      // ponytail: |y| <= 1e15 keeps the widened axis span finite.
      const b = o.band as unknown[];
      const okY =
        k === "band"
          ? Array.isArray(b) &&
            b.length === 2 &&
            fin(b[0], 1e15) &&
            fin(b[1], 1e15) &&
            b[0] !== b[1]
          : k === "x"
            ? typeof o.x === "string" || Number.isFinite(o.x)
            : o[k] === "mean" || fin(o[k], 1e15);
      const okL = o.label === undefined || (typeof o.label === "string" && o.label.length <= 40);
      if (
        !okY ||
        !okL ||
        (o.intercept !== undefined && !fin(o.intercept, 1e15)) ||
        !only(o, [k, "label", ...(k === "slope" ? ["intercept"] : [])])
      )
        bad(
          `rules[${i}]`,
          e,
          'a number, "mean", { y }, { x }, { band: [lo, hi] } or { slope, intercept? }, each with label? (40 characters)',
        );
      if (k === "slope" && t !== "scatter")
        F("option-unsupported", `rules[${i}].slope`, "works with: scatter.");
      if (
        s.yScale === "log" &&
        ((typeof o.y === "number" && o.y <= 0) ||
          (k === "band" && Math.min(...(b as number[])) <= 0))
      )
        F("invalid-option", `rules[${i}]`, "must be above 0 on a log axis.");
    });
  }

  let locale = "en-US";
  if (typeof s.locale === "string") {
    let ok = false;
    try {
      ok = Intl.NumberFormat.supportedLocalesOf(s.locale).length > 0;
    } catch {}
    if (!ok) bFmt("locale", `= ${show(s.locale)} is not a locale this runtime supports.`);
    locale = s.locale;
  }
  if (typeof s.currency === "string")
    try {
      new Intl.NumberFormat(locale, { style: "currency", currency: s.currency });
    } catch {
      bFmt("currency", `= ${show(s.currency)} is not an ISO 4217 currency code.`);
    }
  if (typeof s.format === "string") format("format", s.format, locale);
  else if (s.format !== undefined) {
    if (!isObj(s.format)) bad("format", s.format, "a preset or an object keyed by field");
    for (const [k, v] of Object.entries(s.format as object)) format(`format.${k}`, v, locale);
  }

  if (colors !== undefined) {
    const entries = Array.isArray(colors)
      ? colors.map((c, i) => [`[${i}]`, c])
      : isObj(colors)
        ? Object.entries(colors).map(([k, c]) => [`.${k}`, c])
        : null;
    if (!entries || !entries.every(([, c]) => typeof c === "string"))
      bad("colors", colors, "an array of colours, or an object of colours by series value");
    if (entries!.length > 8)
      F("invalid-option", "colors", `has ${entries!.length} colours; the palette has 8 slots.`);
    for (const [p, c] of entries!) css(`colors${p}`, c as string, false);
  }
  if (theme !== undefined) {
    if (!(isObj(theme) && Object.values(theme).every((c) => typeof c === "string")))
      bad("theme", theme, "an object of string values");
    for (const k of Object.keys(theme as object))
      if (!TOKENS.includes(k))
        F(
          "invalid-theme",
          `theme.${k}`,
          `is not a theme token.`,
          `Valid tokens: ${TOKENS.join(", ")}.`,
          dym(k, TOKENS),
        );
    for (const [k, v] of Object.entries(theme as Record<string, string>))
      css(`theme.${k}`, v, k === "font");
  }

  const NS = `is not supported with spec.type = "${t}".`;
  if (s.stack && t === "line")
    F("stack-unsupported", "stack", NS, 'Use type "area" (or "bar") to stack series.');
  for (const k in ONLY)
    if (s[k] !== undefined && s[k] !== false && !ONLY[k]!.includes(t))
      F("option-unsupported", k, NS, `spec.${k} works with: ${ONLY[k]!.join(", ")}.`);
  const cart = DRILLP.includes(t);
  const ratio = isObj(s.aggregate) ? (s.aggregate.ratio as string[]) : null;
  const CB = "cannot be combined with";
  const pairs: [unknown, string, string, string?][] = [
    [colorBy != null && s.series != null && t !== "dumbbell", "colorBy", `${CB} spec.series.`],
    [s.yDomain != null && Array.isArray(y), "yDomain", `${CB} a y array.`],
    [PATHX.includes(t) && path != null && s.x != null, "x", `${CB} spec.path.`],
    [
      t === "heatmap" && path != null && s.series != null,
      "series",
      `${CB} spec.path on "heatmap" (its levels are the rows).`,
    ],
    [
      ratio && !RATIO.includes(t),
      "aggregate",
      `= { ratio } ${NS}`,
      `A ratio works with: ${RATIO.join(", ")}.`,
    ],
    [
      ratio && (s.stack || s.was != null || Array.isArray(y)),
      "aggregate",
      `= { ratio } ${CB} spec.stack, spec.was or a y array.`,
    ],
    // ponytail: was ghosts are grouped bars only, not stacks or a measure toggle (NON-FEATURES).
    [s.was != null && (s.stack || Array.isArray(y)), "was", `${CB} spec.stack or a y array.`],
    [isObj(s.was) && s.was.by === s.x, "was", ".by cannot be spec.x (it names the period field)."],
    [
      isObj(s.tooltip) && !TIPF.includes(t),
      "tooltip",
      `.fields ${NS}`,
      `It works with: ${TIPF.join(", ")}.`,
    ],
    [s.dash != null && s.series === undefined, "dash", "needs spec.series."],
    [s.y2 != null && s.horizontal === true, "y2", `${CB} spec.horizontal.`],
    [
      s.xType === "time" && (s.sort != null || s.limit != null || s.horizontal === true),
      "xType",
      `= "time" ${CB} spec.sort, spec.limit or spec.horizontal.`,
    ],
    [
      (t === "kpi" || t === "gauge") && colorBy != null && !isObj(colorBy),
      "colorBy",
      `on "${t}" must be thresholds: { target?, warn?, better? }.`,
    ],
    [t === "gauge" && s.x != null, "x", NS, "A gauge shows one value."],
    [t === "funnel" && s.x != null && Array.isArray(y), "x", `${CB} a y array on "funnel".`],
    [t === "boxplot" && s.aggregate != null, "aggregate", NS],
    [cart && s.drill === true && path === undefined, "drill", `on "${t}" needs spec.path.`],
  ];
  for (const [hit, k, rest, detail] of pairs)
    if (hit)
      fail("option-unsupported", k, `spec.${k}${rest[0] === "." ? "" : " "}${rest}`, detail ?? "");
  if (isObj(colorBy)) {
    // Threshold keys win; otherwise a kpi with a y array may key thresholds by measure.
    const ks = Object.keys(colorBy);
    if (ks.length && !ks.some((k) => GOAL.includes(k)) && t === "kpi" && Array.isArray(y))
      for (const k of ks) {
        if (!y.includes(k))
          F("invalid-option", `colorBy.${k}`, `is not in spec.y: ${y.join(", ")}.`, dym(k, y));
        goal(t, `colorBy.${k}`, colorBy[k]);
      }
    else goal(t, "colorBy", colorBy);
  }

  // The row checks read most of the spec: key them by all of it but the rows.
  const vk = JSON.stringify({ ...s, data: 0 }, (_, v) => (typeof v === "bigint" ? String(v) : v));
  if (rows.length)
    memo(rows, `v2${vk}`, () => {
      // The key list is only built on the error path; the check itself stops at the first row.
      const has = (f: string) => rows.some((r) => Object.hasOwn(r, f));
      const unk = (p: string, rest: string, f: string) => {
        const found = [...new Set(rows.flatMap((r) => Object.keys(r)))];
        F(
          "unknown-field",
          p,
          rest + "is not a field in spec.data.",
          `Fields found: ${found.slice(0, 20).join(", ")}.`,
          dym(f, found),
        );
      };
      // Under a ratio aggregate y only names the measure: its rows need not hold it.
      const ys = ratio ? [] : typeof y === "string" ? [y] : (y as string[]);
      const arr = (o: string, a: string[]): [string, string][] =>
        a.map((f, i) => [`${o}[${i}]`, f]);
      const fields: [string, unknown][] = [
        ["x", s.x],
        ...(typeof y === "string" ? (ratio ? [] : [["y", y] as [string, string]]) : arr("y", ys)),
        ...arr("aggregate.ratio", ratio ?? []),
        ["series", s.series],
        ["y2", s.y2],
        ["was", s.was],
        ["was.by", isObj(s.was) ? s.was.by : undefined],
        ...arr("tooltip.fields", isObj(s.tooltip) ? (s.tooltip.fields as string[]) : []),
        ["size", s.size],
        ["name", s.name],
        ...arr("path", (path as string[] | undefined) ?? []),
        ["colorBy", colorBy === "sign" ? undefined : colorBy],
        ["frame", s.frame],
      ];
      for (const [p, f] of fields) if (typeof f === "string" && !has(f)) unk(p, `= ${show(f)} `, f);
      for (const opt of ["format", "titles"])
        if (isObj(s[opt]))
          for (const f of Object.keys(s[opt] as object))
            if (!has(f) && !(ratio && f === y)) unk(`${opt}.${f}`, "", f);
      if (colorBy === "sign" && has("sign"))
        F(
          "invalid-option",
          "colorBy",
          '= "sign" is ambiguous: spec.data has a field named "sign".',
        );

      // Callbacks build the data[i].field path themselves, only when a row fails.
      const scan = (f: string, g: (v: unknown, i: number) => void) =>
        rows.forEach((r, i) => g(r[f], i));
      const numeric = (f: string, code: ErrorCode, opt: string) =>
        scan(f, (v, i) => {
          // ponytail: |v| above 1e300 is rejected, scale and layout arithmetic overflows to NaN past it; NON-FEATURES.
          if (v == null || (typeof v === "number" && Math.abs(v) <= 1e300)) return;
          const p = `data[${i}].${f}`;
          fail(
            code,
            p,
            `spec.${p} is ${show(v)} (a ${ty(v)}), but spec.${opt} requires numbers.`,
            Number.isFinite(v)
              ? "Scale the value first, e.g. divide by 1e9."
              : typeof v === "string" && v.trim() && Number.isFinite(Number(v))
                ? `Convert first: data.map(r => ({ ...r, ${f}: Number(r.${f}) }))`
                : "Use null for a gap in the data.",
          );
        });
      for (const f of ys) numeric(f, "non-numeric-y", "y");
      for (const f of ratio ?? []) numeric(f, "non-numeric-field", "aggregate.ratio");
      if (typeof s.size === "string") numeric(s.size, "non-numeric-field", "size");
      for (const k of ["y2", "was"])
        if (typeof s[k] === "string") numeric(s[k] as string, "non-numeric-field", k);
      // Aggregated marks combine tooltip fields by spec.aggregate; scatter shows the row's value.
      if (isObj(s.tooltip) && t !== "scatter")
        for (const f of s.tooltip.fields as string[])
          numeric(f, "non-numeric-field", "tooltip.fields");
      // Values matched as strings, as frame values are: a typo would draw nothing silently.
      const among = (p: string, f: string, vals: unknown[], what: string) => {
        const seen = new Set(rows.map((r) => (r[f] == null ? txt(s, "blank") : String(r[f]))));
        vals.forEach((v, i) => {
          if (v === undefined || seen.has(String(v))) return;
          const pi = p === "dash" ? `${p}[${i}]` : p;
          F(
            "invalid-option",
            pi,
            `= ${show(v)} is not a value of spec.${what} in spec.data.`,
            `Values found: ${[...seen].slice(0, 20).join(", ")}.`,
            dym(String(v), [...seen]),
          );
        });
      };
      if (isObj(s.was)) {
        const b = s.was.by as string;
        among("was.current", b, [s.was.current], "was.by");
        among("was.previous", b, [s.was.previous], "was.by");
      }
      if (strs(s.dash) && typeof s.series === "string") among("dash", s.series, s.dash, "series");
      if (t === "dumbbell" && typeof s.series === "string") {
        const n = new Set(rows.map((r) => String(r[s.series as string]))).size;
        if (n !== 2)
          F("invalid-option", "series", `on "dumbbell" needs exactly 2 values, found ${n}.`);
      }
      if (t === "scatter" && typeof s.x === "string") numeric(s.x, "non-numeric-field", "x");
      if (s.xType === "time" && typeof s.x === "string")
        scan(s.x, (v, i) => {
          if (v == null || toTime(v) !== null) return;
          const p = `data[${i}].${s.x}`;
          F(
            "invalid-date",
            p,
            `is ${show(v)}, but spec.xType = "time" needs ISO 8601 dates or epoch ms.`,
          );
        });
      if (typeof colorBy === "string" && colorBy !== "sign")
        numeric(colorBy, "non-numeric-field", "colorBy");
      // Refuses values at or below 0 (below 0 when `zero` is allowed).
      const pos = (f: string, why: string, zero = false) =>
        scan(f, (v, i) => {
          if (typeof v === "number" && (v < 0 || (!zero && v === 0)))
            F(
              "non-positive-value",
              `data[${i}].${f}`,
              `is ${v}, but ${why} needs values ${zero ? "of 0 or more" : "above 0"}.`,
              `Filter first: data.filter(r => r.${f} ${zero ? ">=" : ">"} 0).`,
            );
        });
      if (s.yScale === "log") for (const f of ys) pos(f, 'yScale: "log"');
      if (s.xScale === "log" && typeof s.x === "string") pos(s.x, 'xScale: "log"');
      if (isPath || t === "funnel" || t === "ridgeline") for (const f of ys) pos(f, t, !isPath);
    });
  MODULES.get(t)?.check?.(spec as unknown as ChartSpec, fail);
}

export function validateOptions(opts: unknown): asserts opts is RenderOptions {
  if (opts === undefined) return;
  if (!isObj(opts))
    fail("invalid-option", "options", `options must be a plain object, received ${ty(opts)}.`);
  const o = opts as Record<string, unknown>;
  const unknown = (p: string, k: string, keys: string[]) =>
    fail(
      "unknown-option",
      `${p}.${k}`,
      `${p}.${k} is not a known render option.`,
      dym(k, keys),
      `Known options: ${keys.join(", ")}.`,
    );
  const keys = w("width height view selected nonce");
  for (const k of Object.keys(o)) if (!keys.includes(k)) unknown("options", k, keys);
  const inv = (p: string, v: unknown, want: string) =>
    fail("invalid-option", `options.${p}`, `options.${p} must be ${want}, received ${show(v)}.`);
  for (const k of ["width", "height"]) {
    const v = o[k];
    if (v !== undefined && !(typeof v === "number" && Number.isFinite(v) && v > 0))
      fail(
        "invalid-size",
        `options.${k}`,
        `options.${k} = ${show(v)} is not a valid size.`,
        "Size must be a finite number greater than 0.",
      );
  }
  const { view: v, selected: sel, nonce } = o;
  if (v !== undefined) {
    if (!isObj(v)) inv("view", v, "an object");
    const vk = w("measure drill window hidden sortBy frame form");
    for (const k of Object.keys(v as object)) if (!vk.includes(k)) unknown("options.view", k, vk);
    const { drill, window: win, hidden, sortBy } = v as Record<string, unknown>;
    if (
      sortBy !== undefined &&
      !(
        Array.isArray(sortBy) &&
        sortBy.length === 2 &&
        typeof sortBy[0] === "string" &&
        (sortBy[1] === "asc" || sortBy[1] === "desc")
      )
    )
      inv("view.sortBy", sortBy, '[field, "asc" | "desc"]');
    for (const k of ["measure", "frame", "form"]) {
      const n = (v as Record<string, unknown>)[k];
      if (n !== undefined && !(Number.isInteger(n) && (n as number) >= 0))
        inv("view." + k, n, "an index (integer >= 0)");
    }
    if (drill !== undefined && !strs(drill)) inv("view.drill", drill, "an array of strings");
    if (hidden !== undefined && !strs(hidden)) inv("view.hidden", hidden, "an array of strings");
    if (
      win !== undefined &&
      !(Array.isArray(win) && (win.length === 2 || win.length === 4) && win.every(Number.isFinite))
    )
      inv("view.window", win, "[i0, i1] or [x0, x1, y0, y1] of finite numbers");
  }
  if (
    sel !== undefined &&
    !(
      Array.isArray(sel) &&
      sel.every((e) => isObj(e) && Object.keys(e).every((k) => ["x", "series", "name"].includes(k)))
    )
  )
    inv("selected", sel, "an array of { x?, series?, name? }");
  if (nonce !== undefined && !(typeof nonce === "string" && /^[\w+/=-]+$/.test(nonce)))
    inv("nonce", nonce, "a base64 nonce string");
}

/**
 * Apply defaults plus the view's measure, frame and drill. Assumes `spec` passed validateSpec.
 * Frame keeps the rows of one `frame` value (view.frame, default the last). Drill keeps rows
 * whose path[i] equals drill[i], then advances: bar/line/area take the next level as x; path
 * types keep the remaining levels.
 */
export function resolve(spec: ChartSpec, view: View = {}): ResolvedSpec {
  const measures = typeof spec.y === "string" ? [spec.y] : [...spec.y];
  const measure = Math.min(view.measure ?? 0, measures.length - 1);
  const full = [...(spec.path ?? [])];
  // One drilled value per level but the last. A flow keeps the drilled node as its first column:
  // it draws full.slice(drilled - 1), so a click on the next column's node drills one step further.
  const flow = spec.type === "sankey" || spec.type === "chord";
  const drilled = spec.drill ? (view.drill ?? []).slice(0, Math.max(0, full.length - 1)) : [];
  const path = full.slice(flow ? Math.max(0, drilled.length - 1) : drilled.length);
  const f = spec.format;
  const F = spec.frame;
  const fv = F ? [...new Set(spec.data.flatMap((r) => (r[F] == null ? [] : [String(r[F])])))] : [];
  const fi = Math.min(view.frame ?? fv.length, fv.length - 1);
  const x = spec.x ?? (PATHX.includes(spec.type) ? (path[0] ?? "") : "");
  const ratio = typeof spec.aggregate === "object" ? spec.aggregate.ratio : null;
  // Path types: one palette slot per path value from all rows, so a name keeps its colour through drill.
  const slots = PATH.includes(spec.type)
    ? memo(spec.data, `slots${flow}${JSON.stringify(full)}`, () => {
        const m = new Map<string, number>();
        // A flow colours its second column (its first only in a branching tree): that one is numbered first.
        for (const f of flow ? [full[1]!, full[0]!, ...full.slice(2)] : full)
          for (const r of spec.data) m.has(String(r[f])) || m.set(String(r[f]), m.size);
        return m;
      })
    : new Map<string, number>();
  const frameRows = F ? spec.data.filter((r) => String(r[F]) === fv[fi]) : spec.data;
  // A null or missing category reads "(blank)" everywhere (it joins a real "(blank)" row). Time axes drop nulls.
  const bf =
    NOBLANK.includes(spec.type) || spec.xType === "time"
      ? []
      : [x, spec.series, ...(DRILLP.includes(spec.type) ? full : [])].filter(
          (k): k is string => !!k,
        );
  const rows = bf.length
    ? memo(frameRows, `b${bf}\0${txt(spec, "blank")}`, () =>
        frameRows.some((r) => bf.some((k) => r[k] == null))
          ? frameRows.map((r) =>
              bf.some((k) => r[k] == null)
                ? {
                    ...r,
                    ...Object.fromEntries(
                      bf.filter((k) => r[k] == null).map((k) => [k, txt(spec, "blank")]),
                    ),
                  }
                : r,
            )
          : frameRows,
      )
    : frameRows;
  // spec.was long form: pivot the periods into the wide form the marks read (shape.ts).
  const W = spec.was;
  const str = (v: unknown) => (v === undefined ? null : String(v));
  const wb =
    typeof W === "object" ? { by: W.by, current: str(W.current), previous: str(W.previous) } : null;
  const pv = wb
    ? pivotWas(
        rows,
        x,
        spec.series ?? null,
        measures[measure]!,
        wb,
        (spec.aggregate as Aggregate) ?? "sum",
      )
    : null;
  const data = pv ? pv.rows : rows;
  const forms = spec.forms ?? (spec.type === "units" ? (FORMS as ResolvedSpec["forms"]) : []);
  // Units: the group is the series (legend toggles, view.hidden and colors by group), unless colorBy colours the dots.
  // Heatmap: path levels are the rows (series); the drill advances them like x elsewhere.
  const series =
    spec.series ??
    (spec.type === "units" && !spec.colorBy
      ? spec.x!
      : spec.type === "heatmap" && path.length
        ? path[0]!
        : null);
  const entries = <T>(o: Readonly<Partial<Record<string, T>>> | undefined) =>
    Object.entries(o ?? {}).filter((e): e is [string, T] => e[1] !== undefined);
  const cb = spec.colorBy;
  const g = (o: Goal): ResolvedGoal => ({
    target: o.target ?? null,
    warn: o.warn ?? null,
    better: o.better ?? "higher",
  });
  // Threshold keys win; otherwise thresholds keyed by measure (kpi).
  const goals = new Map<string, ResolvedGoal>(
    typeof cb !== "object"
      ? []
      : GOAL.some((k) => Object.hasOwn(cb, k))
        ? measures.map((m) => [m, g(cb as Goal)])
        : entries<Goal>(cb as Record<string, Goal>).map(([k, v]) => [k, g(v)]),
  );
  const tip = spec.tooltip;
  // spec.rules split by kind, in object form, each with its label.
  const rule = <K extends string, T>(k: K, f: (e: Extract<Rule, Record<K, unknown>>) => T) =>
    (spec.rules ?? []).flatMap((e) => {
      const o = typeof e === "object" ? e : { y: e };
      return k in o
        ? [{ ...f(o as Extract<Rule, Record<K, unknown>>), label: o.label ?? null }]
        : [];
    });
  const titles = new Map([
    // A scatter names its axes by field: two numeric axes say nothing otherwise.
    ...(spec.type === "scatter" ? [spec.x!, measures[measure]!] : []).map((k): [string, string] => [
      k,
      k,
    ]),
    ...entries<string>(spec.titles),
  ]);
  const out: ResolvedSpec = {
    type: spec.type,
    data: drilled.length
      ? data.filter((r) => drilled.every((d, i) => String(r[full[i]!]) === d))
      : data,
    frame: F ? [F, fv, fi] : null,
    x,
    xType: spec.xType ?? "auto",
    y: measures[measure]!,
    measures,
    measure,
    series,
    y2: spec.y2 ?? null,
    was: typeof W === "string" ? W : (wb?.by ?? null),
    wasBy: wb,
    dash: new Set(spec.dash),
    tipFields: typeof tip === "object" ? [...tip.fields] : [],
    xScale: spec.xScale ?? "linear",
    yScale: spec.yScale ?? "linear",
    annotate: (spec.annotate ?? []).filter((a): a is Annotate => typeof a === "string"),
    notes: (spec.annotate ?? []).filter((a): a is AnnotateAt => typeof a === "object"),
    forms,
    form: Math.max(0, Math.min(view.form ?? 0, forms.length - 1)),
    path,
    drilled,
    // Colour slot of the drilled top-level name, as the hierarchy marks colour it.
    hue: drilled.length ? (slots.get(drilled[0]!) ?? null) : null,
    slots,
    depth: spec.depth ?? null,
    minAngle: spec.minAngle ?? null,
    window: view.window && view.window.length === 4 ? view.window : null,
    size: spec.size ?? null,
    name: spec.name ?? null,
    totals: [...(spec.totals ?? [])],
    stack: spec.stack ?? false,
    horizontal: spec.horizontal ?? false,
    aggregate: ratio ? "sum" : ((spec.aggregate as Aggregate | undefined) ?? "sum"),
    ratio: ratio ? [ratio[0], ratio[1]] : null,
    sort: spec.sort ?? null,
    sortBy: view.sortBy ?? null,
    limit: spec.limit ?? null,
    // stack "percent" shows shares: percent unless the spec formats the measure.
    format: new Map<string, FieldFormat>([
      ...measures.flatMap((m) => (spec.stack === "percent" ? [[m, "percent"] as const] : [])),
      ...(typeof f === "string" ? measures.map((m) => [m, f] as const) : entries<FieldFormat>(f)),
    ]),
    titles,
    labels: spec.labels ?? null,
    text: { ...spec.text },
    title: spec.title ?? null,
    subtitle: spec.subtitle ?? null,
    description: spec.description ?? null,
    legendAt: typeof spec.legend === "string" ? spec.legend : "top",
    legend:
      (spec.legend === undefined ? undefined : spec.legend !== false) ??
      (series !== null ||
        (spec.y2 !== undefined && spec.type === "bar") ||
        spec.type === "waffle" ||
        spec.type === "hexmap"),
    tooltip: tip !== false,
    drill: spec.drill ?? false,
    select: spec.select ?? false,
    zoom: spec.zoom ?? false,
    grid: spec.grid ?? true,
    xAxis: spec.xAxis ?? true,
    yAxis: spec.yAxis ?? true,
    locale: spec.locale ?? "en-US",
    currency: spec.currency ?? "USD",
    yDomain: spec.yDomain ?? null,
    xDomain: spec.xDomain ?? null,
    rules: rule("y", (e) => ({ y: e.y })),
    slopes: rule("slope", (e) => ({ k: e.slope, b: e.intercept ?? 0 })),
    xRules: rule("x", (e) => ({ x: e.x })),
    bands: rule("band", (e) => ({ lo: Math.min(...e.band), hi: Math.max(...e.band) })),
    table: spec.table ?? true,
    animate: spec.animate ?? true,
    colors: Array.isArray(spec.colors)
      ? spec.colors
      : spec.colors
        ? new Map(Object.entries(spec.colors))
        : null,
    colorBy: typeof cb === "object" ? (goals.get(measures[measure]!) ?? null) : (cb ?? null),
    goals,
    theme: spec.theme ?? {},
  };
  // The ghosts are titled by the previous period (format[by]) unless titles names `by`.
  if (wb && pv?.previous != null && !titles.has(wb.by))
    titles.set(wb.by, formatter(out, wb.by)(pv.previous));
  return out;
}
