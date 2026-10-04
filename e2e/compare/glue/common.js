// Shared by the three glue modules: read ?chart= and ?dir=, load data, time the render.
const q = new URLSearchParams(location.search);
export const chart = q.get("chart") ?? "bar";
if (q.get("dir")) document.documentElement.dir = q.get("dir");
export const data = await (await fetch("/data.json")).json();
export const { LINES, SERIES } = data.meta;
export const month = (t) =>
  new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }).format(t);

/** Run `draw`, then report once the next animation frame has fired. */
export async function timed(draw) {
  const t0 = performance.now();
  try {
    await draw();
  } catch (e) {
    window.__done = { ok: false, error: String(e && e.message ? e.message : e) };
    return;
  }
  await new Promise((r) => requestAnimationFrame(r));
  window.__done = { ok: true, ttfp: performance.now() - t0 };
}

export function canvasPainted(c) {
  if (!c) return false;
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  for (let i = 3; i < d.length; i += 4) if (d[i]) return true;
  return false;
}
