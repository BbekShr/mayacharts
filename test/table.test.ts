import { describe, expect, it } from "vitest";
import { renderParts } from "../src/index.ts";
import { reduce } from "../src/element/sort.ts";
import type { ChartSpec, State } from "../src/core/types.ts";

const data = [
  { item: "Beverages", rev: 40, units: 7 },
  { item: "Snacks", rev: 90, units: 3 },
  { item: "Dairy", rev: 60, units: 9 },
  { item: "Snacks", rev: 10, units: 1 },
];
const base: ChartSpec = { type: "table", x: "item", y: ["rev", "units"], data };
const svg = (s: ChartSpec, o = {}) => renderParts(s, { width: 480, height: 300, ...o }).svg;
const keys = (s: string) =>
  [...s.matchAll(/data-maya="mark" data-key="([^"]+)"/g)].map((m) => m[1]!);
const order = (s: string) => [...new Set(keys(s).map((k) => decodeURIComponent(k.split("~")[1]!)))];

describe("table", () => {
  it("aggregates by row, one bar per row and measure, keyed measure~row", () => {
    const s = svg(base);
    expect(keys(s)).toEqual([
      "rev~Beverages",
      "units~Beverages",
      "rev~Snacks",
      "units~Snacks",
      "rev~Dairy",
      "units~Dairy",
    ]);
    expect(s).toMatch(/data-key="rev~Snacks"[^>]*data-y="100"/);
    expect(s).toContain('data-series="units"');
    expect(s).not.toContain('data-s="1"'); // one accent: colour never encodes the column
  });
  it("orders by spec.sort, then view.sortBy, keys stable", () => {
    expect(order(svg({ ...base, sort: "desc" }))).toEqual(["Snacks", "Dairy", "Beverages"]);
    const v = (sortBy: ["rev" | "units" | "item", "asc" | "desc"]) =>
      order(svg(base, { view: { sortBy } }));
    expect(v(["units", "desc"])).toEqual(["Dairy", "Beverages", "Snacks"]);
    expect(v(["item", "asc"])).toEqual(["Beverages", "Dairy", "Snacks"]);
    expect(v(["item", "desc"])).toEqual(["Snacks", "Dairy", "Beverages"]);
    expect(keys(svg(base, { view: { sortBy: ["rev", "asc"] } })).sort()).toEqual(
      keys(svg(base)).sort(),
    );
  });
  it("header cells carry field, direction and label", () => {
    const s = svg({ ...base, titles: { rev: "Revenue" } }, { view: { sortBy: ["rev", "desc"] } });
    expect(s).toMatch(/data-maya="sort" data-field="rev" data-sort="desc"[^>]*tabindex="0"/);
    expect(s).toContain('aria-label="Sorted by Revenue, descending"');
    expect(s).toContain("Revenue ▼");
    expect(s.match(/data-maya="sort"/g)).toHaveLength(3);
  });
  it("limit keeps the top N of the first measure", () => {
    expect(order(svg({ ...base, limit: 2 }))).toEqual(["Snacks", "Dairy"]);
  });
  it("draws only the rows that fit", () => {
    expect(order(svg(base, { height: 30 + 26 * 2 }))).toHaveLength(2);
  });
  it("nulls render a dash and no bar; a single y works", () => {
    const s = svg({
      type: "table",
      x: "a",
      y: "b",
      data: [
        { a: "x", b: null },
        { a: "y", b: 2 },
      ],
    });
    expect(keys(s)).toEqual(["b~y"]);
    expect(s).toContain(">–<");
  });
  it("hostile strings are escaped", () => {
    const s = svg({ type: "table", x: "a", y: "b", data: [{ a: '<img onerror=x>"', b: 1 }] });
    expect(s).not.toContain("<img");
    expect(s).toContain("&lt;img");
  });
  it("is deterministic and handles empty data", () => {
    expect(svg(base)).toBe(svg(base));
    expect(svg({ ...base, data: [] })).toContain('data-maya="empty"');
  });
  it("validates view.sortBy", () => {
    expect(() => svg(base, { view: { sortBy: ["rev", "up"] } })).toThrow();
  });
});

describe("sort reducer", () => {
  const s0: State = { view: {}, selected: [] };
  it("first click: measure desc, label asc; same field toggles", () => {
    const a = reduce(s0, { type: "sort", field: "rev" });
    expect(a.view.sortBy).toEqual(["rev", "desc"]);
    expect(reduce(a, { type: "sort", field: "rev" }).view.sortBy).toEqual(["rev", "asc"]);
    expect(reduce(s0, { type: "sort", field: "item", label: true }).view.sortBy).toEqual([
      "item",
      "asc",
    ]);
  });
  it("resets when x or y change, not on a data change", () => {
    const a = reduce(s0, { type: "sort", field: "rev" });
    expect(reduce(a, { type: "spec", prev: base, next: { ...base, data: [] } })).toBe(a);
    expect(
      reduce(a, { type: "spec", prev: base, next: { ...base, y: ["rev"] } }).view.sortBy,
    ).toBeUndefined();
    expect(
      reduce(a, { type: "spec", prev: base, next: { ...base, x: "units" } }).view.sortBy,
    ).toBeUndefined();
  });
});
