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

// oklch -> linear sRGB (clamped), and oklab mixing for the ramp.
const oklab = (L: number, C: number, h: number) =>
  [L, C * Math.cos((h * Math.PI) / 180), C * Math.sin((h * Math.PI) / 180)] as const;
const toRgb = ([L, a, b]: readonly number[]) => {
  const [l, m, s] = [
    L! + 0.3963377774 * a! + 0.2158037573 * b!,
    L! - 0.1055613458 * a! - 0.0638541728 * b!,
    L! - 0.0894841775 * a! - 1.291485548 * b!,
  ].map((v) => v ** 3) as [number, number, number];
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => Math.min(1, Math.max(0, v)));
};
const Y = (c: number[]) => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
const rat = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const lin = (hex: string) =>
  [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
const toLab = ([r, g, b]: number[]) => {
  const [l, m, s] = [
    0.4122214708 * r! + 0.5363325363 * g! + 0.0514459929 * b!,
    0.2119034982 * r! + 0.6806995451 * g! + 0.1073969566 * b!,
    0.0883024619 * r! + 0.2817188376 * g! + 0.6299787005 * b!,
  ].map(Math.cbrt) as [number, number, number];
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
};
const oklch = (name: string) => {
  const m = css.match(new RegExp(`--maya-${name}:oklch\\(([\\d.]+) ([\\d.]+) ([\\d.]+)\\)`));
  if (!m) throw new Error(name);
  return [+m[1]!, +m[2]!, +m[3]!] as const;
};
const BGS = [lin("#ffffff"), lin("#0d1117")] as const;

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
      expect(css).toContain(`[data-s="${n}"]{--c:var(--maya-series-${n + 1});--h:var(--h${n})}`);
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
  it("series colours reach 3:1 on white and on dark", () => {
    for (let n = 1; n <= 8; n++) {
      const c = toRgb(oklab(...oklch(n === 1 ? "accent" : `series-${n}`)));
      for (const bg of BGS) expect(rat(Y(c), Y(bg)), `series ${n}`).toBeGreaterThanOrEqual(3);
    }
  });
  it("good/bad tones reach 3:1 in both modes", () => {
    for (const t of ["good", "bad"]) {
      const [l, d] = pair(t);
      expect(ratio(l, "#ffffff")).toBeGreaterThanOrEqual(3);
      expect(ratio(d, "#0d1117")).toBeGreaterThanOrEqual(3);
    }
  });
  it("the warn tone (a var fallback, so theme.warn overrides it) reaches 4.5:1 in both modes", () => {
    const m = css.match(
      /\[data-tone=warn\]\{--c:var\(--maya-warn,light-dark\(#(\w{3}),#(\w{3})\)\)\}/,
    );
    const six = (h: string) => "#" + [...h].map((c) => c + c).join("");
    expect(ratio(six(m![1]!), "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(ratio(six(m![2]!), "#0d1117")).toBeGreaterThanOrEqual(4.5);
  });
  it("ramp: 10 steps from a 35% floor; upper steps reach 3:1", () => {
    const q = [...css.matchAll(/\[data-q="(\d)"\]\{--q:(\d+)%;--u:([\d.]+)\}/g)].map((m) => +m[2]!);
    expect(q).toHaveLength(10);
    expect(q[0]).toBe(35);
    expect(q[9]).toBe(100);
    expect(css).toContain(
      "--rl:var(--maya-ramp-low,color-mix(in oklab,var(--maya-accent) var(--fl,35%),var(--b)))",
    );
    expect(css).toContain(
      "--b:light-dark(var(--maya-bg),color-mix(in oklab,var(--maya-accent) 15%,var(--maya-bg)))",
    );
    const acc = toLab(toRgb(oklab(...oklch("accent"))));
    // ponytail: only steps >= 8 are asserted; lighter steps are never colour alone (labels, table).
    for (const bg of BGS)
      for (const n of [8, 9]) {
        const b = toLab(bg as unknown as number[]);
        const mix = acc.map((v, i) => (v * q[n]!) / 100 + b[i]! * (1 - q[n]! / 100));
        const rgb = [0, 1, 2].map((i) => Math.min(1, Math.max(0, toRgb(mix)[i]!)));
        expect(rat(Y(rgb), Y(bg as unknown as number[])), `step ${n}`).toBeGreaterThanOrEqual(3);
      }
  });
  it("unlabelled ramp marks carry a 3:1 outline (heatmap rect, hexes) and ghost bars a 3:1 stroke", () => {
    expect(css).toContain("rect[data-hm]{stroke:color-mix(in oklab,var(--c) 70%,var(--maya-bg))");
    expect(css).toContain("stroke:var(--maya-accent);stroke-width:1.5;stroke-linejoin:round");
    const acc = toRgb(oklab(...oklch("accent")));
    for (const bg of BGS) expect(rat(Y(acc), Y(bg))).toBeGreaterThanOrEqual(3);
    const op = +css.match(/\[data-past\]\{[^}]*stroke-opacity:([.\d]+)/)![1]!;
    // Alpha blends in gamma space: mix the hex channels, then linearise.
    for (const [bg, fg] of [
      ["#ffffff", "#1f2328"],
      ["#0d1117", "#e6edf3"],
    ] as const) {
      const hex = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16);
      const m = [1, 3, 5].map((i) => hex(fg, i) * op + hex(bg, i) * (1 - op));
      const c = "#" + m.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
      expect(ratio(c, bg)).toBeGreaterThanOrEqual(3);
    }
  });
  it("density cells: every step reaches 3:1 against the page", () => {
    const acc = toLab(toRgb(oklab(...oklch("accent"))));
    const [bgShare, slope] = css
      .match(/max\(0%,calc\((\d+)% - \(var\(--q\) - 35%\)\*([.\d]+)\)\)/)!
      .slice(1)
      .map(Number) as [number, number];
    const mix = (a: number[], b: number[], p: number) =>
      a.map((v, i) => (v * p) / 100 + b[i]! * (1 - p / 100));
    for (const [bg, fg] of [
      [lin("#ffffff"), lin("#1f2328")],
      [lin("#0d1117"), lin("#e6edf3")],
    ] as const)
      for (let n = 0; n < 10; n++) {
        const q = Math.round(35 + (n * 65) / 9);
        const ink = Math.min(75, Math.max(0, (q - 67) * 2.3));
        const c = mix(toLab(bg), mix(toLab(fg), acc, ink), Math.max(0, bgShare - (q - 35) * slope));
        expect(rat(Y(toRgb(c)), Y(bg)), `step ${n}`).toBeGreaterThanOrEqual(3);
      }
  });
  it("has the hooks, forced-colors, contrast and motion blocks", () => {
    for (const h of [
      "[data-tone=good]",
      "[data-other]",
      ".maya-ctl",
      ".maya-crumbs",
      ".maya-reset",
      ".maya-err",
      "[data-maya=brush]",
      "[data-maya=cross] line",
      "[data-maya=link]",
      "[data-depth]",
      "[data-selected]",
      "[data-maya=labels],[data-maya=cross],[data-maya=band]{pointer-events:none}",
      "[data-maya=marks][data-hot] [data-maya=mark]:not([data-active],[data-lit],text,:is(rect,path)[data-q],[data-kpi=fill],",
      "@media (forced-colors:active)",
      "@media (prefers-contrast:more)",
      "@media (prefers-reduced-motion:reduce){*{transition:none!important}}",
      ".maya-svg{direction:ltr",
      "unicode-bidi:plaintext",
      "tabular-nums",
      "transition:opacity .2s",
    ])
      expect(css, h).toContain(h);
    expect(css).not.toContain("style=");
  });
  it("gzips under 7110 bytes", () => {
    expect(gzipSync(css).length).toBeLessThan(7110);
  });
  it("narrow containers compact the legend, never hide it", () => {
    expect(css).toContain(
      "@container (max-width:320px){.maya-legend{font-size:var(--maya-legend-size,11px)",
    );
    expect(css).not.toContain("display:none}.maya-title");
  });
});

describe("orbit and ghost rules", () => {
  it("orbit motion sits inside the no-preference media query", () => {
    const i = css.indexOf("@keyframes maya-orbit");
    const m = css.lastIndexOf("@media (prefers-reduced-motion:no-preference){", i);
    expect(i).toBeGreaterThan(0);
    expect(m).toBeGreaterThan(-1);
    expect(css.indexOf("animation:maya-orbit")).toBeGreaterThan(m);
    expect(css.slice(0, m)).not.toContain("animation:maya-orbit");
    expect(css).toContain(".maya:not([data-still]) g[data-v]");
  });
  it("styles the bar ghost", () => {
    expect(css).toContain("[data-past]{fill:var(--maya-ghost,var(--maya-fg))");
  });
  it("colours constellation stars with the legend ramp and isolates legend numbers", () => {
    expect(css).toContain('circle[data-key^="c~"][data-q]');
    expect(css).toContain("[data-maya=ramp] span{unicode-bidi:plaintext}");
  });
  it("heatmap cells use the generic ramp and its legend and ink match", () => {
    expect(css).toContain(
      "[data-maya=labels] [data-ink=a]{fill:color(from var(--c,var(--maya-series-1)) xyz-d65",
    );
    expect(css).toContain(
      "[data-maya=ramp] i{flex:none;width:80px;height:8px;background:linear-gradient(90deg,var(--rl),var(--rm),var(--rh))",
    );
  });
  it("orbit names light with their planet through data-lit", () => {
    expect(css).toContain(
      "g[data-s]:not([data-lit],:has([data-active])) :is(g[data-up],[data-trail])",
    );
  });
});

describe("M2 tokens", () => {
  it("the default ramp is the accent ramp: low, mid, high stops reproduce q% of the accent at every step", () => {
    // Accent share of the low stop (35% over --b), the 50% mix and the high stop, as the CSS mixes them.
    const [L, H] = [0.35, 1];
    for (let n = 0; n < 10; n++) {
      const u = +(n / 9).toFixed(4);
      const [wm, wh] = [Math.min(1, u * 2), Math.max(0, u * 2 - 1)];
      const share = wh * H + (1 - wh) * (wm * ((L + H) / 2) + (1 - wm) * L);
      expect(share).toBeCloseTo((35 + (n * 65) / 9) / 100, 2);
    }
    expect(css).toContain("--rm:var(--maya-ramp-mid,color-mix(in oklab,var(--rh),var(--rl)))");
    expect(css).toContain("--fl:48%");
  });
  it("type scale, numeric and cell tokens fall back to today's values", () => {
    for (const t of [
      "font-size:var(--maya-subtitle-size,inherit)",
      "font-size:var(--maya-legend-size,inherit)",
      "font-size:var(--maya-label-size,11px)",
      "font-size:var(--maya-label-size,inherit)",
      "text[data-hero]{font-weight:var(--maya-hero-weight,600)}",
      "[data-maya=empty]{font-size:var(--maya-empty-size,revert-layer)}",
      "font-variant-numeric:var(--maya-numeric,tabular-nums)",
      "rx:var(--maya-cell-radius,var(--maya-radius))",
      "stroke-width:var(--maya-line-emphasis,calc(var(--maya-line,2.25)*1.75))",
    ])
      expect(css, t).toContain(t);
    expect(css).not.toMatch(/font-variant-numeric:tabular-nums/);
  });
  it("direction, waterfall and neutral tokens", () => {
    for (const t of [
      ":is(svg,[data-maya=tone])[data-sign] [data-tone=good]{--c:var(--maya-up,var(--maya-good))}",
      ":is(svg,[data-maya=tone])[data-sign] [data-tone=bad]{--c:var(--maya-down,var(--maya-bad))}",
      "[data-way=up]{--c:var(--maya-up,var(--maya-series-1))}",
      "svg[data-plot] [data-way=total]{--c:var(--maya-total,var(--maya-fg-muted))}",
      "[data-other],[data-neu]{--c:var(--maya-neutral,var(--maya-fg-muted))}",
    ])
      expect(css, t).toContain(t);
  });
  it("a colors map key beats a tone: one rule per slot, after the tones", () => {
    for (let n = 0; n < 8; n++) {
      const rule = `svg[data-mapped~="${n}"] [data-s="${n}"][data-tone]{--c:var(--maya-series-${n + 1})}`;
      expect(css).toContain(rule);
      expect(css.indexOf(rule)).toBeGreaterThan(
        css.indexOf("[data-tone=bad]{--c:var(--maya-bad)}"),
      );
    }
  });
  it("tints (data-lt 0..7) work on any mark through --c", () => {
    for (let n = 0; n < 8; n++) {
      expect(css).toContain(
        `[data-s="${n}"][data-lt]{--c:color-mix(in oklab,var(--maya-series-${n + 1}) var(--t,100%),var(--maya-fg))}`,
      );
      expect(css).toContain(`[data-lt="${n}"]{--t:${100 - n * 7}%}`);
    }
  });
  it("tints only add contrast: each step mixes toward the ink, and the contrast floor holds in both schemes", () => {
    // Series slots as shipped (oklch), mixed in oklab toward --maya-fg by the same percentages as the stylesheet.
    const S = [
      oklab(0.6, 0.17, 255),
      oklab(0.66, 0.16, 50),
      oklab(0.62, 0.15, 160),
      oklab(0.66, 0.17, 330),
    ];
    for (const [fg, bg] of [
      ["#1f2328", "#ffffff"],
      ["#e6edf3", "#0d1117"],
    ] as const) {
      const f = toLab(lin(fg));
      for (const c of S) {
        let last = 0;
        for (let n = 0; n < 8; n++) {
          const t = (100 - n * 7) / 100;
          const k = rat(Y(toRgb(c.map((v, i) => v * t + f[i]! * (1 - t)))), Y(lin(bg)));
          expect(k).toBeGreaterThanOrEqual(3);
          expect(k).toBeGreaterThanOrEqual(last - 1e-9);
          last = k;
        }
      }
    }
  });
  it("labelInk and labelInkOnFill reach the inks that have no relative colours", () => {
    expect(css).toContain("fill:var(--maya-label-ink,#12161c)");
    // The name render.ts writes for theme.labelInkOnFill.
    expect(css).toContain("fill:var(--maya-label-ink-on-fill,var(--maya-bg))");
  });
  it("brush and peers CSS ends the stylesheet", () => {
    expect(css).toContain("[data-off]{opacity:.12}");
    expect(css.endsWith("pointer-events:none}")).toBe(true);
  });
  it("styles the flip button, the stack control row, the card turn and the roll clip", () => {
    expect(css).toContain(".maya-flip[aria-pressed=true]");
    expect(css).toContain(".maya-ctls{display:flex");
    expect(css).toContain("backface-visibility:hidden");
    expect(css).toContain("svg[data-roll]{overflow:hidden}");
  });
});
