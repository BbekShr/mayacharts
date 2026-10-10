// Apply the saved light/dark mode before first paint, so a page never flashes in the OS scheme.
// Loaded as a classic script in each page's head; theme.ts keeps the toggle button in step (same "maya-theme" key).
try {
  const m = localStorage.getItem("maya-theme");
  if (m === "light" || m === "dark") document.documentElement.style.colorScheme = m;
} catch {}
