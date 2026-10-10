// Light and dark toggle shared by the demo pages: auto -> light -> dark, remembered across pages. Each
// page also applies the saved mode in an inline <head> script, so it never paints in the OS
// scheme first and flips (same "maya-theme" key).
// Charts follow it because the element inherits the page's `color-scheme`.
// A function, not a bare import: package.json "sideEffects" tree-shakes side-effect-only imports.
import type { ChartSpec } from "../src/index.ts";
import { themes, type Theme, type ThemeName } from "../src/themes.ts";

const modes = ["auto", "light", "dark"] as const;
type Mode = (typeof modes)[number];
const scheme: Record<Mode, string> = { auto: "light dark", light: "light", dark: "dark" };

export function theme(): void {
  const btn = document.getElementById("theme");
  const apply = (m: Mode): void => {
    document.documentElement.style.colorScheme = scheme[m];
    if (btn) btn.textContent = `Light/dark: ${m}`;
  };
  let mode: Mode = "auto";
  try {
    const saved = localStorage.getItem("maya-theme");
    if (saved && (modes as readonly string[]).includes(saved)) mode = saved as Mode;
  } catch {}
  apply(mode);
  btn?.addEventListener("click", () => {
    mode = modes[(modes.indexOf(mode) + 1) % modes.length]!;
    apply(mode);
    try {
      localStorage.setItem("maya-theme", mode);
    } catch {}
  });
}

// Chart theme: one of mayacharts/themes, picked on the gallery or the builder and remembered
// across pages ("maya-chart-theme"). "" is the library's own look.
export type Pick = ThemeName | "";
const names = Object.keys(themes) as ThemeName[];
const isPick = (v: string | null): v is Pick => v === "" || names.includes(v as ThemeName);

export let chartTheme: Pick = "";
try {
  const saved = localStorage.getItem("maya-chart-theme");
  if (isPick(saved)) chartTheme = saved;
} catch {}

/** The spec with the picked theme under any theme it sets itself. */
export const themed = (spec: ChartSpec): ChartSpec =>
  chartTheme ? { ...spec, theme: { ...themes[chartTheme], ...spec.theme } } : spec;

// The library's own first four series colours, for the Default swatch.
const own = ["oklch(.6 .17 255)", "oklch(.66 .16 50)", "oklch(.62 .15 160)", "oklch(.66 .17 330)"];

/**
 * Fill `host` with one radio swatch per theme (its name and first four colours) and call
 * `change` after the user picks one. Native radios, so arrow keys move between themes.
 */
export function themePicker(host: HTMLElement, change: () => void): void {
  host.setAttribute("role", "radiogroup");
  host.setAttribute("aria-label", "Chart theme");
  for (const n of ["", ...names] as Pick[]) {
    const input = Object.assign(document.createElement("input"), {
      type: "radio",
      name: host.id,
      value: n,
      checked: n === chartTheme,
    });
    const dots = document.createElement("span");
    dots.className = "dots";
    const t: Theme = n ? themes[n] : {};
    for (const c of n
      ? (["accent", "series2", "series3", "series4"] as const).map((k) => t[k]!)
      : own) {
      const i = document.createElement("i");
      i.style.background = c;
      dots.append(i);
    }
    const label = document.createElement("label");
    label.className = "swatch";
    label.append(input, dots, n ? n[0]!.toUpperCase() + n.slice(1) : "Default");
    host.append(label);
  }
  // Centre the picked swatch in its row without scrolling the page.
  const on = host.querySelector<HTMLElement>(":checked")?.parentElement;
  if (on) host.scrollLeft = on.offsetLeft - (host.clientWidth - on.offsetWidth) / 2;
  host.addEventListener("change", (e) => {
    const v = (e.target as HTMLInputElement).value;
    if (!isPick(v)) return;
    chartTheme = v;
    try {
      localStorage.setItem("maya-chart-theme", chartTheme);
    } catch {}
    change();
  });
}
