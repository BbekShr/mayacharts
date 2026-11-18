import { createHash } from "node:crypto";
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
  it("at 280 px drops the rightmost columns that cannot hold their values, never two values touching", () => {
    const y = ["sales", "units", "price", "cost", "profit"];
    const row = {
      item: "Hats",
      sales: 137273,
      units: 105.52,
      price: 4521.5,
      cost: 90210,
      profit: 4420,
    };
    const s = svg({ ...base, y, data: [row] }, { width: 280, height: 200 });
    const cols = new Set(keys(s).map((k) => k.split("~")[0]));
    expect(cols.size).toBeGreaterThanOrEqual(1);
    expect(cols.size).toBeLessThan(5);
    expect([...cols]).toEqual(y.slice(0, cols.size)); // rightmost go first
    const xs = [...s.matchAll(/<text data-key="v~[^"]*" x="([\d.]+)" y/g)].map((m) => +m[1]!);
    for (let i = 1; i < xs.length; i++) expect(xs[i]! - xs[i - 1]!).toBeGreaterThan(40);
    expect(
      svg({ ...base, y, data: [row] }, { width: 900, height: 200 }).match(/data-key="v~/g),
    ).toHaveLength(5);
  });
  it("a column narrower than its padding draws no negative bar", () => {
    const y = ["a", "b", "c", "d", "e", "f"];
    const wide = Object.fromEntries(y.map((k, i) => [k, i + 1]));
    expect(svg({ ...base, y, data: [{ item: "x", ...wide }] }, { width: 60 })).not.toMatch(
      /width="-/,
    );
  });
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
  it("prints negatives with U+2212 in every drawn cell, delta and tooltip; names and the data table keep their hyphen", () => {
    const rows = [
      { item: "A-B", m: "Jan", rev: -40.5, units: -7, ch: -2 },
      { item: "A-B", m: "Feb", rev: -40.5, units: -7, ch: 4 },
      { item: "Dairy", m: "Jan", rev: 60, units: 9, ch: 1 },
      { item: "Dairy", m: "Feb", rev: 60, units: 9, ch: 3 },
    ];
    const spec = {
      type: "table",
      x: "item",
      y: ["rev", "units"],
      bars: { rev: "diverging" },
      cells: { Form: { type: "strip", field: "ch", by: "m" } },
      data: rows,
    } as ChartSpec;
    const out = renderParts(spec, { width: 640, height: 300 });
    const printed = [...out.svg.matchAll(/data-f="([^"]*)"|data-key="v~[^>]*>([^<]*)</g)].map(
      (m) => m[1] ?? m[2],
    );
    expect(printed.length).toBeGreaterThan(8);
    expect(out.svg).toContain(">−81<");
    expect(out.svg).toContain(">−14<");
    expect(out.svg).toContain('data-f="−2"');
    expect(printed.join("|")).not.toMatch(/-\d/);
    expect(out.svg).not.toMatch(/data-f="-\d/);
    expect(out.table).toContain("-81"); // the data table keeps "-", like every other mark's
    expect(out.svg).toContain(">A-B<");
    // positive-only output is unchanged (sha1 of the render before the fix)
    const pos = renderParts(
      {
        type: "table",
        x: "item",
        y: ["rev", "units"],
        data: [
          { item: "A-B", rev: 40, units: 7 },
          { item: "Snacks", rev: 90, units: 3 },
        ],
      },
      { width: 480, height: 300 },
    ).svg;
    expect(createHash("sha1").update(pos).digest("hex")).toBe(
      "aee578caab709687600db2279bd17b8fc04b99ca",
    );
  });

  it("swaps only the sign hyphen for U+2212, never one in an affix", () => {
    const cell = (v: number, format: ChartSpec["format"], locale?: string) =>
      renderParts(
        {
          type: "table",
          x: "item",
          y: ["rev"],
          data: [{ item: "A", rev: v }],
          format,
          ...(locale ? { locale } : {}),
        } as ChartSpec,
        { width: 480, height: 300 },
      ).svg;
    expect(cell(-5, { rev: "Net-{value}" })).toContain(">Net-−5<");
    expect(cell(-5, { rev: { prefix: "USD-" } })).toContain(">USD-−5<");
    expect(cell(-5, { rev: "{value:integer} e-x" }, "sv")).toContain(">−5 e-x<");
    expect(cell(-0.0001, { rev: "{value} per-unit" })).toContain(">−0.0001 per-unit<");
    expect(cell(-5, { rev: "-${value}" })).not.toContain(">--");
  });
});
