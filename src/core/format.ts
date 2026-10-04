import type { ResolvedSpec } from "./types.ts";

const decimals = (s: number) => {
  for (let d = 0; d < 8; d++) if (Math.abs(s * 10 ** d - Math.round(s * 10 ** d)) < 1e-9) return d;
  return 8;
};

export function formatter(spec: ResolvedSpec, step: number): (v: number) => string {
  const d = decimals(step);
  const f = spec.yFormat;
  const o: Intl.NumberFormatOptions =
    f === "compact"
      ? { notation: "compact", maximumFractionDigits: 1 }
      : f === "percent"
        ? {
            style: "percent",
            minimumFractionDigits: Math.max(0, d - 2),
            maximumFractionDigits: Math.max(1, d - 2),
          }
        : f === "currency"
          ? {
              style: "currency",
              currency: spec.currency,
              minimumFractionDigits: step >= 1 ? 0 : d,
              maximumFractionDigits: step >= 1 ? 0 : Math.max(d, 2),
            }
          : { maximumFractionDigits: Math.max(d, 2) };
  const nf = new Intl.NumberFormat(spec.locale, o);
  return (v) => nf.format(v);
}
