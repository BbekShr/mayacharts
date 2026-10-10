/*
 * mayacharts/themes: ready-made values for `spec.theme`. Plain data, no code and no imports
 * beyond types, so it costs nothing unless imported and works in any build:
 *   chart.spec = { ...spec, theme: themes.ocean };
 * Colours are `light-dark(light, dark)`, so a theme follows the page's color-scheme. Each
 * order was chosen so neighbouring series stay apart for colourblind readers: adjacent
 * protan and deutan separation of at least 8 and normal-vision separation of at least 15
 * (OKLab x100, the dataviz palette checks), in light on #fff and in dark on #0d1117, with the
 * first and third slots held to the same floor. Saturated slots may sit outside the dataviz
 * lightness band or below 3:1 on the background, as in the default; the legend, direct
 * labels and the data table carry identity there.
 * Spread one to change a token: `theme: { ...themes.pop, radius: "0px" }`.
 */
import type { ThemeToken } from "./core/types.ts";

export type Theme = Readonly<Partial<Record<ThemeToken, string>>>;

/** Eight light and eight dark colours to accent and series2..8 as light-dark pairs. */
const series = (light: string, dark: string): Theme => {
  const d = dark.split(" ");
  const out: Partial<Record<ThemeToken, string>> = {};
  light
    .split(" ")
    .forEach(
      (c, i) => (out[i ? (`series${i + 1}` as ThemeToken) : "accent"] = `light-dark(${c},${d[i]})`),
    );
  return out;
};

