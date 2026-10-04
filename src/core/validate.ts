/*
 * Validation: hand-written guards, zero deps. Errors only (no warnings, no logging).
 *
 * Message format (every error):
 *   mayacharts: <one-line headline naming the exact spec path>
 *     <detail lines, 2-space indent>
 *     -> https://bbekshr.github.io/mayacharts/errors.html#<code>
 *
 * Error catalogue (code: when -> what the detail must say):
 *   spec-not-object    spec is not a plain object            -> show typeof received
 *   missing-field      type/data/x/y absent                  -> list the 4 required fields + minimal example
 *   unknown-type       type not bar|line|area                -> list valid types, "Did you mean"
 *   data-not-array     data is not an array                  -> show typeof
 *   row-not-object     data[i] is not a plain object         -> show index and typeof
 *   unknown-field      x/y/series names a field no row has   -> list fields found (union over rows, first 20),
 *                                                                "Did you mean", what the option is for
 *   non-numeric-y      data[i][y] is not a finite number     -> null/undefined are allowed (gaps). A numeric
 *                                                                string gets the coercion hint:
 *                                                                data.map(r => ({ ...r, <y>: Number(r.<y>) }))
 *   unknown-option     top-level key not in ChartSpec        -> "Did you mean" against known keys
 *   invalid-option     wrong type for a known option         -> expected type and received value
 *   stack-unsupported  stack: true with type "line"          -> suggest type "area"
 *   invalid-domain     yDomain not [finite, finite] min<max  -> show received
 *   invalid-format     yFormat not auto|compact|percent|currency -> list + "Did you mean"
 *   invalid-theme      unknown theme token                   -> list tokens + "Did you mean"
 *   unsafe-css-value   theme/colors value contains ; { } < > \ or "url(" / "expression("
 *                                                             -> explain values are CSS values only
 *   invalid-size       RenderOptions width/height not finite > 0
 *
 * "Did you mean": pick the candidate with the smallest Levenshtein-free score
 * (|len diff| + count of chars not shared, case-insensitive); suggest only if score <= 3.
 */
import type { ChartSpec, RenderOptions, ResolvedSpec } from "./types.ts";

export type ErrorCode =
  | "spec-not-object"
  | "missing-field"
  | "unknown-type"
  | "data-not-array"
  | "row-not-object"
  | "unknown-field"
  | "non-numeric-y"
  | "unknown-option"
  | "invalid-option"
  | "stack-unsupported"
  | "invalid-domain"
  | "invalid-format"
  | "invalid-theme"
  | "unsafe-css-value"
  | "invalid-size";

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

