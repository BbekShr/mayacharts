// Theme toggle shared by the demo pages: auto -> light -> dark, remembered across pages.
// Charts follow it because site.css sets `maya-chart { color-scheme: inherit }`; the element's
// own `:host` default is `light dark`, which tracks the OS and would ignore this page setting.
// A function, not a bare import: package.json "sideEffects" tree-shakes side-effect-only imports.
const modes = ["auto", "light", "dark"] as const;
type Mode = (typeof modes)[number];
const scheme: Record<Mode, string> = { auto: "light dark", light: "light", dark: "dark" };

export function theme(): void {
  const btn = document.getElementById("theme");
  const apply = (m: Mode): void => {
    document.documentElement.style.colorScheme = scheme[m];
    if (btn) btn.textContent = `Theme: ${m}`;
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
