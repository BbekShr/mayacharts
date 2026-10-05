// Host for one reference chart: ref.html?lib=<lib>&chart=<chart>[&dir=rtl]. Loads the bundled
// module from .build/, draws it into #chart with the shared rows and reports on window.__done:
// { ok, ttfp } once marks are on screen, or { ok: false, error }, or { unsupported } when the
// library lacks the chart type. ttfp is the time from before draw() until #chart holds marks (an
// svg with a path, rect or circle, or a canvas with ink, crossing shadow roots), polled per frame,
// plus one more frame. React libraries commit after draw() returns, so draw() alone is not a paint.
// window.__update(rows) redraws; window.__timedUpdate(rows) returns the ms until the chart changed
// (a DOM mutation, or different canvas pixels) plus one frame. Every check is the same for every
// library and stops early, so the probe itself costs little.
// Speed suite: ?n=<rows> (chart=scatter|line) draws n generated rows; window.__rows(seed) makes more.
import { refData, speedRows } from "/.build/data.js";

const q = new URLSearchParams(location.search);
const lib = q.get("lib") ?? "maya";
const chart = q.get("chart") ?? "bar";
if (q.get("dir")) document.documentElement.dir = q.get("dir");
const root = document.getElementById("chart");
const frame = () => new Promise((r) => requestAnimationFrame(r));

/** First element under `n` (crossing shadow roots) for which `test` is true, or null. Stops early. */
const find = (n, test) => {
  for (const e of n.querySelectorAll("*")) {
    if (test(e)) return e;
    const hit = e.shadowRoot && find(e.shadowRoot, test);
    if (hit) return hit;
  }
  return null;
};
const canvasOf = () => find(root, (e) => e instanceof HTMLCanvasElement && e.width && e.height);
// A 16x16 thumbnail of the canvas: cheap to read back every frame, for every canvas library alike.
const thumb = document.createElement("canvas");
thumb.width = thumb.height = 16;
const tg = thumb.getContext("2d", { willReadFrequently: true });
const pixels = (c) => {
  tg.clearRect(0, 0, 16, 16);
  tg.drawImage(c, 0, 0, 16, 16);
  return tg.getImageData(0, 0, 16, 16).data.join();
};
const BLANK = pixels(thumb);
const hasMarks = () => {
  const c = canvasOf();
  if (c) return pixels(c) !== BLANK;
  return !!find(root, (e) => /^(path|rect|circle)$/.test(e.tagName) && e.closest("svg"));
};

/** Run `fn`, then wait until #chart changed (DOM mutation, or new canvas pixels), plus one frame. */
const timedUpdate = async (fn) => {
  const c = canvasOf();
  const before = c && pixels(c);
  let changed = false;
  const mo = new MutationObserver(() => (changed = true));
  const opts = { subtree: true, childList: true, attributes: true, characterData: true };
  mo.observe(root, opts);
  find(root, (e) => (e.shadowRoot && mo.observe(e.shadowRoot, opts), false));
  const t0 = performance.now();
  await fn();
  const done = () => (c ? pixels(c) !== before : changed);
  const end = t0 + 5000;
  while (!done() && performance.now() < end) await frame();
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
