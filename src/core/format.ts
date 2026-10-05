import type { FieldFormat, ResolvedSpec } from "./types.ts";
import { isDateOpts, TEMPLATE } from "./validate.ts";

type F = { format(v: number | Date): string };
// ponytail: Intl formatters are slow to build (ICU data, option resolution) and immutable, so
// each locale + options pair is built once per page and shared by every render.
const INTL = new Map<string, F>();
// A page's first Intl number or date format loads ICU, ~7 ms in Chromium (more than a whole
// small chart), so the default en-US number format (only maximumFractionDigits: "auto" and
// "integer") is written out: half away from zero on the shortest decimal, as ICU rounds, equal
// to Intl in Chromium, Firefox, WebKit and Node (test/format.test.ts). Exponents and non-finite
// numbers go to Intl, built on first use.
// ponytail: en-US numbers only; dates and other locales pay the ICU load once per page.
const NUM = /^{"maximumFractionDigits":(\d)}$/;
const intl = (C: new (l: string, o: object) => F, locale: string, o: object) => {
  const j = JSON.stringify(o);
  let f = INTL.get(C.name + locale + j);
  if (f) return f;
  let slow: F | undefined;
  const mk = () => new C(locale, o);
  const n = locale === "en-US" && NUM.exec(j);
  if (n) {
    const k = +n[1]!;
    f = {
      format: (v) => {
        const s = Math.abs(+v) + "";
        if (/e|N|I/.test(s)) return (slow ??= mk()).format(v);
        let [i, d = ""] = s.split(".") as [string, string?];
        if (d.length > k) {
          const r = (BigInt(i + d.slice(0, k)) + BigInt(d[k]! > "4") + "").padStart(k + 1, "0");
          [i, d] = [r.slice(0, r.length - k), r.slice(r.length - k)];
        }
        d = d.replace(/0+$/, "");
        return (1 / +v < 0 ? "-" : "") + i.replace(/\B(?=(\d{3})+$)/g, ",") + (d && "." + d);
      },
    };
  } else f = mk();
  INTL.set(C.name + locale + j, f);
  return f;
};
export const nf = (locale: string, o: Intl.NumberFormatOptions = {}) =>
  intl(Intl.NumberFormat, locale, o);
export const dtf = (locale: string, o: Intl.DateTimeFormatOptions) =>
  intl(Intl.DateTimeFormat, locale, o);

const decimals = (s: number) => {
  for (let d = 0; d < 8; d++) if (Math.abs(s * 10 ** d - Math.round(s * 10 ** d)) < 1e-9) return d;
  return 8;
};

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
  const locale = s.locale; // validate.ts rejects a locale this runtime lacks
  const d = step === undefined ? 2 : decimals(step);
  let [prefix, suffix] = tpl ? [tpl[1]!, tpl[3]!] : ["", ""];
  let date: F | null = null;
  let num: F | null = null;
  let fine: F | null = null; // step-less percent below 1%: 0.0025 is "0.25%", not "0.3%"
  const preset = typeof e === "string" ? e : "auto";
  if (typeof e === "string" && Object.hasOwn(DATE_PRESETS, e)) {
    date = dtf(locale, { timeZone: "UTC", ...DATE_PRESETS[e] });
  } else if (typeof e === "object" && e !== null) {
    const { prefix: p = "", suffix: x = "", ...opts } = e as Record<string, unknown>;
    [prefix, suffix] = [String(p), String(x)];
    if (isDateOpts(opts))
      date = dtf(locale, { timeZone: "UTC", ...opts } as Intl.DateTimeFormatOptions);
    else num = nf(locale, opts as Intl.NumberFormatOptions);
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
    num = nf(locale, o);
    if (preset === "percent" && step === undefined)
      fine = nf(locale, { ...o, maximumFractionDigits: 2 });
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
