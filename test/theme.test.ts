import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { css } from "../src/styles/theme.ts";

const lum = (hex: string) => {
  const c: number[] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
};
const pair = (name: string): [string, string] => {
  const m = css.match(new RegExp(`--maya-${name}:light-dark\\((#[0-9a-f]{3,6}),(#[0-9a-f]{6})\\)`));
  if (!m) throw new Error(name);
  const a = m[1]!;
  const l = a.length === 4 ? "#" + [...a.slice(1)].map((c) => c + c).join("") : a;
  return [l, m[2]!];
};

describe("theme css", () => {
  it("defines tokens and series rules", () => {
    for (const t of [
      "font",
      "font-size",
      "fg",
      "fg-muted",
      "grid",
      "bg",
      "accent",
      "radius",
      "tooltip-bg",
      "tooltip-fg",
      "focus",
    ])
      expect(css).toContain(`--maya-${t}:`);
    for (let n = 1; n <= 8; n++) expect(css).toContain(`--maya-series-${n}:`);
    for (let n = 0; n < 8; n++)
      expect(css).toContain(`[data-s="${n}"]{--c:var(--maya-series-${n + 1})}`);
  });
  it("meets WCAG contrast in both modes", () => {
    const bg = pair("bg");
    const fg = pair("fg");
    const mu = pair("fg-muted");
    for (const i of [0, 1] as const) {
      expect(ratio(fg[i], bg[i])).toBeGreaterThanOrEqual(7);
      expect(ratio(mu[i], bg[i])).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("gzips under 1200 bytes", () => {
    expect(gzipSync(css).length).toBeLessThan(1200);
  });
});
