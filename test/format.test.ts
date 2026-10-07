import { describe, expect, it } from "vitest";
import { dtf, formatter, nf } from "../src/core/format.ts";
import { render } from "../src/core/render.ts";
import { resolve, validateSpec } from "../src/core/validate.ts";
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

describe("format templates", () => {
  it("wrap every number preset", () => {
    expect(f("{value:integer} kg")(1234.6)).toBe("1,235 kg");
    expect(f("{value:decimal} kg")(3)).toBe("3.00 kg");
    expect(f("{value:compact} units")(1234567)).toBe("1.2M units");
    expect(f("{value:percent} gross", "v", 0.05)(0.25)).toBe("25% gross");
    expect(f("{value:currency}/mo", "v", 1)(5)).toBe("$5/mo");
    expect(f("~{value}")(1234.5678)).toBe("~1,234.57");
  });
  it("wrap date presets", () => {
    expect(f("Week of {value:date}")(Date.UTC(2025, 0, 6))).toBe("Week of Jan 6, 2025");
  });
  it("a bare string applies to every y", () => {
    const o = { y: ["v", "w"] };
    expect(f("{value} kg", "v", undefined, o)(1)).toBe("1 kg");
    expect(f("{value} kg", "w", undefined, o)(2)).toBe("2 kg");
  });
  it("axis ticks use the template", () => {
    const svg = render({
      type: "bar",
      x: "m",
      y: "v",
      format: { v: "{value} kg" },
      data: [
        { m: "a", v: 10 },
        { m: "b", v: 20 },
      ],
    } as ChartSpec);
    expect(svg).toMatch(/<text[^>]*>20 kg<\/text>/);
  });
  const bad = (format: string) => () =>
    validateSpec({ type: "bar", x: "m", y: "v", format, data: [{ m: "a", v: 1 }] });
  it.each([
    ["two placeholders", "{value} {value}"],
    ["unknown preset", "{value:pct} x"],
    ["stray brace", "{value} }"],
    ["81 chars", "x".repeat(70) + "{value}" + "y".repeat(4)],
  ])("rejects %s", (_n, tpl) => {
    expect(bad(tpl)).toThrowError(expect.objectContaining({ code: "invalid-format" }));
  });
  it("suggests a preset", () => {
    expect(bad("{value:pct} x")).toThrowError(/percent/);
  });
});

describe("en-US fast path (no ICU load) equals Intl", () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  it("numbers with maximumFractionDigits 0..8", () => {
    const vals = [0, -0, 0.5, 1.5, 2.5, -2.5, 1.005, 0.125, 0.995, 999.995, 1e21, 1e-7, 1.234e-6];
    vals.push(NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER, 123456789012345680000);
    for (let i = 0; i < 4000; i++) {
      const v = (rnd() - 0.5) * 10 ** Math.floor(rnd() * 16 - 6);
      vals.push(v, Math.round(v * 1000) / 1000);
    }
    for (let k = 0; k <= 8; k++) {
      const fast = nf("en-US", { maximumFractionDigits: k });
      const intl = new Intl.NumberFormat("en-US", { maximumFractionDigits: k });
      expect(fast).not.toBeInstanceOf(Intl.NumberFormat);
      for (const v of vals) expect(fast.format(v), `${v} k=${k}`).toBe(intl.format(v));
    }
  });
  it("UTC dates for every covered option subset", () => {
    const EN: Record<string, string> = {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    };
    const opts: Intl.DateTimeFormatOptions[] = [
      { dateStyle: "medium" },
      { timeStyle: "short" },
      { dateStyle: "medium", timeStyle: "short" },
    ];
    const keys = Object.keys(EN);
    for (let b = 1; b < 64; b++)
      opts.push(Object.fromEntries(keys.filter((_, i) => b & (1 << i)).map((k) => [k, EN[k]])));
    const times = [Date.UTC(2024, 0, 1), Date.UTC(1000, 0, 1), Date.UTC(9999, 11, 31, 23, 59, 59)];
    times.push(Date.UTC(999, 11, 31), Date.UTC(-5, 0, 1), Date.UTC(2024, 5, 3, 12, 0, 5));
    for (let i = 0; i < 2000; i++) times.push(Math.floor(rnd() * 4e12));
    let covered = 0;
    for (const o of opts) {
      const fast = dtf("en-US", { timeZone: "UTC", ...o });
      if (fast instanceof Intl.DateTimeFormat) continue;
      covered++;
      const intl = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...o });
      for (const t of times)
        expect(fast.format(t), `${JSON.stringify(o)} ${t}`).toBe(intl.format(t));
    }
    expect(covered).toBeGreaterThanOrEqual(14); // the presets and every time-axis label format
  });
});

describe("step-less tiny values keep their digits", () => {
  it("auto", () => {
    const g = f("auto");
    expect(g(0.004)).toBe("0.004");
    expect(g(0.0012)).toBe("0.0012");
    expect(g(0.00002)).toBe("0.00002");
    expect(g(-0.004)).toBe("-0.004");
    expect(g(1e-300)).not.toBe("0");
    expect(g(0.012)).toBe("0.012");
    expect(g(0.05)).toBe("0.05");
    expect(g(0.123)).toBe("0.12");
    expect(g(0)).toBe("0");
  });
  it("compact", () => {
    expect(f("compact")(0.004)).toBe("0.004");
    expect(f("compact")(0.06)).toBe("0.1");
  });
  it("ticks with a step are unchanged", () => {
    expect(f("auto", "v", 1)(0.004)).toBe("0");
  });
  it("renders labels and a kpi headline", () => {
    const bar = render({
      type: "bar",
      x: "c",
      y: "v",
      labels: true,
      data: [
        { c: "a", v: 0.0012 },
        { c: "b", v: 0.004 },
      ],
    } as ChartSpec);
    expect(bar).toContain(">0.0012<");
    expect(
      render({
        type: "kpi",
        x: "c",
        y: "v",
        data: [
          { c: "a", v: 0.00002 },
          { c: "b", v: 0.00004 },
        ],
      } as ChartSpec),
    ).toContain("0.00004");
  });
});

describe("tiny and huge values", () => {
  it("auto goes scientific", () => {
    expect(f(undefined)(1e-300).length).toBeLessThan(12);
    expect(f(undefined)(1e-7)).toMatch(/E-7/i);
    expect(f(undefined)(1e21)).toMatch(/E21/i);
  });
  it("leaves ordinary values and user formats alone", () => {
    expect(f(undefined)(0.004)).toBe("0.004");
    expect(f(undefined)(1234)).toBe("1,234");
    expect(f({ v: { maximumFractionDigits: 2 } })(1e-7)).toBe("0");
  });
});
