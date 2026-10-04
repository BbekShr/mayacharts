/*
 * Validation: hand-written guards, zero deps. Errors only (no warnings, no logging).
 *
 * Message format (every error):
 *   mayacharts: <one-line headline naming the exact spec path>
 *     <detail lines, 2-space indent>
 *     -> https://bbekshr.github.io/mayacharts/errors.html#<code>
 *
 * Check order (first failure wins):
 *   object -> unknown-option (HINTS before "did you mean") -> type present -> unknown-type
 *   (core ∪ registered; aliases; "import mayacharts/<module>" for unloaded module types)
 *   -> data / rows -> per-type required fields -> option types and values -> ONLY table and
 *   pair rules (option-unsupported) -> field existence -> numeric checks -> Mark.check().
 *
 * Error catalogue (code: when -> what the detail must say):
 *   spec-not-object     spec is not a plain object          -> typeof received
 *   missing-field       type/data/x|path/y absent           -> required fields for the type + example
 *   unknown-type        type not core or registered         -> valid types, alias hint or "Did you mean",
 *                                                              or the module import for unloaded types
 *   data-not-array      data is not an array                -> typeof
 *   row-not-object      data[i] is not a plain object       -> index and typeof
 *   unknown-field       a field-valued option names no field -> fields found (first 20), "Did you mean",
 *                                                              what the option is for
 *   non-numeric-y       data[i][y[k]] not a finite number   -> null/undefined allowed (gaps); numeric
 *                                                              strings get the coercion hint
 *   non-numeric-field   size / scatter x / colorBy field    -> same as non-numeric-y
 *   non-positive-value  treemap/sunburst/sankey y <= 0      -> filter hint
 *   unknown-option      top-level key not in ChartSpec      -> HINTS replacement, else "Did you mean"
 *   invalid-option      wrong type/value for a known option -> expected shape, received value, HINTS
 *   option-unsupported  option not valid for this type/pair -> which types (or which option) it works with
 *   stack-unsupported   stack: true with type "line"        -> suggest type "area"
 *   invalid-domain      yDomain/xDomain not [lo, hi], lo<hi -> received
 *   invalid-format      unknown preset, bad Intl options, unsupported locale, bad currency
 *   invalid-theme       unknown theme token                 -> tokens + "Did you mean"
 *   unsafe-css-value    colors/theme value outside the CSS allowlist
 *   invalid-size        RenderOptions width/height not finite > 0
 *   unknown-state       hexmap x names no US state (thrown by geo's Mark.check)
 *   too-many-marks      more than MAX_MARKS marks (thrown by render) -> suggest limit / aggregate
 *
 * "Did you mean": pick the candidate with the smallest score (|len diff| + count of chars
 * not shared, case-insensitive; ties to the longest shared prefix); suggest only if score <= 3.
 * Every lookup keyed by user input goes through Object.hasOwn or Array#includes.
 */
