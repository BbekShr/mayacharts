import { describe, expect, it } from "vitest";
import { render } from "../src/index.ts";
import "../src/stats.ts";
import "../src/hierarchy.ts";
import "../src/flow.ts";
import type { ChartSpec } from "../src/core/types.ts";

// The modules keep their row pass per data array (memo): a second render of the same rows must be
// byte-identical to the first, and to a render of a copy (cold).
const rows = Array.from({ length: 3000 }, (_, i) => ({
  a: ["N", "S", "E"][i % 3]!,
  b: ["x", "y"][i % 2]!,
  c: `c${i % 7}`,
  v: 1 + ((i * 37) % 101) + (i % 500 === 0 ? 400 : 0),
}));
const specs: ChartSpec[] = [
  { type: "boxplot", x: "a", y: "v", data: rows },
  { type: "sunburst", path: ["a", "b", "c"], y: "v", drill: true, data: rows },
  { type: "treemap", path: ["a", "b"], y: "v", data: rows },
  { type: "sankey", path: ["a", "b", "c"], y: "v", data: rows },
  { type: "beeswarm", x: "a", y: "v", data: rows.concat(rows, rows, rows) },
];

describe("module row-pass cache", () => {
  for (const s of specs)
    it(`${s.type}: warm render equals cold render`, () => {
      const first = render(s);
      expect(render(s)).toBe(first);
      expect(render({ ...s, data: [...s.data] })).toBe(first);
    });
});
