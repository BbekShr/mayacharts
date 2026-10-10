import { describe, it, expect } from "vitest";
import { render, validateSpec } from "../src/index.ts";
import { themes } from "../src/themes.ts";

const data = [
  { m: "Jan", s: "A", v: 1 },
  { m: "Jan", s: "B", v: 2 },
];

describe("mayacharts/themes", () => {
  for (const [name, theme] of Object.entries(themes)) {
    it(`${name} passes the CSS allowlist and reaches the markup`, () => {
      const spec = { type: "bar", x: "m", y: "v", series: "s", data, theme } as const;
      expect(() => validateSpec(spec)).not.toThrow();
      expect(render(spec)).toContain(`--maya-accent:${theme.accent}`);
      expect(render(spec)).toContain(`--maya-series-1:${theme.accent}`);
    });

    it(`${name} sets the accent and all seven other series slots, light and dark`, () => {
      const t: Record<string, string> = theme;
      // A pinned scheme needs one colour per slot; otherwise each is a light-dark pair.
      const one = t.scheme ? /^#[0-9a-f]{6}$/ : /^light-dark\(#[0-9a-f]{6},#[0-9a-f]{6}\)$/;
      for (const k of ["accent", ...[2, 3, 4, 5, 6, 7, 8].map((i) => `series${i}`)])
        expect(t[k]).toMatch(one);
    });
  }

  it("an accent override recolours series 1 under colors and series1", () => {
    const base = { type: "bar", x: "m", y: "v", series: "s", data } as const;
    expect(render({ ...base, theme: { accent: "#123456" } })).toContain("--maya-series-1:#123456");
    const kept = [
      render({ ...base, colors: ["#00ff00"], theme: { accent: "#123456" } }),
      render({ ...base, theme: { accent: "#123456", series1: "#00ff00" } }),
    ];
    // Colors replaces the accent's slot; series1 comes later, so it wins.
    expect(kept[0]).not.toContain("--maya-series-1:#123456");
    expect(kept[1]!.indexOf("--maya-series-1:#00ff00")).toBeGreaterThan(
      kept[1]!.indexOf("--maya-series-1:#123456"),
    );
  });
});
