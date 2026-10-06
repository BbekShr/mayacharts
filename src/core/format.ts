import type { FieldFormat, ResolvedSpec } from "./types.ts";
import { isDateOpts, TEMPLATE } from "./validate.ts";

type F = { format(v: number | Date): string };
// ponytail: Intl formatters are slow to build (ICU data, option resolution) and immutable, so
// each locale + options pair is built once per page and shared by every render.
const INTL = new Map<string, F>();
// A page's first Intl call loads ICU, ~7 ms in Chromium (more than a whole small chart), so the
// default en-US formats are written out: numbers with only maximumFractionDigits (half away
// from zero on the shortest decimal, as ICU rounds) and UTC month/day/year/hour:minute(:second)
// dates. Output equals Intl in Chromium, Firefox and Node (test/format.test.ts); WebKit joins a
// month date and a time with " at ", these say ", " in every engine. Exponents, non-finite
// numbers and years outside 1000..9999 go to Intl, built on first use.
// ponytail: en-US only; another locale pays the ICU load once per page.
const NUM = /^{"maximumFractionDigits":(\d)}$/;
const DATE =
  /^{"timeZone":"UTC"(?=,)(?:(,"month":"short"(,"day":"numeric")?)?(,"year":"numeric")?(,"hour":"numeric","minute":"2-digit"(,"second":"2-digit")?)?|(,"dateStyle":"medium")?(,"timeStyle":"short")?)}$/;
const intl = (C: new (l: string, o: object) => F, locale: string, raw: object) => {
  // Primitive values only (a BigInt or object would throw in JSON.stringify); Intl ignores unknown names.
  const o = Object.fromEntries(
    Object.entries(raw).filter(([, v]) => typeof v != "object" && typeof v != "bigint"),
  );
  const j = JSON.stringify(o);
  let f = INTL.get(C.name + locale + j);
  if (f) return f;
  let slow: F | undefined;
  const mk = () => new C(locale, o);
  const late = (v: number | Date) => (slow ??= mk()).format(v);
  const n = locale === "en-US" && NUM.exec(j);
  const g = locale === "en-US" && DATE.exec(j);
  if (n) {
    const k = +n[1]!;
    f = {
      format: (v) => {
        const s = Math.abs(+v) + "";
        if (/e|N|I/.test(s)) return late(v);
        const p = s.indexOf(".");
        let i = p < 0 ? s : s.slice(0, p),
          d = p < 0 ? "" : s.slice(p + 1);
        // A JS number's shortest decimal has no trailing zeros; only rounding makes them.
        if (d.length > k) {
          const r = (BigInt(i + d.slice(0, k)) + BigInt(d[k]! > "4") + "").padStart(k + 1, "0");
          [i, d] = [r.slice(0, r.length - k), r.slice(r.length - k).replace(/0+$/, "")];
        }
        if (i.length > 3) i = i.replace(/\B(?=(\d{3})+$)/g, ",");
        return (1 / +v < 0 ? "-" : "") + i + (d && "." + d);
      },
    };
  } else if (g) {
    const [, m = g[6], d = g[6], y = g[6], h = g[7], s] = g;
    f = {
      format: (v) => {
        const t = new Date(v);
        const Y = t.getUTCFullYear();
        const u = t.toUTCString(); // "Mon, 01 Jan 2024 13:05:07 GMT"
        const H = +u.slice(17, 19);
        const on = (a: unknown[], sep: string) => a.filter((x) => x).join(sep);
        return Y > 999 && Y < 1e4
          ? on(
              [
                on([m && u.slice(8, 11) + (d ? " " + +u.slice(5, 7) : ""), y && Y], d ? ", " : " "),
                h && (H % 12 || 12) + u.slice(19, s ? 25 : 22) + (H < 12 ? " AM" : " PM"),
              ],
              ", ",
            )
          : late(v);
      },
    };
  } else f = mk();
  if (INTL.size > 200) INTL.clear(); // ponytail: a flush, not an LRU; hosts rarely need 200 formats
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
  field: string = s.y,
  step?: number,
): (v: unknown) => string {
  let e: FieldFormat | undefined = s.format.get(field);
  const tpl = typeof e === "string" ? TEMPLATE.exec(e) : null; // "{value:percent} gross"
  if (tpl) e = (tpl[2] ?? "auto") as FieldFormat; // validate.ts checked the preset
  const locale = s.locale; // validate.ts rejects a locale this runtime lacks
  const d = step === undefined ? 2 : decimals(step);
  let [prefix, suffix] = tpl ? [tpl[1]!, tpl[3]!] : ["", ""];
  let date: F | null = null;
  let num: F | null = null;
  let fine: F | null = null; // step-less values below 0.05, see below
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
    // Step-less, a value under 0.05 gets 2 significant digits (they win over fraction digits),
    // so 0.004 is "0.004" and 0.0025 is "0.25%", not "0".
    if (step === undefined && preset !== "integer" && preset !== "decimal" && preset !== "currency")
      fine = nf(locale, { ...o, maximumSignificantDigits: 2 });
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
          ? (fine && v && Math.abs(v) < 0.05 ? fine : num!).format(v)
          : String(v);
    return prefix + out + suffix;
  };
}
