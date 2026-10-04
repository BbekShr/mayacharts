// Host for one reference chart: ref.html?lib=<lib>&chart=<chart>[&dir=rtl]. Loads the bundled
// module from .build/, draws it into #chart with the shared rows and reports on window.__done:
// { ok, ttfp } once the next animation frame has fired, or { ok: false, error }, or
// { unsupported } when the library lacks the chart type. window.__update(rows) redraws.
import { refData } from "/.build/data.js";

const q = new URLSearchParams(location.search);
const lib = q.get("lib") ?? "maya";
const chart = q.get("chart") ?? "bar";
if (q.get("dir")) document.documentElement.dir = q.get("dir");
const root = document.getElementById("chart");

try {
  const mod = await import(`/.build/${lib}/${chart}.js`);
  if (mod.unsupported) window.__done = { ok: false, unsupported: true, error: mod.unsupported };
  else {
    const rows = refData()[chart];
    const t0 = performance.now();
    window.__update = (await mod.default(root, rows)) ?? null;
    await new Promise((r) => requestAnimationFrame(r));
    window.__done = { ok: true, ttfp: performance.now() - t0 };
  }
} catch (e) {
  window.__done = { ok: false, error: String(e?.message ?? e) };
}
