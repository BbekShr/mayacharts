import { describe, expect, it } from "vitest";
import { formatter } from "../src/core/format.ts";
import { resolve } from "../src/core/validate.ts";
import type { ChartSpec } from "../src/core/types.ts";

const f = (format: ChartSpec["format"], field = "v", step?: number, o: Partial<ChartSpec> = {}) =>
  formatter(
    resolve({
      type: "bar",
      data: [{ m: "a", v: 1, w: 2 }],
      x: "m",
      y: ["v", "w"],
      format,
      ...o,
    } as ChartSpec),
    field,
    step,
  );

describe("formatter number presets", () => {
  it("auto uses step decimals, else at most 2", () => {
    expect(f(undefined)(1234.5678)).toBe("1,234.57");
    expect(f(undefined, "v", 0.5)(1.5)).toBe("1.5");
    expect(f("auto", "v", 1)(1234.5)).toBe("1,234.5");
  });
  it("integer decimal compact percent currency", () => {
    expect(f("integer")(1234.6)).toBe("1,235");
    expect(f("decimal")(3)).toBe("3.00");
    expect(f("compact")(1234567)).toBe("1.2M");
    expect(f("percent", "v", 0.05)(0.25)).toBe("25%");
    expect(f("currency", "v", 10)(1234)).toBe("$1,234");
    expect(f("currency", "v", 0.5, { currency: "EUR", locale: "de-DE" })(1.5)).toMatch(/1,5/);
  });
  it("bare string applies to every measure; map applies per field", () => {
    expect(f("integer", "w")(2.7)).toBe("3");
    expect(f({ v: "integer" }, "w")(2.7)).toBe("2.7");
    expect(f({ v: "integer" }, "v")(2.7)).toBe("3");
  });
  it("Intl options with prefix/suffix", () => {
    expect(f({ v: { maximumFractionDigits: 1, prefix: "~", suffix: " u" } })(2.345)).toBe("~2.3 u");
  });
});

describe("formatter dates", () => {
  const ms = Date.UTC(2024, 2, 5, 14, 30);
  const iso = "2024-03-05T14:30:00Z";
  it("presets", () => {
    expect(f({ v: "date" })(ms)).toBe("Mar 5, 2024");
    expect(f({ v: "month" })(ms)).toBe("Mar 2024");
    expect(f({ v: "year" })(ms)).toBe("2024");
    expect(f({ v: "time" })(ms)).toBe("2:30 PM");
    expect(f({ v: "datetime" })(ms)).toBe("Mar 5, 2024, 2:30 PM");
  });
  it("epoch and ISO agree in UTC", () => {
    for (const p of ["date", "month", "year", "time", "datetime"] as const)
      expect(f({ v: p })(iso)).toBe(f({ v: p })(ms));
  });
  it("date options object with affix", () => {
    expect(f({ v: { year: "numeric", prefix: "FY", suffix: "!" } })(ms)).toBe("FY2024!");
  });
  it("invalid dates fall back to String(v)", () => {
    expect(f({ v: "date" })("nope")).toBe("nope");
    expect(f({ v: "date" })(true)).toBe("true");
  });
});

describe("formatter fallbacks", () => {
  it("non-numbers become strings, null becomes empty, never throws", () => {
    const g = f("integer");
    expect(g("abc")).toBe("abc");
    expect(g(true)).toBe("true");
    expect(g(null)).toBe("");
    expect(g(undefined)).toBe("");
    expect(g({})).toBe("[object Object]");
  });
  it("is deterministic", () => {
    const g = f("compact");
    expect(g(98765)).toBe(g(98765));
    expect(f("compact")(98765)).toBe(g(98765));
  });
});

describe("percent ticks and small values", () => {
  it("decimals follow the tick step", () => {
    expect(f("percent", "v", 0.0025)(0.0025)).toBe("0.25%");
    expect(f("percent", "v", 0.001)(0.003)).toBe("0.3%");
    expect(f("percent", "v", 0.25)(0.5)).toBe("50%");
  });
  it("step-less values under 1% keep two decimals", () => {
    const g = f("percent");
    expect(g(0.0025)).toBe("0.25%");
    expect(g(0.123)).toBe("12.3%");
    expect(g(0)).toBe("0%");
  });
});
