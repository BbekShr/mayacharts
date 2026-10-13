import { describe, expect, it } from "vitest";
import { reduce } from "../src/element/brush.ts";
import { reduce as sel } from "../src/element/select.ts";
import type { ChartSpec, State } from "../src/core/types.ts";

const S: State = { view: {}, selected: [] };
const sp = (extra: object = {}) =>
  ({ type: "parallel", x: "m", y: ["a", "b"], brush: true, data: [], ...extra }) as ChartSpec;

describe("brush reducer", () => {
  it("orders, replaces per field, ANDs several, clears one or all", () => {
    const a = reduce(S, { type: "brush", field: "a", lo: 9, hi: 2 });
    expect(a.view.brush).toEqual([["a", 2, 9]]);
    const b = reduce(reduce(a, { type: "brush", field: "b", lo: 1, hi: 2 }), {
      type: "brush",
      field: "a",
      lo: 3,
      hi: 4,
    });
    expect(b.view.brush).toEqual([
      ["b", 1, 2],
      ["a", 3, 4],
    ]);
    expect(reduce(b, { type: "clear", field: "b" }).view.brush).toEqual([["a", 3, 4]]);
    expect(reduce(b, { type: "clear" }).view).toEqual({});
    expect(reduce(S, { type: "clear" })).toBe(S);
  });
  it("drops on x/type change or when brush goes off, else keeps", () => {
    const a = reduce(S, { type: "brush", field: "a", lo: 1, hi: 2 });
    const ev = (n: object) => ({ type: "spec" as const, prev: sp(), next: sp(n) });
    expect(reduce(a, ev({ x: "z" })).view.brush).toBeUndefined();
    expect(reduce(a, ev({ brush: false })).view.brush).toBeUndefined();
    expect(reduce(a, ev({ title: "t" }))).toBe(a);
  });
});

describe("select peers reducer", () => {
  const t = { type: "toggle" as const, sel: { x: "k" }, multi: false };
  it("sets peers with the selection and drops them with it", () => {
    const a = sel(S, { ...t, peer: "x" });
    expect(a.view.peers).toBe("x");
    expect(sel(a, { ...t, peer: "x" }).view).toEqual({}); // toggled off
    expect(sel(a, { type: "clear" }).view).toEqual({});
    expect(sel(S, t).view).toEqual({});
  });
});
