import { describe, expect, it } from "vitest";
import { render, renderParts } from "../src/index.ts";
import "../src/units.ts";
import type { ChartSpec } from "../src/core/types.ts";

const data = Array.from({ length: 40 }, (_, i) => ({
  id: `c${i}`,
  g: ["A", "B", "C"][i % 3]!,
  v: 10 + ((i * 37) % 90),
}));
const spec: ChartSpec = { type: "units", x: "g", y: "v", name: "id", data };
const dots = (s: string) => [...s.matchAll(/<circle data-maya="mark"[^>]*>/g)].map((m) => m[0]);
const attr = (tag: string, a: string) => new RegExp(` ${a}="([^"]*)"`).exec(tag)?.[1];
const form = (s: ChartSpec, i: number) => render(s, { width: 640, height: 360, view: { form: i } });

describe("units", () => {
  it("draws one circle per row, keyed u~NAME, with the same keys in every form", () => {
    const keys = [0, 1, 2].map((i) => dots(form(spec, i)).map((d) => attr(d, "data-key")));
    expect(keys[0]).toHaveLength(40);
    expect(keys[0]![0]).toBe("u~c0");
    expect(keys[1]).toEqual(keys[0]);
    expect(keys[2]).toEqual(keys[0]);
  });

  it("moves the dots between forms and draws axes in the swarm only", () => {
    const at = (i: number) => dots(form(spec, i)).map((d) => attr(d, "cx") + "," + attr(d, "cy"));
    expect(at(0)).not.toEqual(at(1));
    expect(at(1)).not.toEqual(at(2));
    expect(form(spec, 0)).not.toContain('axis-x"><text');
    expect(form(spec, 2)).toContain('axis-x"><text');
    expect(form(spec, 1)).toContain("Each dot is one id");
  });

  it("is deterministic", () => {
    expect(form(spec, 2)).toBe(form(spec, 2));
  });

  it("keys by row index without a name field and by name%232 for repeats", () => {
    const { name: _n, ...bare } = spec as ChartSpec & { name?: string };
    expect(dots(render(bare as ChartSpec)).map((d) => attr(d, "data-key"))[3]).toBe("u~3");
    const dup = render({ ...spec, data: [data[0]!, data[0]!] });
    expect(dots(dup).map((d) => attr(d, "data-key"))).toEqual(["u~c0", "u~c0%232"]);
  });

  it("colours by group: data-s is the group slot, data-x the name", () => {
    const d = dots(form(spec, 0));
    expect(attr(d[1]!, "data-s")).toBe("1");
    expect(attr(d[1]!, "data-x")).toBe("c1");
    expect(attr(d[1]!, "data-series")).toBe("B");
  });

  it("honours forms and clamps view.form", () => {
    const two: ChartSpec = { ...spec, forms: ["swarm", "waffle"] };
    expect(form(two, 0)).toContain('axis-x"><text');
    expect(form(two, 9)).not.toContain('axis-x"><text');
    expect(renderParts(two, { width: 640, height: 360 }).controls).toContain('data-maya="form"');
  });

  it("applies colorBy", () => {
    const out = render({ ...spec, colorBy: "v" }, { width: 640, height: 360 });
    expect(dots(out).every((d) => d.includes("data-q="))).toBe(true);
  });

  it("escapes hostile strings", () => {
    const evil = `"><script>alert(1)</script>`;
    const out = render({
      ...spec,
      title: evil,
      data: [
        { id: evil, g: evil, v: 1 },
        { id: "b", g: `<img onerror=x>`, v: 2 },
      ],
    });
    expect(out).not.toContain("<script>");
    expect(out).not.toContain("<img");
    expect(dots(out)).toHaveLength(2);
  });

  it("handles empty data, one row and Arabic names", () => {
    expect(() => render({ ...spec, data: [] })).not.toThrow();
    expect(dots(render({ ...spec, data: [data[0]!] }))).toHaveLength(1);
    expect(dots(form({ ...spec, data: [data[0]!] }, 2))).toHaveLength(1);
    const ar = render({ ...spec, data: [{ id: "عميل", g: "شمال", v: 3 }] });
    expect(ar).toContain("شمال");
  });

  it("fails above 1500 rows with a clear message", () => {
    const big = Array.from({ length: 1501 }, (_, i) => ({ id: i, g: "A", v: i }));
    expect(() => render({ ...spec, data: big })).toThrow(/1501 rows exceed the limit of 1500/);
    const ok = render({ ...spec, data: big.slice(0, 1500) }, { width: 640, height: 360 });
    expect(dots(ok)).toHaveLength(1500);
  });

  it("renders with no window or document", async () => {
    const { window: w, document: d } = globalThis as Record<string, unknown>;
    delete (globalThis as Record<string, unknown>).window;
    delete (globalThis as Record<string, unknown>).document;
    try {
      expect(dots(render(spec))).toHaveLength(40);
    } finally {
      Object.assign(globalThis, { window: w, document: d });
    }
  });
});