import { CORE_TYPES, MODULE_OF, MODULES, types } from "./registry.ts";
import { TEXT } from "./strings.ts";
import type {
  ChartSpec,
  ErrorCode,
  FieldFormat,
  RenderOptions,
  ResolvedSpec,
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
export const MAX_MARKS = 5000;

const S: Record<string, "string" | "boolean"> = {
  $schema: "string",
  x: "string",
  series: "string",
  size: "string",
  name: "string",
  title: "string",
  description: "string",
  locale: "string",
  currency: "string",
  stack: "boolean",
  horizontal: "boolean",
  labels: "boolean",
  legend: "boolean",
  tooltip: "boolean",
  drill: "boolean",
  zoom: "boolean",
  grid: "boolean",
  xAxis: "boolean",
  yAxis: "boolean",
  table: "boolean",
  animate: "boolean",
};
/** Every spec key (schema.json is tested against this). */
export const KEYS = [
  "type",
  "data",
  "y",
  "path",
  "totals",
  "aggregate",
  "sort",
  "limit",
  "format",
  "titles",
  "text",
  "yDomain",
  "xDomain",
  "select",
  "colors",
  "colorBy",
  "theme",
  ...Object.keys(S),
];
const CART = ["bar", "line", "area"];
const PATH = ["treemap", "sunburst", "sankey"];
/** Option -> types that accept it (option-unsupported otherwise). */
export const ONLY: Readonly<Record<string, readonly string[]>> = {
  horizontal: ["bar"],
  size: ["scatter"],
  name: ["scatter"],
  path: [...CART, ...PATH],
  totals: ["waterfall"],
  series: [...CART, "heatmap"],
  sort: [...CART, "heatmap"],
  limit: [...CART, "heatmap"],
  stack: ["bar", "area"],
  colorBy: ["bar", "waterfall", "scatter", "treemap", "sunburst", "hexmap"],
  xDomain: ["scatter"],
  drill: [...CART, ...PATH],
  select: [...CART, "waterfall", "scatter", "heatmap", "treemap", "sunburst", "hexmap"],
  zoom: ["line", "area", "scatter"],
};
const AGGS = ["sum", "mean", "count", "min", "max"];
const PRESETS = [
  "auto",
  "integer",
  "decimal",
  "compact",
  "percent",
  "currency",
  "date",
  "month",
  "year",
  "time",
  "datetime",
];
const DATE = [
  "dateStyle",
  "timeStyle",
  "weekday",
  "era",
  "year",
  "month",
  "day",
  "dayPeriod",
  "hour",
  "minute",
  "second",
  "fractionalSecondDigits",
  "timeZoneName",
  "timeZone",
  "hour12",
  "hourCycle",
  "calendar",
];
/** Format options holding any date key are Intl.DateTimeFormat options. */
export const isDateOpts = (o: object): boolean => DATE.some((k) => Object.hasOwn(o, k));
const TOKENS = [
  "font",
  "fontSize",
  "fg",
  "fgMuted",
  "grid",
  "bg",
  "accent",
  "radius",
  "tooltipBg",
  "tooltipFg",
  "focus",
  "good",
  "bad",
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => "series" + n),
];
const USE: Record<string, string> = {
  x: "the category axis",
  y: "the plotted numbers",
  series: "splitting rows into series",
  size: "bubble area",
  name: "point identity",
  path: "the hierarchy levels",
  colorBy: "colouring marks by value",
  format: "formatting that field",
  titles: "naming that field",
};
/** Replacement text for foreign or retired option names, checked before "did you mean". */
const HINTS: Record<string, string> = {
  label: 'Use titles: { <field>: "Name" } for display names, or labels: true for values on marks.',
  xLabel:
    'Use titles: { <x field>: "Name" }. titles is keyed by field and also names tooltips and table headers.',
  yLabel:
    'Use titles: { <y field>: "Name" }. titles is keyed by field and also names tooltips, legend and table headers.',
  yFormat: 'Use format: "compact" (applies to every y), or format: { <field>: "currency" }.',
  dataKey: 'Use y: "<field>" for values and x: "<field>" for categories.',
  indexAxis: "Use horizontal: true to put categories on the left axis.",
  orientation: "Use horizontal: true to put categories on the left axis.",
  width: "Size comes from the element's CSS box, or render(spec, { width, height }).",
  height: "Size comes from the element's CSS box, or render(spec, { width, height }).",
  color: 'Use colors: [...] for the palette, or colorBy: "sign" | { target: n } | "<field>".',
  groupBy: 'Use series: "<field>".',
  formatter: "Functions are not supported (the spec is JSON). Use format presets or Intl options.",
  "size:number":
    "spec.size names a field for bubble area. For chart size use CSS, or render(spec, { width, height }).",
  "select:boolean": 'Use select: true or "multi"; omit it to disable selection.',
};
/** Foreign type names -> what to write instead. */
const ALIAS: Record<string, string> = {
  column: 'Use type: "bar".',
  barh: 'Use type: "bar" with horizontal: true.',
  bubble: 'Use type: "scatter" with size: "<field>".',
  choropleth: 'Use type: "hexmap" (import "mayacharts/geo").',
  map: 'Use type: "hexmap" (import "mayacharts/geo").',
  pie: 'Pie and donut charts are not supported: use "bar" or "treemap" to compare parts.',
  donut: 'Pie and donut charts are not supported: use "bar" or "treemap" to compare parts.',
};
const FN = [
  "rgb",
  "rgba",
  "hsl",
  "hsla",
  "oklch",
  "oklab",
  "lab",
  "lch",
  "color",
  "color-mix",
  "light-dark",
  "var",
  "calc",
];
const FAM = String.raw`\s*(?:"[\w\s.\-]*"|'[\w\s.\-]*'|[\w\-]+(?:\s+[\w\-]+)*)\s*`;
const FONT = new RegExp(`^${FAM}(?:,${FAM})*$`);