export const themes = {
  /** The familiar BI-tool palette people already know. */
  classic: {
    ...series(
      "#4e79a7 #ff9da7 #edc948 #e15759 #76b7b2 #f28e2b #b07aa1 #59a14f",
      "#628ebd #ffa4ae #e5c13e #fa6e6e #8ccdc8 #ffa447 #c78fb7 #6eb764",
    ),
    radius: "2px",
    line: "2",
  },
  /** Trustworthy blues with clear accents, boardroom safe. */
  corporate: {
    ...series(
      "#1d4ed8 #ef4444 #0ea5e9 #f59e0b #475569 #10b981 #6366f1 #14b8a6",
      "#417aff #ff5d59 #39bcff #ffaf2f #78879d #3cd096 #767dff #3ecfbc",
    ),
    radius: "3px",
    line: "2",
  },
  /** Clean saturated primaries, the modern SaaS look. */
  bright: {
    ...series(
      "#3b82f6 #f59e0b #f43f5e #84cc16 #06b6d4 #f97316 #8b5cf6 #10b981",
      "#60a5fa #fbbf24 #fb7185 #a3e635 #22d3ee #fb923c #a78bfa #34d399",
    ),
    radius: "4px",
    line: "2.5",
  },
  /** Deep blues and teals with a coral spark. */
  ocean: {
    ...series(
      "#0369a1 #fbbf24 #38bdf8 #f97362 #1e3a8a #5eead4 #6366f1 #0d9488",
      "#3a8dc8 #f5ba17 #54d3ff #ff8977 #5e82d9 #50dec9 #767dff #34aa9d",
    ),
    radius: "5px",
    line: "2.5",
  },
  /** Icy blues against magenta and violet, cool and crisp. */
  arctic: {
    ...series(
      "#0284c7 #db2777 #38bdf8 #c026d3 #a78bfa #0369a1 #7c3aed #0891b2",
      "#2e9ade #f5448c #54d3ff #d845eb #bda1ff #3a8dc8 #9257ff #33a7c9",
    ),
    radius: "5px",
    line: "2.25",
    gridDash: "3 3",
  },
  /** Navy, gold, crimson and emerald, formal and rich. */
  royal: {
    ...series(
      "#1e3a8a #047857 #d4a017 #b91c1c #0e7490 #c2410c #6b21a8 #be185d",
      "#5e82d9 #3a9a77 #ebb63b #e24940 #3a92af #db582b #a15fe5 #e04178",
    ),
    radius: "0px",
    line: "2.25",
  },
  /** Raspberry, plum and violet, rich and moody. */
  berry: {
    ...series(
      "#be185d #2563eb #a21caf #e11d48 #6d28d9 #db2777 #4f46e5 #9d174d",
      "#e04178 #3b7bff #c445d1 #fb3f5c #915aff #f5448c #6a6cff #d5517b",
    ),
    radius: "6px",
    line: "2.5",
    gridDash: "2 4",
  },
  /** Hot reds, oranges and purples, warm and bold. */
  sunset: {
    ...series(
      "#e11d48 #7c3aed #facc15 #f43f5e #9333ea #f97316 #db2777 #fb923c",
      "#fb3f5c #9257ff #ecbf00 #ff5973 #a84eff #ff8a38 #f5448c #ffa653",
    ),
    radius: "4px",
    line: "2.75",
    grid: "transparent",
  },
  /** 70s mustard, rust and teal. */
  retro: {
    ...series(
      "#d97706 #0f766e #b91c1c #ca8a04 #7c2d12 #65a30d #0e7490 #92400e",
      "#f18d30 #3d978e #e24940 #e1a031 #c16b50 #7ab933 #3a92af #c26c40",
    ),
    radius: "0px",
    line: "3",
  },
  /** Clay, sage and olive, editorial and muted-warm. */
  earth: {
    ...series(
      "#9c6644 #457b9d #a68a64 #bc4749 #cb997e #6b705c #dda15e #386641",
      "#b27b58 #5a90b3 #bc9f79 #d45d5d #e2af93 #848974 #f4b673 #64946c",
    ),
    radius: "3px",
    line: "2",
    gridDash: "1 3",
  },
  /** Fresh greens, pinks and sky blue, light and happy. */
  spring: {
    ...series(
      "#22c55e #ec4899 #0ea5e9 #eab308 #14b8a6 #f97316 #a855f7 #f43f5e",
      "#46dc74 #ff60af #39bcff #f2bb20 #3ecfbc #ff8a38 #be6dff #ff5973",
    ),
    radius: "8px",
    line: "2.5",
    grid: "transparent",
  },
  /** Emerald and indigo with warm pops, modern app. */
  mint: {
    ...series(
      "#10b981 #6366f1 #06b6d4 #f59e0b #ec4899 #8b5cf6 #84cc16 #f43f5e",
      "#3cd096 #767dff #3acdeb #ffaf2f #ff60af #9f73ff #94dd35 #ff5973",
    ),
    radius: "6px",
    line: "2.5",
    grid: "transparent",
  },
  /** Aqua, pink and emerald, summery. */
  lagoon: {
    ...series(
      "#0891b2 #10b981 #fbbf24 #f472b6 #a3e635 #fb7185 #3b82f6 #14b8a6",
      "#33a7c9 #3cd096 #f5ba17 #ff88cc #9adc25 #ff879a #5199ff #3ecfbc",
    ),
    radius: "7px",
    line: "2.75",
  },
  /** Bright pastels, playful and friendly. */
  candy: {
    ...series(
      "#f472b6 #facc15 #f87171 #38bdf8 #fb923c #34d399 #a78bfa #2dd4bf",
      "#ff88cc #ecbf00 #ff8786 #54d3ff #ffa653 #4ae3a8 #bda1ff #40e0ca",
    ),
    radius: "10px",
    line: "3",
    grid: "transparent",
  },
  /** Violet, teal and pink, rounder and airier. */
  aurora: {
    ...series(
      "#7c5cff #00b8a9 #ffb020 #ff4d8d #2f9bff #ff7a45 #e85dff #5ccf3f",
      "#9a80ff #2dd4bf #ffc24d #ff6fa5 #5cb1ff #ff9466 #ef85ff #7ddc66",
    ),
    radius: "7px",
    line: "2.5",
    grid: "transparent",
  },
  /** Hot pink, electric blue and sunflower, maximum energy. */
  pop: {
    ...series(
      "#ff006e #ffbe0b #3a86ff #fb5607 #118ab2 #06d6a0 #8338ec #ef476f",
      "#ff3883 #f9b800 #509dff #ff6e30 #35a0c9 #30e4ad #9854ff #ff6084",
    ),
    radius: "8px",
    line: "3",
    grid: "transparent",
  },
  /** Electric on dark pages, punchy on light. */
  neon: {
    ...series(
      "#0091ea #e91e8c #f59f00 #e53935 #651fff #64a30a #0277bd #00b386",
      "#00e5ff #ff2bd6 #ffb300 #ff5252 #9e7bff #c6ff00 #40c4ff #00ff9d",
    ),
    radius: "3px",
    line: "2.75",
    gridDash: "2 4",
  },
  /** Purple, hot pink and cyan, 80s neon nights. */
  synthwave: {
    ...series(
      "#7b2ff7 #f72585 #ffb703 #b5179e #4cc9f0 #4361ee #fb8500 #3a0ca3",
      "#9151ff #ff469a #fdb500 #d23db9 #5ad5fd #5578ff #ff9c32 #796cfc",
    ),
    radius: "4px",
    line: "3",
    gridDash: "2 6",
  },
} satisfies Record<string, Theme>;

export type ThemeName = keyof typeof themes;
