// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { columns, thoughtspot } from "../src/host.ts";

// Plain elements stand in for <maya-chart>: they record the spec and let a test fire maya-settled.
const fake = () => document.createElement("maya-chart") as any;
const settle = (el: Element) => el.dispatchEvent(new CustomEvent("maya-settled"));
beforeEach(() => (document.body.innerHTML = ""));

const table = {
  schema: [{ name: "Item Type" }, { name: "Total Sales" }, { name: "Region" }],
  data: [
    ["Shirts", 10, "N"],
    ["Hats", 4, "S"],
  ],
};

describe("host adapters", () => {
  it("columns: rows, regex and case-insensitive fields, format keys; unknown stays", () => {
    const el = columns(
      table,
      {
        type: "bar",
        x: /item/i,
        y: "total sales",
        series: /nope/,
        format: { "TOTAL SALES": "currency" } as never,
        tooltip: { fields: [/region/i] },
      },
      fake(),
    );
    expect(el.spec).toEqual({
      type: "bar",
      x: "Item Type",
      y: "Total Sales",
      series: "nope",
      format: { "Total Sales": "currency" },
      tooltip: { fields: ["Region"] },
      data: [
        { "Item Type": "Shirts", "Total Sales": 10, Region: "N" },
        { "Item Type": "Hats", "Total Sales": 4, Region: "S" },
      ],
    });
  });

  it("columns: y arrays, was.by, path; finds or creates #chart", () => {
    const el = columns(table, {
      type: "bar",
      y: [/sales/i],
      was: { by: /region/i },
      path: [/item/i],
    });
    expect(el.id).toBe("chart");
    expect(el.parentElement).toBe(document.body);
    expect((el.spec as any).y).toEqual(["Total Sales"]);
    expect((el.spec as any).was).toEqual({ by: "Region" });
    expect(columns(table, { type: "bar", y: "Total Sales" })).toBe(el);
  });

  it("thoughtspot: live, wrapped cells, completion once on the first draw or settle", () => {
    let done = 0;
    const viz = {
      getDataFromSearchQuery: () => ({
        getData: () => ({
          schema: [{ name: "A" }, { name: "B" }],
          data: [[{ value: () => "x" }, { value: 3 }]],
        }),
      }),
      events: { emitRenderCompletedEvent: () => done++ },
    };
    const el = thoughtspot(viz, { type: "bar", x: "a", y: "b" }, fake());
    expect((el.spec as any).data).toEqual([{ A: "x", B: 3 }]);
    expect(done).toBe(0);
    el.dispatchEvent(new CustomEvent("maya-render"));
    expect(done).toBe(1); // drawn: no wait for the entrance animation
    settle(el);
    el.dispatchEvent(new CustomEvent("maya-render"));
    expect(done).toBe(1);
  });

  it("thoughtspot: no viz, missing search or empty data complete with empty rows", () => {
    let done = 0;
    const events = { emitRenderCompletedEvent: () => done++ };
    const empty = { getDataFromSearchQuery: () => ({ getData: () => ({ schema: [], data: [] }) }) };
    for (const viz of [
      undefined,
      { events },
      { getDataFromSearchQuery: () => undefined, events },
      { ...empty, events },
    ]) {
      const el = thoughtspot(viz, { type: "bar", x: "a", y: "b" }, fake());
      expect((el.spec as any).data).toEqual([]);
      settle(el);
    }
    expect(done).toBe(3);
  });
});

describe("host colorBy", () => {
  it("resolves a plain colorBy field case-insensitively and leaves goal keys alone", () => {
    const t = { schema: ["Item", "Sales", "Target"], data: [["a", 1, 2]] };
    expect(
      (columns(t, { type: "bar", x: "item", y: "sales", colorBy: "target" }).spec as any).colorBy,
    ).toBe("Target");
    expect(
      (columns(t, { type: "bar", x: "item", y: "sales", colorBy: { target: 1 } }).spec as any)
        .colorBy,
    ).toEqual({ target: 1 });
    expect(
      (columns(t, { type: "kpi", y: ["sales"], colorBy: { sales: { target: 1 } } }).spec as any)
        .colorBy,
    ).toEqual({ Sales: { target: 1 } });
  });
});

describe("host cells", () => {
  it("unwraps DataModel { v } cells", () => {
    const el = columns(
      { schema: [{ name: "Item" }, { name: "Sales" }], data: [[{ v: "a" }, { v: 3 }]] },
      { type: "bar", x: "item", y: "sales" },
    );
    expect((el.spec as any).data).toEqual([{ Item: "a", Sales: 3 }]);
  });
});
