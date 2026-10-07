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
 *   non-numeric-y       data[i][y] not a finite number (null allowed; numeric strings get a coercion hint)
 *   non-numeric-field   size / scatter x / colorBy field, as above
 *   non-positive-value  treemap/sunburst/sankey y <= 0, funnel y < 0
 *   unknown-option      top-level key not in ChartSpec (HINTS, else "did you mean")
 *   invalid-option      wrong type/value for a known option
 *   option-unsupported  option not valid for this type or pair
 *   stack-unsupported   stack (true or "percent") with type "line"
 *   invalid-domain      yDomain/xDomain not [lo, hi] with lo < hi
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
import { TEXT } from "./strings.ts";
import { toTime } from "./ticks.ts";
import type {
  ChartSpec,
  ErrorCode,
  FieldFormat,
  RenderOptions,
  ResolvedSpec,
  Row,
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
/** Most distinct `frame` values (every render shapes every frame). */
export const MAX_FRAMES = 200;
// ponytail: fixed downsampling target; a time axis keeps at most this many categories (LTTB).
export const MAX_POINTS = 1000;

const w = (s: string) => s.split(" ");
const S: Record<string, "string" | "boolean"> = Object.fromEntries([
  ...w("$schema x y2 was series size name title description locale currency frame").map((k) => [
    k,
    "string",
  ]),
  ...w(
    "horizontal labels legend endLabels tooltip drill drillOut zoom grid xAxis yAxis table animate",
  ).map((k) => [k, "boolean"]),
]);
/** Every spec key (schema.json is tested against this). */
export const KEYS = [
  ...w(
    "type data y path totals aggregate sort limit format titles text yDomain xDomain rules select xType stack forms",
  ),
  ...w("colors colorBy theme"),
  ...Object.keys(S),
];
const CART = ["bar", "line", "area"];
/** Types whose x can come from path with drill (the current level is the category). */
const PATHX = [...CART, "dumbbell"];
const PATH = ["treemap", "sunburst", "sankey", "chord"];
/** y arrays on these types are shown together (axes, columns), never a measure toggle. */
export const ALL_Y = ["parallel", "table", "funnel", "constellation"];
/** Option -> types that accept it (option-unsupported otherwise). */
const CPA = "bar,line,area";
const PTH = "treemap,sunburst,sankey,chord";
// Chord has two levels, so a drill would never go anywhere: drill needs treemap, sunburst or sankey.
const DRL = "treemap,sunburst,sankey";
export const ONLY: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  w(
    `horizontal:bar,dumbbell y2:bar,orbit was:bar forms:units size:scatter,constellation name:scatter,beeswarm,boxplot,units path:${CPA},dumbbell,${PTH} totals:waterfall series:${CPA},scatter,heatmap,dumbbell,ridgeline,beeswarm,parallel,marimekko,radial,boxplot,weave xType:${CPA} sort:${CPA},heatmap,dumbbell,table,radial,waffle,orbit limit:${CPA},heatmap,dumbbell,table,waffle,radial,orbit stack:bar,area colorBy:${CPA},waterfall,scatter,dumbbell,kpi,treemap,sunburst,hexmap,units,orbit,constellation xDomain:scatter drill:${CPA},dumbbell,${DRL} drillOut:${CPA},dumbbell,${DRL} select:${CPA},waterfall,scatter,heatmap,dumbbell,beeswarm,parallel,table,marimekko,waffle,radial,treemap,sunburst,hexmap,boxplot,funnel,weave,units,orbit,constellation zoom:line,area,scatter endLabels:line,area rules:${CPA},scatter frame:${CPA},scatter,dumbbell`,
  )
    .map((e) => e.split(":"))
    .map(([k, v]) => [k, v!.split(",")]),
);
const AGGS = w("sum mean count min max");
const FORMS = w("waffle bars swarm");
const PRESETS = w("auto integer decimal compact percent currency date month year time datetime");
/** A format template: text, one `{value}` or `{value:preset}`, text. Braces elsewhere are not allowed. */
export const TEMPLATE = /^([^{}]*)\{value(?::(\w+))?\}([^{}]*)$/;
const DATE = w(
  "dateStyle timeStyle weekday era year month day dayPeriod hour minute second fractionalSecondDigits timeZoneName timeZone hour12 hourCycle calendar",
);
/** Format options holding any date key are Intl.DateTimeFormat options. */
export const isDateOpts = (o: object): boolean => DATE.some((k) => Object.hasOwn(o, k));
const TOKENS = [
  ...w("font fontSize fg fgMuted grid bg accent radius tooltipBg tooltipFg focus good bad"),
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => "series" + n),
];
const USE: Record<string, string> = {
  x: "the category axis",
  y: "the plotted numbers",
  y2: "the right-axis line (orbit: growth)",
  was: "the previous values",
  series: "splitting rows into series",
  size: "bubble area",
  name: "point identity",
  path: "the hierarchy levels",
  colorBy: "colouring marks by value",
  format: "formatting that field",
  titles: "naming that field",
  frame: "the playback frames",
};
const HORIZ = "Use horizontal: true.";
const SIZED = "Size comes from CSS, or render(spec, { width, height }).";
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
  previous: 'Use was: "<field>" (bar).',
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
const show = (v: unknown) => {
  const t = typeof v === "string" || isObj(v) || Array.isArray(v) ? JSON.stringify(v) : String(v);
  return t.length > 60 ? t.slice(0, 59) + "…" : t;
};

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

