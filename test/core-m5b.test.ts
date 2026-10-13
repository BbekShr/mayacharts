import { describe, expect, it } from "vitest";
import { renderParts } from "../src/core/render.ts";
import "../src/hierarchy.ts";
import type { ChartSpec } from "../src/core/types.ts";

const P = (s: object, view?: object) =>
  renderParts(s as ChartSpec, { width: 520, height: 320, ...(view && { view }) } as never);

describe("M5 core leftovers", () => {
  it("a drilled marimekko has no slot legend; the root keeps it", () => {
    const data = ["E", "W"].flatMap((region) =>
      ["Tops", "Shoes"].flatMap((family) =>
        ["a", "b"].map((item, i) => ({ region, family, item, sales: 10 + i })),
      ),
    );
    const spec = {
      type: "marimekko",
      path: ["region", "family", "item"],
      y: "sales",
      drill: true,
      data,
    };
    expect(P(spec).legend).toContain("maya-legend");
    expect(P(spec, { drill: ["W"] }).legend).toBe("");
  });
  it("heatmap column headers that drill further end in a chevron; the last level does not", () => {
    const data = ["N", "S"].flatMap((region) =>
      ["a", "b"].flatMap((family) =>
        ["x", "y"].flatMap((product) =>
          ["t1", "t2"].map((itemType, k) => ({ region, family, product, itemType, v: 1 + k })),
        ),
      ),
    );
    const spec = {
      type: "heatmap",
      path: ["region", "itemType"],
      xPath: ["family", "product"],
      y: "v",
      drill: true,
      data,
    };
    expect(P(spec).svg).toMatch(/data-maya="axis-x".*a ›/);
    const leaf = P(spec, { xDrill: ["a"] }).svg;
    expect(leaf.match(/data-maya="axis-x".*?<\/g>/)![0]).not.toContain("›");
  });
  it("the kpi back face does not build Other", () => {
    const months = Array.from({ length: 6 }, (_, i) => ({ month: `m${i}`, sales: 10 + i }));
    const spec = {
      type: "kpi",
      x: "month",
      y: "sales",
      data: months,
      back: { type: "bar", x: "month", y: "sales", horizontal: true, sort: "desc", limit: 3 },
    };
    expect(P(spec, { face: "back" }).svg).not.toContain("Other");
  });
  it("rowsOf is a text key", async () => {
    const { TEXT } = await import("../src/core/strings.ts");
    expect(TEXT.rowsOf).toBe("{0} of {1}");
  });
});
