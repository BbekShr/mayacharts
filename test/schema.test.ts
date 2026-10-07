import { describe, it, expect } from "vitest";
import schema from "../schema.json" with { type: "json" };
import { validateSpec, KEYS } from "../src/core/validate.ts";
import { CORE_TYPES, MODULE_OF } from "../src/core/registry.ts";
import { TEXT } from "../src/core/strings.ts";
import { readFileSync } from "node:fs";

describe("schema.json", () => {
  it("has all known ChartSpec keys", () => {
    const schemaKeys = Object.keys(schema.properties).sort();
    const expectedKeys = KEYS.sort();
    expect(schemaKeys).toEqual(expectedKeys);
  });

  it("type enum includes all core and module types", () => {
    const allTypes = [...CORE_TYPES, ...Object.keys(MODULE_OF)].sort();
    const schemaTypes = schema.properties.type.enum.sort();
    expect(schemaTypes).toEqual(allTypes);
  });

  it("lists every text key, and only those, in schema.json, llms.txt and site/docs.html", () => {
    const keys = Object.keys(TEXT).sort();
    expect([...schema.properties.text.propertyNames.enum].sort()).toEqual(keys);
    const list = (f: string, re: RegExp) =>
      re
        .exec(readFileSync(new URL(f, import.meta.url), "utf8"))![1]!
        .trim()
        .split(/\s+/)
        .sort();
    expect(list("../llms.txt", /Keys: ([\w ]+)\./)).toEqual(keys);
    expect(list("../site/docs.html", /placeholders: ([\w\s]+)<\/td>/)).toEqual(keys);
  });

  it("validates 10 canonical examples", () => {
    const examples = [
      {
        type: "bar",
        x: "month",
        y: "revenue",
        format: "currency",
        data: [
          { month: "Jan", revenue: 10500 },
          { month: "Feb", revenue: 12000 },
        ],
      },
      {
        type: "bar",
        x: "state",
        y: "units",
        series: "region",
        stack: true,
        data: [
          { state: "CA", region: "West", units: 120 },
          { state: "NY", region: "East", units: 100 },
        ],
      },
      {
        type: "bar",
        horizontal: true,
        x: "product",
        y: "margin",
        sort: "desc",
        limit: 5,
        labels: true,
        data: [
          { product: "A", margin: 22 },
          { product: "B", margin: 18 },
        ],
      },
      {
        type: "bar",
        x: "metric",
        y: "variance",
        format: "percent",
        colorBy: "sign",
        data: [
          { metric: "revenue", variance: 0.15 },
          { metric: "units", variance: -0.08 },
        ],
      },
      {
        type: "line",
        x: "date",
        y: ["revenue", "units"],
        zoom: true,
        format: { date: "date", revenue: "currency" },
        data: [
          { date: "2024-01-01", revenue: 10000, units: 50 },
          { date: "2024-01-02", revenue: 12000, units: 55 },
        ],
      },
      {
        type: "area",
        x: "month",
        y: "sales",
        series: "region",
        stack: true,
        data: [
          { month: "Jan", region: "North", sales: 1500 },
          { month: "Feb", region: "North", sales: 1800 },
        ],
      },
      {
        type: "waterfall",
        x: "stage",
        y: "amount",
        totals: ["Q1", "FY"],
        data: [
          { stage: "Q1", amount: 100 },
          { stage: "Q2", amount: 50 },
          { stage: "FY", amount: 150 },
        ],
      },
      {
        type: "scatter",
        x: "population",
        y: "gdp",
        size: "area",
        name: "country",
        select: "multi",
        data: [
          { country: "USA", population: 331, gdp: 23, area: 9.8 },
          { country: "China", population: 1412, gdp: 17, area: 9.6 },
        ],
      },
      {
        type: "heatmap",
        x: "hour",
        y: "visits",
        aggregate: "count",
        data: [
          { hour: "09", visits: 42 },
          { hour: "10", visits: 35 },
        ],
      },
      {
        type: "bar",
        path: ["region", "state"],
        y: "revenue",
        drill: true,
        data: [
          { region: "West", state: "CA", revenue: 5000 },
          { region: "West", state: "OR", revenue: 3000 },
        ],
      },
    ];

    for (const example of examples) {
      expect(() => validateSpec(example)).not.toThrow();
    }
  });
});