export const fail = (code: ErrorCode, path: string, headline: string, ...d: string[]): never => {
  const lines = [...d, `-> https://bbekshr.github.io/mayacharts/errors.html#${code}`];
  const body = lines.filter(Boolean).map((l) => "  " + l);
  throw new MayaSpecError(code, path, `mayacharts: ${headline}\n${body.join("\n")}`);
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

const bFmt = (p: string, headline: string, ...d: string[]) =>
  fail("invalid-format", p, headline, ...d);

const format = (path: string, v: unknown, locale: string) => {
  if (typeof v === "string") {
    if (/[{}]/.test(v)) {
      const m = TEMPLATE.exec(v);
      if (!m || v.length > 80 || (m[2] !== undefined && !PRESETS.includes(m[2])))
        bFmt(
          path,
          `spec.${path} = ${show(v)} is not a format template.`,
          'A template holds one {value} or {value:<preset>} plus text, e.g. "{value:percent} of plan".',
          m?.[2] === undefined ? "" : `Presets: ${PRESETS.join(", ")}. ${dym(m[2], PRESETS)}`,
        );
      return;
    }
    if (!PRESETS.includes(v))
      bFmt(
        path,
        `spec.${path} = ${show(v)} is not a format preset.`,
        `Presets: ${PRESETS.join(", ")}. Or per field: { <field>: preset or Intl options }.`,
        dym(v, PRESETS),
      );
    return;
  }
  if (!isObj(v)) bFmt(path, `spec.${path} must be a preset or Intl options, received ${show(v)}.`);
  const { prefix, suffix, ...o } = v as Record<string, unknown>;
  for (const [k, a] of [
    ["prefix", prefix],
    ["suffix", suffix],
  ] as const)
    if (a !== undefined && typeof a !== "string")
      bFmt(`${path}.${k}`, `spec.${path}.${k} must be a string, received ${show(a)}.`);
  const dt = isDateOpts(o);
  try {
    void (dt ? new Intl.DateTimeFormat(locale, o) : new Intl.NumberFormat(locale, o));
  } catch (e) {
    bFmt(
      path,
      `spec.${path} = ${show(v)} is not valid ${dt ? "Intl.DateTimeFormat" : "Intl.NumberFormat"} options.`,
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
  ["aggregate", `one of ${AGGS.join(", ")}`, (v) => AGGS.includes(v)],
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
    "forms",
    `a non-empty array of distinct forms: ${FORMS.join(", ")}`,
    (v) => strs(v, 1) && v.every((f) => FORMS.includes(f)) && new Set(v).size === v.length,
  ],
  [
    "colorBy",
    '"sign", { target: number } or a numeric field name',
    (v) =>
      (typeof v === "string" && !!v) ||
      (isObj(v) && Object.keys(v).join() === "target" && Number.isFinite(v.target)),
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
      EX,
    );
  const known = [...CORE_TYPES, ...types()];
  const str = typeof type === "string" ? type : undefined;
  if (str === undefined || !known.includes(str)) {
    const mod = str === undefined ? undefined : own(MODULE_OF, str);
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
      str === undefined ? "" : (own(ALIAS, str) ?? dym(str, [...known, ...Object.keys(MODULE_OF)])),
    );
  }
  const t = type as string;
  const isPath = PATH.includes(t);
  const need = isPath ? "path" : "x";
  const pth = (spec as Record<string, unknown>)["path"];
  if (Array.isArray(pth) && (t === "sankey" ? pth.length < 2 : t === "chord" && pth.length !== 2))
    fail(
      "invalid-option",
      "path",
      `spec.path needs ${t === "sankey" ? "at least" : "exactly"} two levels for a ${t}.`,
    );
  const missing = (f: string) =>
    fail(
      "missing-field",
      f,
      `spec.${f} is required but missing.`,
      `Required fields: type, data, ${need}, y.`,
      isPath
        ? `Example: { type: "${t}", data: [{ region: "N", state: "NY", sales: 10 }], path: ["region", "state"], y: "sales" }`
        : EX,
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
  if (
    s[need] === undefined &&
    t !== "kpi" &&
    t !== "beeswarm" &&
    !(t === "funnel" && Array.isArray(s.y)) &&
    !(need === "x" && PATHX.includes(t) && s.path !== undefined)
  )
    missing(need);
  if (s.y === undefined) missing("y");
  if (["dumbbell", "ridgeline", "marimekko", "weave"].includes(t) && s.series === undefined)
    missing("series");
  // parallel keeps its 0.x code; constellation has its own.
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
        fail(
          "invalid-option",
          `text.${k}`,
          `spec.text.${k} is not a text key.`,
          dym(k, Object.keys(TEXT)),
        );
      if (typeof v !== "string") bad(`text.${k}`, v, "a string");
    }
  }
  for (const k of ["yDomain", "xDomain"]) {
    const d = s[k] as number[] | undefined;
    if (
      d !== undefined &&
      !(
        Array.isArray(d) &&
        d.length === 2 &&
        Number.isFinite(d[0]) &&
        Number.isFinite(d[1]) &&
        (k === "yDomain" ? d[0] !== d[1] : d[0]! < d[1]!)
      )
    )
      fail(
        "invalid-domain",
        k,
        `spec.${k} = ${show(d)} is not a valid domain.`,
        k === "yDomain"
          ? "Expected [min, max] (or [max, min] to reverse) with two different finite numbers."
          : "Expected [min, max] with finite numbers and min < max, e.g. [0, 100].",
      );
  }

  if (s.rules !== undefined) {
    const v = s.rules;
    if (!Array.isArray(v) || v.length > 4) bad("rules", v, "an array of at most 4 rules");
    (v as unknown[]).forEach((e, i) => {
      const o = isObj(e) ? e : { y: e };
      // ponytail: |y| <= 1e15 keeps the widened axis span finite.
      const okY = o.y === "mean" || (Number.isFinite(o.y) && Math.abs(o.y as number) <= 1e15);
      const okL = o.label === undefined || (typeof o.label === "string" && o.label.length <= 40);
      if (!okY || !okL || Object.keys(o).some((k) => k !== "y" && k !== "label"))
        bad(`rules[${i}]`, e, 'a number, "mean" or { y, label?: string of at most 40 characters }');
    });
  }

  let locale = "en-US";
  if (typeof s.locale === "string") {
    let ok = false;
    try {
      ok = Intl.NumberFormat.supportedLocalesOf(s.locale).length > 0;
    } catch {}
    if (!ok)
      bFmt("locale", `spec.locale = ${show(s.locale)} is not a locale this runtime supports.`);
    locale = s.locale;
  }
  if (typeof s.currency === "string")
    try {
      new Intl.NumberFormat(locale, { style: "currency", currency: s.currency });
    } catch {
      bFmt("currency", `spec.currency = ${show(s.currency)} is not an ISO 4217 currency code.`);
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
      fail(
        "invalid-option",
        "colors",
        `spec.colors has ${entries!.length} colours; the palette has 8 slots.`,
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

  if (s.stack && t === "line")
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
  const cart = PATHX.includes(t);
  const pairs: [boolean, string, string, string?][] = [
    [
      colorBy !== undefined && s.series !== undefined && t !== "dumbbell",
      "colorBy",
      "spec.colorBy cannot be combined with spec.series.",
    ],
    [
      s.yDomain !== undefined && Array.isArray(y),
      "yDomain",
      "spec.yDomain cannot be combined with a y array.",
    ],
    [
      s.drill === true && select !== undefined,
      "select",
      "spec.select cannot be combined with spec.drill.",
    ],
    [
      cart && path !== undefined && s.x !== undefined,
      "x",
      "spec.x cannot be combined with spec.path.",
    ],
    // ponytail: was ghosts are grouped bars only, not stacks or a measure toggle (NON-FEATURES).
    [
      s.was !== undefined && (!!s.stack || Array.isArray(y)),
      "was",
      "spec.was cannot be combined with spec.stack or a y array.",
    ],
    [
      s.y2 !== undefined && s.horizontal === true,
      "y2",
      "spec.y2 cannot be combined with spec.horizontal.",
    ],
    [
      s.xType === "time" && (s.sort !== undefined || s.limit !== undefined),
      "xType",
      'spec.xType = "time" cannot be combined with spec.sort or spec.limit.',
    ],
    [
      s.xType === "time" && s.horizontal === true,
      "xType",
      'spec.xType = "time" cannot be combined with spec.horizontal.',
    ],
    [
      t === "kpi" && colorBy !== undefined && !isObj(colorBy),
      "colorBy",
      'spec.colorBy on "kpi" must be { target: number }.',
    ],
    [
      t === "funnel" && s.x !== undefined && Array.isArray(y),
      "x",
      'spec.x cannot be combined with a y array on "funnel" (the fields are the stages).',
    ],
    [
      t === "boxplot" && s.aggregate !== undefined,
      "aggregate",
      'spec.aggregate is not supported with spec.type = "boxplot".',
      "A box plot summarises raw rows.",
    ],
    [
      cart && s.drill === true && path === undefined,
      "drill",
      `spec.drill on "${t}" needs spec.path.`,
    ],
  ];
  for (const [hit, k, headline, detail] of pairs)
    if (hit) fail("option-unsupported", k, headline, detail ?? "");

  if (rows.length) {
    // The key list is only built on the error path; the check itself stops at the first row.
    const has = (f: string) => rows.some((r) => Object.hasOwn(r, f));
    const unk = (p: string, headline: string, f: string, use: string) => {
      const found = [...new Set(rows.flatMap((r) => Object.keys(r)))];
      return fail(
        "unknown-field",
        p,
        headline,
        `Fields found: ${found.slice(0, 20).join(", ")}.`,
        dym(f, found),
        use,
      );
    };
    const ys = typeof y === "string" ? [y] : (y as string[]);
    const arr = (o: string, a: string[]): [string, string][] => a.map((f, i) => [`${o}[${i}]`, f]);
    const fields: [string, unknown][] = [
      ["x", s.x],
      ...(typeof y === "string" ? [["y", y] as [string, string]] : arr("y", ys)),
      ["series", s.series],
      ["y2", s.y2],
      ["was", s.was],
      ["size", s.size],
      ["name", s.name],
      ...arr("path", (path as string[] | undefined) ?? []),
      ["colorBy", colorBy === "sign" ? undefined : colorBy],
      ["frame", s.frame],
    ];
    for (const [p, f] of fields) {
      if (typeof f !== "string" || has(f)) continue;
      const opt = p.replace(/\[.*/, "");
      unk(
        p,
        `spec.${p} = ${show(f)} is not a field in spec.data.`,
        f,
        `spec.${opt} names the field used for ${USE[opt]}.`,
      );
    }
    for (const opt of ["format", "titles"])
      if (isObj(s[opt]))
        for (const f of Object.keys(s[opt] as object))
          if (!has(f))
            unk(
              `${opt}.${f}`,
              `spec.${opt} key "${f}" is not a field in spec.data.`,
              f,
              `spec.${opt} keys name fields, for ${USE[opt]}.`,
            );
    if (colorBy === "sign" && has("sign"))
      fail(
        "invalid-option",
        "colorBy",
        'spec.colorBy = "sign" colours by the sign of y, but spec.data also has a field named "sign".',
      );

    // Callbacks build the data[i].field path themselves, only when a row fails.
    const scan = (f: string, g: (v: unknown, i: number) => void) =>
      rows.forEach((r, i) => g(r[f], i));
    const numeric = (f: string, code: ErrorCode, opt: string) =>
      scan(f, (v, i) => {
        if (v == null || (typeof v === "number" && Number.isFinite(v))) return;
        const p = `data[${i}].${f}`;
        fail(
          code,
          p,
          `spec.${p} is ${show(v)} (a ${ty(v)}), but spec.${opt} requires numbers.`,
          typeof v === "string" && v.trim() && Number.isFinite(Number(v))
            ? `Convert first: data.map(r => ({ ...r, ${f}: Number(r.${f}) }))`
            : "Use null for a gap in the data.",
        );
      });
    for (const f of ys) numeric(f, "non-numeric-y", "y");
    if (typeof s.size === "string") numeric(s.size, "non-numeric-field", "size");
    for (const k of ["y2", "was"])
      if (typeof s[k] === "string") numeric(s[k] as string, "non-numeric-field", k);
    if (t === "dumbbell" && typeof s.series === "string") {
      const n = new Set(rows.map((r) => String(r[s.series as string]))).size;
      if (n !== 2)
        fail(
          "invalid-option",
          "series",
          `spec.series on "dumbbell" needs exactly 2 values, found ${n}.`,
        );
    }
    if (t === "scatter" && typeof s.x === "string") numeric(s.x, "non-numeric-field", "x");
    if (s.xType === "time" && typeof s.x === "string")
      scan(s.x, (v, i) => {
        if (v == null || toTime(v) !== null) return;
        const p = `data[${i}].${s.x}`;
        fail(
          "invalid-date",
          p,
          `spec.${p} is ${show(v)}, but spec.xType = "time" needs ISO 8601 dates or epoch ms.`,
        );
      });
    if (typeof colorBy === "string" && colorBy !== "sign")
      numeric(colorBy, "non-numeric-field", "colorBy");
    if (isPath || t === "funnel")
      for (const f of ys)
        scan(f, (v, i) => {
          if (typeof v === "number" && (v < 0 || (isPath && v === 0))) {
            const p = `data[${i}].${f}`;
            fail(
              "non-positive-value",
              p,
              `spec.${p} is ${v}, but ${t} ${isPath ? "sizes must be positive" : "values cannot be negative"}.`,
              `Filter first: data.filter(r => r.${f} ${isPath ? ">" : ">="} 0), or chart the signed values with "bar".`,
            );
          }
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

/** Top-level names largest first (ties in first-appearance order): the hierarchy colour slots. */
// ponytail: ranks by summed y; a non-sum aggregate can rank a drilled branch to another colour.
function rank(rows: readonly Row[], f: string, y: string): string[] {
  const t = new Map<string, number>();
  for (const r of rows) {
    const k = String(r[f]);
    t.set(k, (t.get(k) ?? 0) + (typeof r[y] === "number" ? r[y] : 0));
  }
  return [...t.keys()].sort((a, b) => t.get(b)! - t.get(a)!);
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
  // Flows need two levels left to draw, everything else one.
  const keep = spec.type === "sankey" || spec.type === "chord" ? 2 : 1;
  const drilled = spec.drill ? (view.drill ?? []).slice(0, Math.max(0, full.length - keep)) : [];
  const path = full.slice(drilled.length);
  const f = spec.format;
  const F = spec.frame;
  const fv = F ? [...new Set(spec.data.flatMap((r) => (r[F] == null ? [] : [String(r[F])])))] : [];
  const fi = Math.min(view.frame ?? fv.length, fv.length - 1);
  const rows = F ? spec.data.filter((r) => String(r[F]) === fv[fi]) : spec.data;
  const forms = spec.forms ?? (spec.type === "units" ? (FORMS as ResolvedSpec["forms"]) : []);
  // Units: the group is the series (legend toggles, view.hidden and colors by group), unless colorBy colours the dots.
  const series = spec.series ?? (spec.type === "units" && !spec.colorBy ? spec.x! : null);
  const entries = <T>(o: Readonly<Partial<Record<string, T>>> | undefined) =>
    Object.entries(o ?? {}).filter((e): e is [string, T] => e[1] !== undefined);
  return {
    type: spec.type,
    data: drilled.length
      ? rows.filter((r) => drilled.every((d, i) => String(r[full[i]!]) === d))
      : rows,
    frame: F ? [F, fv, fi] : null,
    x: spec.x ?? (PATHX.includes(spec.type) ? (path[0] ?? "") : ""),
    xType: spec.xType ?? "auto",
    y: measures[measure]!,
    measures,
    measure,
    series,
    y2: spec.y2 ?? null,
    was: spec.was ?? null,
    forms,
    form: Math.max(0, Math.min(view.form ?? 0, forms.length - 1)),
    path,
    drilled,
    hue: drilled.length ? rank(spec.data, full[0]!, measures[measure]!).indexOf(drilled[0]!) : null,
    window: view.window && view.window.length === 4 ? view.window : null,
    size: spec.size ?? null,
    name: spec.name ?? null,
    totals: [...(spec.totals ?? [])],
    stack: spec.stack ?? false,
    horizontal: spec.horizontal ?? false,
    aggregate: spec.aggregate ?? "sum",
    sort: spec.sort ?? null,
    sortBy: view.sortBy ?? null,
    limit: spec.limit ?? null,
    // stack "percent" shows shares: percent unless the spec formats the measure.
    format: new Map<string, FieldFormat>([
      ...measures.flatMap((m) => (spec.stack === "percent" ? [[m, "percent"] as const] : [])),
      ...(typeof f === "string" ? measures.map((m) => [m, f] as const) : entries<FieldFormat>(f)),
    ]),
    // A scatter names its axes by field: two numeric axes say nothing otherwise.
    titles: new Map([
      ...(spec.type === "scatter" ? [spec.x!, measures[measure]!] : []).map(
        (k): [string, string] => [k, k],
      ),
      ...entries<string>(spec.titles),
    ]),
    labels: spec.labels ?? null,
    text: { ...spec.text },
    title: spec.title ?? null,
    description: spec.description ?? null,
    legend:
      spec.legend ??
      (series !== null ||
        (spec.y2 !== undefined && spec.type === "bar") ||
        spec.type === "waffle" ||
        spec.type === "hexmap"),
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
    rules: (spec.rules ?? []).map((e) =>
      typeof e === "object" ? { y: e.y, label: e.label ?? null } : { y: e, label: null },
    ),
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
