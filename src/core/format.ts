import type { FieldFormat, ResolvedSpec } from "./types.ts";
import { TEMPLATE } from "./validate.ts";

const decimals = (s: number) => {
  for (let d = 0; d < 8; d++) if (Math.abs(s * 10 ** d - Math.round(s * 10 ** d)) < 1e-9) return d;
  return 8;
};

const DATE_KEYS =
  "year month day hour minute second weekday era timeZone dateStyle timeStyle fractionalSecondDigits hour12 dayPeriod timeZoneName".split(
    " ",
  );
const DATE_PRESETS: Record<string, Intl.DateTimeFormatOptions> = {
  date: { dateStyle: "medium" },
  month: { month: "short", year: "numeric" },
  year: { year: "numeric" },
  time: { timeStyle: "short" },
  datetime: { dateStyle: "medium", timeStyle: "short" },
};

export function formatter(
  s: ResolvedSpec,
  field: string | number = s.y,
  step?: number,
): (v: unknown) => string {
  if (typeof field === "number") [field, step] = [s.y, field]; // T0-era formatter(spec, step)
  let e: FieldFormat | undefined = s.format.get(field);
  const tpl = typeof e === "string" ? TEMPLATE.exec(e) : null; // "{value:percent} gross"
  if (tpl) e = (tpl[2] ?? "auto") as FieldFormat; // validate.ts checked the preset
  const locale = Intl.NumberFormat.supportedLocalesOf(s.locale).length ? s.locale : "en-US";
  const d = step === undefined ? 2 : decimals(step);
  let [prefix, suffix] = tpl ? [tpl[1]!, tpl[3]!] : ["", ""];
  let date: Intl.DateTimeFormat | null = null;
  let num: Intl.NumberFormat | null = null;
  let fine: Intl.NumberFormat | null = null; // step-less percent below 1%: 0.0025 is "0.25%", not "0.3%"
  const preset = typeof e === "string" ? e : "auto";
  if (typeof e === "string" && Object.hasOwn(DATE_PRESETS, e)) {
    date = new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...DATE_PRESETS[e] });
  } else if (typeof e === "object" && e !== null) {
    const { prefix: p = "", suffix: x = "", ...opts } = e as Record<string, unknown>;
    [prefix, suffix] = [String(p), String(x)];
    if (DATE_KEYS.some((k) => Object.hasOwn(opts, k)))
      date = new Intl.DateTimeFormat(locale, {
        timeZone: "UTC",
        ...opts,
      } as Intl.DateTimeFormatOptions);
    else num = new Intl.NumberFormat(locale, opts as Intl.NumberFormatOptions);
  }
  if (!date && !num) {
    const o: Intl.NumberFormatOptions =
      preset === "integer"
        ? { maximumFractionDigits: 0 }
        : preset === "decimal"
          ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
          : preset === "compact"
            ? { notation: "compact", maximumFractionDigits: 1 }
            : preset === "percent"
              ? {
                  style: "percent",
                  minimumFractionDigits: step === undefined ? 0 : decimals(step * 100),
                  maximumFractionDigits: step === undefined ? 1 : Math.max(1, decimals(step * 100)),
                }
              : preset === "currency"
                ? {
                    style: "currency",
                    currency: s.currency,
                    minimumFractionDigits: step !== undefined && step >= 1 ? 0 : d,
                    maximumFractionDigits: step !== undefined && step >= 1 ? 0 : Math.max(d, 2),
                  }
                : { maximumFractionDigits: Math.max(d, 2) };
    num = new Intl.NumberFormat(locale, o);
    if (preset === "percent" && step === undefined)
      fine = new Intl.NumberFormat(locale, { ...o, maximumFractionDigits: 2 });
  }
  return (v) => {
    if (v == null) return "";
    let out: string;
    if (date) {
      // Band categories arrive as strings: "1735689600000" is epoch ms, not a date string.
      const t =
        typeof v === "string" && /^-?\d+$/.test(v)
          ? new Date(+v)
          : typeof v === "number" || typeof v === "string" || v instanceof Date
            ? new Date(v)
            : NaN;
      out = Number.isNaN(+t) ? String(v) : date.format(t);
    } else
      out =
        typeof v === "number"
          ? (fine && v && Math.abs(v) < 0.01 ? fine : num!).format(v)
          : String(v);
    return prefix + out + suffix;
  };
}
