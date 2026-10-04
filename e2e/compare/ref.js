// Host for one reference chart: ref.html?lib=<lib>&chart=<chart>[&dir=rtl]. Loads the bundled
// module from .build/, draws it into #chart with the shared rows and reports on window.__done:
// { ok, ttfp } once marks are on screen, or { ok: false, error }, or { unsupported } when the
// library lacks the chart type. ttfp is the time from before draw() until #chart holds marks (an
// svg with a path, rect or circle, or a canvas with ink, crossing shadow roots), polled per frame,
// plus one more frame. React libraries commit after draw() returns, so draw() alone is not a paint.
// window.__update(rows) redraws; window.__timedUpdate(rows) returns the ms until the DOM changed
// (canvas libraries draw synchronously, so they wait one frame) plus one frame.
// Speed suite: ?n=<rows> (chart=scatter|line) draws n generated rows; window.__rows(seed) makes more.
import { refData, speedRows } from "/.build/data.js";

const q = new URLSearchParams(location.search);
const lib = q.get("lib") ?? "maya";
const chart = q.get("chart") ?? "bar";
if (q.get("dir")) document.documentElement.dir = q.get("dir");
const root = document.getElementById("chart");
const frame = () => new Promise((r) => requestAnimationFrame(r));

/** Every element under `n`, crossing shadow roots. */
const deep = (n, out = []) => {
  for (const e of n.querySelectorAll("*")) {
    out.push(e);
    if (e.shadowRoot) deep(e.shadowRoot, out);
  }
  return out;
};
const hasMarks = () => {
  for (const e of deep(root)) {
    if (/^(path|rect|circle)$/.test(e.tagName) && e.closest("svg")) return true;
    if (e instanceof HTMLCanvasElement && e.width && e.height) {
      const g = e.getContext("2d");
      if (!g) return true;
      const d = g.getImageData(0, 0, e.width, e.height).data;
      for (let i = 3; i < d.length; i += 4) if (d[i]) return true;
    }
  }
  return false;
};

/** Run `fn`, then wait until #chart's DOM changed (or one frame when it holds a canvas). */
const timedUpdate = async (fn) => {
  const canvas = deep(root).some((e) => e instanceof HTMLCanvasElement);
  let changed = false;
  const mo = new MutationObserver(() => (changed = true));
  const opts = { subtree: true, childList: true, attributes: true, characterData: true };
  mo.observe(root, opts);
  for (const e of deep(root)) if (e.shadowRoot) mo.observe(e.shadowRoot, opts);
  const t0 = performance.now();
  await fn();
  const end = t0 + 5000;
  if (canvas) await frame();
  else while (!changed && performance.now() < end) await frame();
  await frame();
  mo.disconnect();
  return performance.now() - t0;
};

try {
  const mod = await import(`/.build/${lib}/${chart}.js`);
  if (mod.unsupported) window.__done = { ok: false, unsupported: true, error: mod.unsupported };
  else {
    const n = +q.get("n");
    const rows = n ? speedRows(n)[chart] : refData()[chart];
    window.__rows = (seed) => speedRows(n, seed)[chart];
    const t0 = performance.now();
    window.__update = (await mod.default(root, rows)) ?? null;
    const end = t0 + 60_000;
    while (!hasMarks() && performance.now() < end) await frame();
    await frame();
    window.__done = hasMarks()
      ? { ok: true, ttfp: performance.now() - t0 }
      : { ok: false, error: "no marks appeared" };
    window.__timedUpdate = (rows) => timedUpdate(() => window.__update(rows));
  }
} catch (e) {
  window.__done = { ok: false, error: String(e?.message ?? e) };
}