const own = <T>(o: Readonly<Record<string, T>>, k: string): T | undefined =>
  Object.hasOwn(o, k) ? o[k] : undefined;
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const strs = (v: unknown, min = 0): v is string[] =>
  Array.isArray(v) && v.length >= min && v.every((c) => typeof c === "string");
const ty = (v: unknown) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);
const show = (v: unknown) => {
  const t = typeof v === "string" || isObj(v) || Array.isArray(v) ? JSON.stringify(v) : String(v);
  return t.length > 60 ? t.slice(0, 59) + "…" : t;
};
const list = (a: readonly string[]) => a.slice(0, 20).join(", ");

export const dym = (s: string, c: readonly string[]): string => {
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

export const fail = (
  code: ErrorCode,
  path: string,
  headline: string,
  ...details: string[]
): never => {
  const lines = [...details, `-> https://bbekshr.github.io/mayacharts/errors.html#${code}`];
  throw new MayaSpecError(
    code,
    path,
    `mayacharts: ${headline}\n${lines
      .filter(Boolean)
      .map((d) => "  " + d)
      .join("\n")}`,
  );
};

const bad = (k: string, v: unknown, want: string) =>
  fail(
    "invalid-option",
    k,
    `spec.${k} must be ${want}, received ${show(v)}.`,
    own(HINTS, `${k}:${ty(v)}`) ?? "",
  );

const css = (path: string, v: string, font: boolean) => {
  const ok = font
    ? FONT.test(v)
    : /^[#\w\s.,%()+\-\/]*$/.test(v) &&
      [...v.matchAll(/([\w-]*)\s*\(/g)].every((m) => FN.includes(m[1]!.toLowerCase()));
  if (!v || !ok)
    fail(
      "unsafe-css-value",
      path,
      `spec.${path} = ${show(v)} is not a safe CSS value.`,
      `Allowed: colours, lengths, numbers and ${FN.join("() ")}(); fonts are family names.`,
      "Not allowed: url(), image-set(), other functions, ; { } < > \\ and (outside fonts) quotes.",
    );
};

const domain = (k: string, d: unknown) => {
  if (
    d !== undefined &&
    !(
      Array.isArray(d) &&
      d.length === 2 &&
      Number.isFinite(d[0]) &&
      Number.isFinite(d[1]) &&
      d[0] < d[1]
    )
  )
    fail(
      "invalid-domain",
      k,
      `spec.${k} = ${show(d)} is not a valid domain.`,
      "Expected [min, max] with finite numbers and min < max, e.g. [0, 100].",
    );
};

const format = (path: string, v: unknown, locale: string) => {
  if (typeof v === "string") {
    if (!PRESETS.includes(v))
      fail(
        "invalid-format",
        path,
        `spec.${path} = ${show(v)} is not a format preset.`,
        `Presets: ${PRESETS.join(", ")}. Or per field: { <field>: preset or Intl options }.`,
        dym(v, PRESETS),
      );
    return;
  }
  if (!isObj(v))
    fail(
      "invalid-format",
      path,
      `spec.${path} must be a preset or Intl options, received ${show(v)}.`,
    );
  const { prefix, suffix, ...o } = v as Record<string, unknown>;
  for (const [k, a] of [
    ["prefix", prefix],
    ["suffix", suffix],
  ] as const)
    if (a !== undefined && typeof a !== "string")
      fail(
        "invalid-format",
        `${path}.${k}`,
        `spec.${path}.${k} must be a string, received ${show(a)}.`,
      );
  try {
    if (isDateOpts(o)) new Intl.DateTimeFormat(locale, o);
    else new Intl.NumberFormat(locale, o);
  } catch (e) {
    fail(
      "invalid-format",
      path,
      `spec.${path} = ${show(v)} is not valid ${isDateOpts(o) ? "Intl.DateTimeFormat" : "Intl.NumberFormat"} options.`,
      e instanceof Error ? e.message : String(e),
    );
  }
};

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
      fail(
        "unknown-option",
        k,
        `spec.${k} is not a known option.`,
        own(HINTS, k) ?? dym(k, KEYS),
        `Known options: ${KEYS.join(", ")}.`,
      );

  const type = s.type;
  if (type === undefined)
    fail(
      "missing-field",
      "type",
      "spec.type is required but missing.",
      "Required fields: type, data, x, y.",
      'Example: { type: "bar", data: [{ month: "Jan", revenue: 10 }], x: "month", y: "revenue" }',
    );
  const known = [...CORE_TYPES, ...types()];
  if (typeof type !== "string" || !known.includes(type)) {
    const mod = typeof type === "string" ? own(MODULE_OF, type) : undefined;
    if (mod)
      fail(
        "unknown-type",
        "type",
        `spec.type = "${type}" needs the "${mod}" module, which is not loaded.`,
        `Add: import "mayacharts/${mod}"`,
      );
    fail(
      "unknown-type",
      "type",
      `spec.type = ${show(type)} is not a chart type.`,
      `Valid types: ${known.join(", ")}.`,
      typeof type === "string"
        ? (own(ALIAS, type) ?? dym(type, [...known, ...Object.keys(MODULE_OF)]))
        : "",
    );
  }
  const t = type as string;
  const isPath = PATH.includes(t);
  const need = isPath ? "path" : "x";
  const missing = (f: string) =>
    fail(
      "missing-field",
      f,
      `spec.${f} is required but missing.`,
      `Required fields: type, data, ${need}, y.`,
      isPath
        ? `Example: { type: "${t}", data: [{ region: "N", state: "NY", sales: 10 }], path: ["region", "state"], y: "sales" }`
        : 'Example: { type: "bar", data: [{ month: "Jan", revenue: 10 }], x: "month", y: "revenue" }',
    );

  if (s.data === undefined) missing("data");
  if (!Array.isArray(s.data))
    fail("data-not-array", "data", `spec.data must be an array of rows, received ${ty(s.data)}.`);
  const rows = s.data as Record<string, unknown>[];
  rows.forEach((r, i) => {
    if (!isObj(r))
      fail(
        "row-not-object",
        `data[${i}]`,
        `spec.data[${i}] must be an object, received ${ty(r)}.`,
        `Received: ${show(r)}`,
      );
  });
  if (s[need] === undefined && !(need === "x" && CART.includes(t) && s.path !== undefined))
    missing(need);
  if (s.y === undefined) missing("y");

  // Option types and values.
  for (const k in S) {
    const v = s[k];
    if (v !== undefined && typeof v !== S[k]) bad(k, v, `a ${S[k]}`);
  }
  const { y, path, totals, aggregate, sort, limit, select, colors, colorBy, theme, titles, text } =
    s;
  if (!(typeof y === "string" || strs(y, 1)))
    bad("y", y, "a field name or a non-empty array of field names");
  if (path !== undefined && !strs(path, 1)) bad("path", path, "a non-empty array of field names");
  if (totals !== undefined && !strs(totals))
    bad("totals", totals, "an array of x values (strings)");
  if (aggregate !== undefined && !AGGS.includes(aggregate as string))
    bad("aggregate", aggregate, `one of ${AGGS.join(", ")}`);
  if (sort !== undefined && sort !== "asc" && sort !== "desc") bad("sort", sort, '"asc" or "desc"');
  if (limit !== undefined && !(Number.isInteger(limit) && (limit as number) > 0))
    bad("limit", limit, "a positive integer");
  if (select !== undefined && select !== true && select !== "multi")
    bad("select", select, 'true or "multi"');
  if (
    colorBy !== undefined &&
    !(typeof colorBy === "string" && colorBy) &&
    !(isObj(colorBy) && Object.keys(colorBy).join() === "target" && Number.isFinite(colorBy.target))
  )
    bad("colorBy", colorBy, '"sign", { target: number } or a numeric field name');
  if (
    titles !== undefined &&
    !(isObj(titles) && Object.values(titles).every((v) => typeof v === "string"))
  )
    bad("titles", titles, "an object of strings keyed by field");
  if (text !== undefined) {
    if (!isObj(text)) bad("text", text, "an object of strings");
    for (const [k, v] of Object.entries(text as object)) {
      if (!Object.hasOwn(TEXT, k))
        fail(
          "invalid-option",
          `text.${k}`,
          `spec.text.${k} is not a text key.`,
          dym(k, Object.keys(TEXT)),
          `Text keys: ${Object.keys(TEXT).join(", ")}.`,
        );
      if (typeof v !== "string") bad(`text.${k}`, v, "a string");
    }
  }
  domain("yDomain", s.yDomain);
  domain("xDomain", s.xDomain);

  let locale = "en-US";
  if (typeof s.locale === "string") {
    let ok = false;
    try {
      ok = Intl.NumberFormat.supportedLocalesOf(s.locale).length > 0;
    } catch {}
    if (!ok)
      fail(
        "invalid-format",
        "locale",
        `spec.locale = ${show(s.locale)} is not a locale this runtime supports.`,
        'Use a BCP 47 tag such as "de-DE". Node built with small ICU supports English only.',
      );
    locale = s.locale;
  }
  if (typeof s.currency === "string")
    try {
      new Intl.NumberFormat(locale, { style: "currency", currency: s.currency });
    } catch {
      fail(
        "invalid-format",
        "currency",
        `spec.currency = ${show(s.currency)} is not an ISO 4217 currency code.`,
        'Use a three-letter code such as "USD" or "EUR".',
      );
    }
  if (typeof s.format === "string") format("format", s.format, locale);
  else if (s.format !== undefined) {
    if (!isObj(s.format)) bad("format", s.format, "a preset or an object keyed by field");
    for (const [k, v] of Object.entries(s.format as object)) format(`format.${k}`, v, locale);
  }

  if (colors !== undefined) {
    const arr = Array.isArray(colors);
    const entries = arr
      ? colors.map((c, i) => [`[${i}]`, c])
      : isObj(colors)
        ? Object.entries(colors).map(([k, c]) => [`.${k}`, c])
        : null;
    if (!entries || !entries.every(([, c]) => typeof c === "string"))
      bad("colors", colors, "an array of colours, or an object of colours by series value");
    if (entries!.length > 8)
      fail(
        "invalid-option",
        "colors",
        `spec.colors has ${entries!.length} colours; the palette has 8 slots.`,
        "Pass at most 8. Series 9 and later reuse slots in order.",
      );
    for (const [p, c] of entries!) css(`colors${p}`, c as string, false);
  }
  if (theme !== undefined) {
    if (!(isObj(theme) && Object.values(theme).every((c) => typeof c === "string")))
      bad("theme", theme, "an object of string values");
    for (const k of Object.keys(theme as object))
      if (!TOKENS.includes(k))
        fail(
          "invalid-theme",
          `theme.${k}`,
          `spec.theme.${k} is not a theme token.`,
          `Valid tokens: ${TOKENS.join(", ")}.`,
          dym(k, TOKENS),
        );
    for (const [k, v] of Object.entries(theme as Record<string, string>))
      css(`theme.${k}`, v, k === "font");
  }

  // Type support and pair rules.
  if (s.stack === true && t === "line")
    fail(
      "stack-unsupported",
      "stack",
      'spec.stack is not supported with spec.type = "line".',
      'Use type "area" (or "bar") to stack series.',
    );
  for (const k in ONLY)
    if (s[k] !== undefined && s[k] !== false && !ONLY[k]!.includes(t))
      fail(
        "option-unsupported",
        k,
        `spec.${k} is not supported with spec.type = "${t}".`,
        `spec.${k} works with: ${ONLY[k]!.join(", ")}.`,
      );
  const pair = (k: string, headline: string, detail: string) =>
    fail("option-unsupported", k, headline, detail);
  if (colorBy !== undefined && s.series !== undefined)
    pair(
      "colorBy",
      "spec.colorBy cannot be combined with spec.series.",
      "Series already set the colours; remove one of them.",
    );
  if (s.yDomain !== undefined && Array.isArray(y))
    pair(
      "yDomain",
      "spec.yDomain cannot be combined with a y array.",
      "Each measure needs its own domain; use a single y or remove yDomain.",
    );
  if (s.drill === true && select !== undefined)
    pair(
      "select",
      "spec.select cannot be combined with spec.drill.",
      "A click either drills or selects; choose one.",
    );
  if (CART.includes(t) && path !== undefined && s.x !== undefined)
    pair(
      "x",
      "spec.x cannot be combined with spec.path.",
      "With path, the current drill level is the category; remove x.",
    );
  if (CART.includes(t) && s.drill === true && path === undefined)
    pair(
      "drill",
      `spec.drill on "${t}" needs spec.path.`,
      'Replace x with path: ["region", "state"] (outer to inner).',
    );

  if (rows.length) {
    // Field existence.
    const found = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    const ys = typeof y === "string" ? [y] : (y as string[]);
    const fields: [path: string, field: unknown][] = [
      ["x", s.x],
      ...ys.map((f, i): [string, string] => [typeof y === "string" ? "y" : `y[${i}]`, f]),
      ["series", s.series],
      ["size", s.size],
      ["name", s.name],
      ...((path as string[] | undefined) ?? []).map((f, i): [string, string] => [`path[${i}]`, f]),
      ["colorBy", colorBy === "sign" ? undefined : colorBy],
    ];
    for (const [p, f] of fields) {
      if (typeof f !== "string" || found.includes(f)) continue;
      const opt = p.replace(/\[.*/, "");
      fail(
        "unknown-field",
        p,
        `spec.${p} = ${show(f)} is not a field in spec.data.`,
        `Fields found: ${list(found)}.`,
        dym(f, found),
        `spec.${opt} names the field used for ${USE[opt]}.`,
      );
    }
    for (const opt of ["format", "titles"])
      if (isObj(s[opt]))
        for (const f of Object.keys(s[opt] as object))
          if (!found.includes(f))
            fail(
              "unknown-field",
              `${opt}.${f}`,
              `spec.${opt} key "${f}" is not a field in spec.data.`,
              `Fields found: ${list(found)}.`,
              dym(f, found),
              `spec.${opt} keys name fields, for ${USE[opt]}.`,
            );
    if (colorBy === "sign" && found.includes("sign"))
      fail(
        "invalid-option",
        "colorBy",
        'spec.colorBy = "sign" colours by the sign of y, but spec.data also has a field named "sign".',
        "Rename that field (e.g. data.map(({ sign, ...r }) => ({ ...r, signValue: sign }))) to colour by it.",
      );

    // Numeric checks.
    const numeric = (f: string, code: ErrorCode, opt: string) =>
      rows.forEach((r, i) => {
        const v = r[f];
        if (v == null || (typeof v === "number" && Number.isFinite(v))) return;
        fail(
          code,
          `data[${i}].${f}`,
          `spec.data[${i}].${f} is ${show(v)} (a ${ty(v)}), but spec.${opt} requires numbers.`,
          typeof v === "string" && v.trim() && Number.isFinite(Number(v))
            ? `Convert first: data.map(r => ({ ...r, ${f}: Number(r.${f}) }))`
            : "Use null for a gap in the data.",
        );
      });
    for (const f of ys) numeric(f, "non-numeric-y", "y");
    if (typeof s.size === "string") numeric(s.size, "non-numeric-field", "size");
    if (t === "scatter" && typeof s.x === "string") numeric(s.x, "non-numeric-field", "x");
    if (typeof colorBy === "string" && colorBy !== "sign")
      numeric(colorBy, "non-numeric-field", "colorBy");
    if (isPath)
      for (const f of ys)
        rows.forEach((r, i) => {
          const v = r[f];
          if (typeof v === "number" && v <= 0)
            fail(
              "non-positive-value",
              `data[${i}].${f}`,
              `spec.data[${i}].${f} is ${v}, but ${t} sizes must be positive.`,
              `Filter first: data.filter(r => r.${f} > 0), or chart the signed values with "bar".`,
            );
        });
  }
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
  const keys = ["width", "height", "view", "selected", "nonce"];
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
    const vk = ["measure", "drill", "window", "hidden"];
    for (const k of Object.keys(v as object)) if (!vk.includes(k)) unknown("options.view", k, vk);
    const { measure, drill, window: w, hidden } = v as Record<string, unknown>;
    if (measure !== undefined && !(Number.isInteger(measure) && (measure as number) >= 0))
      inv("view.measure", measure, "an index (integer >= 0)");
    if (drill !== undefined && !strs(drill)) inv("view.drill", drill, "an array of strings");
    if (hidden !== undefined && !strs(hidden)) inv("view.hidden", hidden, "an array of strings");
    if (
      w !== undefined &&
      !(Array.isArray(w) && (w.length === 2 || w.length === 4) && w.every(Number.isFinite))
    )
      inv("view.window", w, "[i0, i1] or [x0, x1, y0, y1] of finite numbers");
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
 * Apply defaults plus the view's measure and drill. Assumes `spec` passed validateSpec.
 * Drill keeps rows whose path[i] equals drill[i], then advances: bar/line/area take the next
 * level as x; path types keep the remaining levels.
 */
export function resolve(spec: ChartSpec, view: View = {}): ResolvedSpec {
  const measures = typeof spec.y === "string" ? [spec.y] : [...spec.y];
  const measure = Math.min(view.measure ?? 0, measures.length - 1);
  const full = [...(spec.path ?? [])];
  const drilled = spec.drill ? (view.drill ?? []).slice(0, Math.max(0, full.length - 1)) : [];
  const path = full.slice(drilled.length);
  const f = spec.format;
  const entries = <T>(o: Readonly<Partial<Record<string, T>>> | undefined) =>
    Object.entries(o ?? {}).filter((e): e is [string, T] => e[1] !== undefined);
  return {
    type: spec.type,
    data: drilled.length
      ? spec.data.filter((r) => drilled.every((d, i) => String(r[full[i]!]) === d))
      : spec.data,
    x: spec.x ?? (CART.includes(spec.type) ? (path[0] ?? "") : ""),
    y: measures[measure]!,
    measures,
    measure,
    series: spec.series ?? null,
    path,
    drilled,
    size: spec.size ?? null,
    name: spec.name ?? null,
    totals: [...(spec.totals ?? [])],
    stack: spec.stack ?? false,
    horizontal: spec.horizontal ?? false,
    aggregate: spec.aggregate ?? "sum",
    sort: spec.sort ?? null,
    limit: spec.limit ?? null,
    format: new Map(typeof f === "string" ? measures.map((m) => [m, f]) : entries<FieldFormat>(f)),
    titles: new Map(entries<string>(spec.titles)),
    labels: spec.labels ?? null,
    text: { ...spec.text },
    title: spec.title ?? null,
    description: spec.description ?? null,
    legend: spec.legend ?? spec.series !== undefined,
    tooltip: spec.tooltip ?? true,
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
    table: spec.table ?? true,
    animate: spec.animate ?? true,
    colors: Array.isArray(spec.colors)
      ? spec.colors
      : spec.colors
        ? new Map(Object.entries(spec.colors))
        : null,
    colorBy: spec.colorBy ?? null,
    theme: spec.theme ?? {},
  };
}
