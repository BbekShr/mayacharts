import { describe, expect, it } from "vitest";
import { renderParts } from "../src/index.ts";
import { resolve, subSpec } from "../src/core/validate.ts";
import type { ChartSpec } from "../src/core/types.ts";

const data = ["Jan", "Feb", "Mar", "Apr", "May"].flatMap((m, i) =>
  ["N", "S"].map((r, j) => ({ m, r, Sales: (i + 1) * (j + 2) * 1000 })),
);

describe("M3/M4 critic fixes", () => {
  it("percent stack formats the measure as percent over a currency format", () => {
    const spec: ChartSpec = {
      type: "bar",
      x: "m",
      y: "Sales",
      series: "r",
      stack: "percent",
      format: { Sales: "currency" },
      data,
    };
    expect(resolve(spec).format.get("Sales")).toBe("percent");
    expect(renderParts(spec).svg).not.toContain("$");
    const plain = resolve({ ...spec, stack: true });
    expect(plain.format.get("Sales")).toBe("currency");
  });

  it("sub-specs inherit format, titles, locale, currency, theme unless they set them", () => {
    const parent = {
      format: { Sales: "currency" },
      titles: { Sales: "Revenue" },
      locale: "de",
      currency: "EUR",
    } as unknown as ChartSpec;
    const sub = subSpec(parent, { type: "bar", x: "m", titles: { Sales: "Own" } }, true);
    expect(sub).toMatchObject({ format: { Sales: "currency" }, locale: "de", currency: "EUR" });
    expect(sub.titles).toEqual({ Sales: "Own" });
  });

  it("kpi back face inherits format and keeps no Other bar under limit", () => {
    const spec: ChartSpec = {
      type: "kpi",
      x: "m",
      y: "Sales",
      format: { Sales: "currency" },
      back: { type: "bar", x: "m", y: "Sales", sort: "desc", limit: 3 },
      data: data.filter((d) => d.r === "N"),
    };
    const p = renderParts(spec, { view: { face: "back" } });
    expect(p.svg).toContain("$");
    expect(p.svg).not.toContain("Other");
  });

  it("heatmap row trail starts with the row level title", () => {
    const rows = ["A", "B"].flatMap((f) =>
      ["a1", "a2"].flatMap((g) => ["x", "y"].map((h) => ({ f, g, h, k: "k1", v: 1 }))),
    );
    const spec: ChartSpec = {
      type: "heatmap",
      path: ["f", "g"],
      xPath: ["h", "k"],
      y: "v",
      drill: true,
      titles: { f: "Region" },
      data: rows,
    };
    const p = renderParts(spec, { view: { drill: ["A"] } });
    expect(p.crumbs).toContain('data-depth="0">Region<');
    expect(p.crumbs).not.toContain(">Back<");
  });

  it("grouped bar was legend key is a tick", () => {
    const spec: ChartSpec = {
      type: "bar",
      x: "m",
      y: "Sales",
      series: "r",
      was: "Sales",
      data: data.map((d) => ({ ...d, Sales: d.Sales })),
    };
    expect(renderParts(spec).legend).toContain("<span data-past data-tick>");
    expect(
      renderParts({ ...spec, series: undefined, data: data.slice(0, 3) } as unknown as ChartSpec)
        .legend,
    ).toContain("<span data-past><i>");
  });

  it("a table filter with no match says so and keeps the filter control", () => {
    const spec: ChartSpec = {
      type: "table",
      x: "m",
      y: "Sales",
      filter: true,
      data: data.slice(0, 4),
    };
    const p = renderParts(spec, { view: { filter: "zzzz" } });
    expect(p.svg).toContain("No rows match &quot;zzzz&quot;");
    expect(p.controls).toContain("maya-filter");
    expect(renderParts(spec, { view: { filter: "" } }).svg).not.toContain("No rows match");
  });
});