const S: Record<string, string> = {
  x: "string",
  y: "string",
  series: "string",
  title: "string",
  description: "string",
  xLabel: "string",
  yLabel: "string",
  locale: "string",
  currency: "string",
  stack: "boolean",
  legend: "boolean",
  tooltip: "boolean",
  grid: "boolean",
  xAxis: "boolean",
  yAxis: "boolean",
  table: "boolean",
  animate: "boolean",
};
const KEYS = [...Object.keys(S), "type", "data", "yFormat", "yDomain", "colors", "theme"];
const TYPES = ["bar", "line", "area"];
const FORMATS = ["auto", "compact", "percent", "currency"];
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
];
const USE: Record<string, string> = {
  x: "the category axis",
  y: "the plotted numbers",
  series: "splitting rows into series",
};

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const ty = (v: unknown) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);
const show = (v: unknown) => {
  const t = typeof v === "string" || isObj(v) || Array.isArray(v) ? JSON.stringify(v) : String(v);
  return t.length > 60 ? t.slice(0, 59) + "…" : t;
};
const list = (a: readonly string[]) => a.slice(0, 20).join(", ");
const dym = (s: string, c: readonly string[]) => {
  const a = s.toLowerCase();
  let best = "";
  let min = 4;
  for (const k of c) {
    const l = k.toLowerCase();
    const n = Math.abs(a.length - l.length) + [...l].filter((ch) => !a.includes(ch)).length;
    if (n < min) [min, best] = [n, k];
  }
  return best && `Did you mean "${best}"?`;
};
const fail = (code: ErrorCode, path: string, headline: string, ...details: string[]): never => {
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
const unsafe = (path: string, v: string) => {
  if (!v || /[;{}<>\\]|url\(|expression\(/i.test(v))
    fail(
      "unsafe-css-value",
      path,
      `spec.${path} = ${show(v)} is not a safe CSS value.`,
      "Colors and theme values must be plain CSS values (no ; { } < > \\ url() or expression()).",
    );
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
        dym(k, KEYS),
        `Known options: ${KEYS.join(", ")}.`,
      );
  for (const f of ["type", "data", "x", "y"])
    if (s[f] === undefined)
      fail(
        "missing-field",
        f,
        `spec.${f} is required but missing.`,
        "Required fields: type, data, x, y.",
        'Example: { type: "bar", data: [{ month: "Jan", revenue: 10 }], x: "month", y: "revenue" }',
      );
  if (!TYPES.includes(s.type as string))
    fail(
      "unknown-type",
      "type",
      `spec.type = ${show(s.type)} is not a chart type.`,
      `Valid types: ${TYPES.join(", ")}.`,
      typeof s.type === "string" ? dym(s.type, TYPES) : "",
    );
  if (!Array.isArray(s.data))
    fail("data-not-array", "data", `spec.data must be an array of rows, received ${ty(s.data)}.`);
  const rows = s.data as unknown[];
  rows.forEach((r, i) => {
    if (!isObj(r))
      fail(
        "row-not-object",
        `data[${i}]`,
        `spec.data[${i}] must be an object, received ${ty(r)}.`,
        `Received: ${show(r)}`,
      );
  });
  for (const k in S) {
    const v = s[k];
    if (v !== undefined && typeof v !== S[k])
      fail("invalid-option", k, `spec.${k} must be a ${S[k]}, received ${show(v)}.`);
  }
  const { colors, theme, yDomain: d, yFormat: f } = s;
  if (
    colors !== undefined &&
    !(Array.isArray(colors) && colors.every((c) => typeof c === "string"))
  )
    fail(
      "invalid-option",
      "colors",
      `spec.colors must be an array of strings, received ${show(colors)}.`,
    );
  if (
    theme !== undefined &&
    !(isObj(theme) && Object.values(theme).every((c) => typeof c === "string"))
  )
    fail(
      "invalid-option",
      "theme",
      `spec.theme must be an object of string values, received ${show(theme)}.`,
    );
  if (s.stack === true && s.type === "line")
    fail(
      "stack-unsupported",
      "stack",
      'spec.stack is not supported with spec.type = "line".',
      'Use type "area" (or "bar") to stack series.',
    );
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
      "yDomain",
      `spec.yDomain = ${show(d)} is not a valid domain.`,
      "Expected [min, max] with finite numbers and min < max, e.g. [0, 100].",
    );
  if (f !== undefined && !FORMATS.includes(f as string))
    fail(
      "invalid-format",
      "yFormat",
      `spec.yFormat = ${show(f)} is not a number format.`,
      `Valid formats: ${FORMATS.join(", ")}.`,
      typeof f === "string" ? dym(f, FORMATS) : "",
    );
  for (const k in theme as object)
    if (!TOKENS.includes(k))
      fail(
        "invalid-theme",
        `theme.${k}`,
        `spec.theme.${k} is not a theme token.`,
        `Valid tokens: ${TOKENS.join(", ")}.`,
        dym(k, TOKENS),
      );
  ((colors as string[] | undefined) ?? []).forEach((c, i) => unsafe(`colors[${i}]`, c));
  for (const [k, v] of Object.entries((theme as Record<string, string> | undefined) ?? {}))
    unsafe(`theme.${k}`, v);
  if (!rows.length) return;
  const found = [...new Set(rows.flatMap((r) => Object.keys(r as object)))];
  for (const k of ["x", "y", "series"]) {
    const n = s[k];
    if (typeof n === "string" && !found.includes(n))
      fail(
        "unknown-field",
        k,
        `spec.${k} = ${show(n)} is not a field in spec.data.`,
        `Fields found: ${list(found)}.`,
        dym(n, found),
        `spec.${k} names the field used for ${USE[k]}.`,
      );
  }
  const y = s.y as string;
  rows.forEach((r, i) => {
    const v = (r as Record<string, unknown>)[y];
    if (v == null || (typeof v === "number" && Number.isFinite(v))) return;
    fail(
      "non-numeric-y",
      `data[${i}].${y}`,
      `spec.data[${i}].${y} is ${show(v)} (a ${ty(v)}), but spec.y requires numbers.`,
      typeof v === "string" && v.trim() && Number.isFinite(Number(v))
        ? `Convert first: data.map(r => ({ ...r, ${y}: Number(r.${y}) }))`
        : "Use null for a gap in the data.",
    );
  });
}

export function validateOptions(opts: unknown): asserts opts is RenderOptions {
  if (opts === undefined) return;
  if (!isObj(opts))
    fail("invalid-option", "options", `options must be a plain object, received ${ty(opts)}.`);
  const o = opts as Record<string, unknown>;
  const keys = ["width", "height", "hidden"];
  for (const k of Object.keys(o))
    if (!keys.includes(k))
      fail(
        "unknown-option",
        `options.${k}`,
        `options.${k} is not a known render option.`,
        dym(k, keys),
        `Known options: ${keys.join(", ")}.`,
      );
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
  const h = o.hidden;
  if (h !== undefined && !(Array.isArray(h) && h.every((c) => typeof c === "string")))
    fail(
      "invalid-option",
      "options.hidden",
      `options.hidden must be an array of strings, received ${show(h)}.`,
    );
}

/** Apply defaults. Assumes `spec` already passed validateSpec. */
export function resolve(spec: ChartSpec): ResolvedSpec {
  return {
    type: spec.type,
    data: spec.data,
    x: spec.x,
    y: spec.y,
    series: spec.series ?? null,
    stack: spec.stack ?? false,
    title: spec.title ?? null,
    description: spec.description ?? null,
    legend: spec.legend ?? spec.series !== undefined,
    tooltip: spec.tooltip ?? true,
    grid: spec.grid ?? true,
    xAxis: spec.xAxis ?? true,
    yAxis: spec.yAxis ?? true,
    xLabel: spec.xLabel ?? null,
    yLabel: spec.yLabel ?? null,
    yFormat: spec.yFormat ?? "auto",
    locale: spec.locale ?? "en-US",
    currency: spec.currency ?? "USD",
    yDomain: spec.yDomain ?? null,
    table: spec.table ?? true,
    animate: spec.animate ?? true,
    colors: spec.colors ?? null,
    theme: spec.theme ?? {},
  };
}
