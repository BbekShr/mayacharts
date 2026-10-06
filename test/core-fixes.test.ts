import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { render, renderParts, renderShell, version } from "../src/index.ts";
import { nf } from "../src/core/format.ts";
import { shape, thin } from "../src/core/shape.ts";
import { resolve, MayaSpecError } from "../src/core/validate.ts";
import "../src/flow.ts";
import type { ChartSpec } from "../src/core/types.ts";

const T0 = Date.UTC(2020, 0, 1);

describe("time reduction pins", () => {
  it("an alternating-null line keeps its spike", () => {
    const data = Array.from({ length: 5000 }, (_, i) => ({
      d: new Date(T0 + i * 864e5).toISOString().slice(0, 10),
      v: i === 2501 ? 1e6 : i % 2 ? i % 90 : null,
    }));
    const s = shape(resolve({ type: "line", x: "d", y: "v", data, width: 300 } as ChartSpec));
    expect(s.reduced).not.toBeNull();
    expect(s.cells.map((c) => c.value)).toContain(1e6);
  });
  it("a long kpi sparkline keeps its global min and max", () => {
    const vals = Array.from({ length: 5000 }, (_, i) =>
      i === 1777 ? -500 : i === 3333 ? 900 : i % 2 ? i % 90 : null,
    );
    const idx = thin([vals], 24);
    expect(idx.length).toBeLessThanOrEqual(24);
    expect(idx).toContain(1777);
    expect(idx).toContain(3333);
    expect(idx).toContain(0);
    expect(idx).toContain(4999);
    const data = vals.map((v, i) => ({
      d: new Date(T0 + i * 864e5).toISOString().slice(0, 10),
      v,
    }));
    const svg = render({ type: "kpi", x: "d", y: "v", data } as ChartSpec, {
      width: 360,
      height: 160,
    });
    expect(svg).toContain("<path");
  });
});

describe("version", () => {
  it("matches package.json", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    expect(version).toBe(pkg.version);
  });
});

describe("repeated names", () => {
  const rows = ["3", "3", "3#2", "3"].map((name, i) => ({ name, x: i, y: i % 2 }));
  for (const type of ["scatter", "beeswarm"] as const)
    it(`${type} keys stay unique`, () => {
      const spec = (
        type === "scatter"
          ? { type, x: "x", y: "y", name: "name", data: rows }
          : { type, x: "name", y: "y", name: "name", data: rows }
      ) as ChartSpec;
      const keys = [...renderParts(spec).svg.matchAll(/data-key="([^"]+)"/g)].map((m) => m[1]);
      expect(keys.length).toBeGreaterThanOrEqual(4);
      expect(new Set(keys).size).toBe(keys.length);
    });
});

describe("format option cache", () => {
  it("drops unknown and BigInt options", () => {
    const spec = {
      type: "bar",
      x: "a",
      y: "b",
      data: [{ a: "p", b: 1.234 }],
      format: { b: { maximumFractionDigits: 1, z: 1n } },
    } as unknown as ChartSpec;
    expect(() => render(spec)).not.toThrow();
  });
  it("the cache is flushed past 200 entries, so junk options cannot grow it", () => {
    const junk = (i: number) => nf("en-US", { maximumFractionDigits: 1, ["j" + i]: i } as never);
    const a = junk(0);
    expect(junk(0)).toBe(a);
    for (let i = 1; i < 500; i++) junk(i);
    expect(junk(0)).not.toBe(a);
  });
});

describe("renderShell overrides", () => {
  it("rides in the style element, not a style attribute", () => {
    const html = renderShell({
      type: "bar",
      x: "a",
      y: "b",
      data: [{ a: "p", b: 1 }],
      theme: { accent: "#ff0000" },
      colors: ["#00ff00"],
    });
    expect(html).not.toContain(" style=");
    expect(html).toMatch(
      /<style>[^]*\.maya\{--maya-series-1:#00ff00;[^}]*--maya-accent:#ff0000;\}[^]*<\/style>/,
    );
  });
});

describe("chord drill and css allowlist", () => {
  it("chord rejects drill", () => {
    const data = [{ a: "x", b: "y", v: 1 }];
    try {
      render({ type: "chord", path: ["a", "b"], y: "v", drill: true, data } as ChartSpec);
      expect.unreachable();
    } catch (e) {
      expect((e as MayaSpecError).code).toBe("option-unsupported");
    }
  });
  it("comment sequences are not safe css", () => {
    for (const accent of ["red/*", "red*/"])
      expect(() =>
        render({ type: "bar", x: "a", y: "b", data: [{ a: "p", b: 1 }], theme: { accent } }),
      ).toThrow(/unsafe/);
  });
});
