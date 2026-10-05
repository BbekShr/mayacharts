// Host for one reference chart: ref.html?lib=<lib>&chart=<chart>[&dir=rtl]. Loads the bundled
// module from .build/, draws it into #chart with the shared rows and reports on window.__done:
// { ok, ttfp } once marks are on screen, or { ok: false, error }, or { unsupported } when the
// library lacks the chart type. ttfp is the time from before draw() until #chart holds marks (an
// svg with a path, rect or circle, or a canvas with ink, crossing shadow roots), polled per frame,
// plus one more frame. React libraries commit after draw() returns, so
// draw() alone is not a paint.
// window.__update(rows) redraws; window.__timedUpdate(rows) returns the ms until the chart drew (a
// DOM mutation or a canvas draw call) plus one frame. Every
// check is the same for every library and stops early, so the probe itself costs little.
// Speed suite: ?n=<rows> (chart=scatter|line) draws n generated rows; window.__rows(seed) makes more.
import { refData, speedRows } from "/.build/data.js";

const q = new URLSearchParams(location.search);
const lib = q.get("lib") ?? "maya";
const chart = q.get("chart") ?? "bar";
if (q.get("dir")) document.documentElement.dir = q.get("dir");
const root = document.getElementById("chart");
const frame = () => new Promise((r) => requestAnimationFrame(r));

// Activity: every canvas draw call and every DOM mutation under #chart bumps `ticks`. A chart
// counts as drawn at the first activity plus one frame. Canvas libraries animate by default and
// ignore reduced motion; counting until their animation ends would measure animation, not speed,
// so the first frame of new data is the finish line for everyone. A progressive renderer is
// therefore timed to its first chunk, which favours it.
let ticks = 0;
let probing = false;
const C2D = CanvasRenderingContext2D.prototype;
for (const m of [
  "fill",
  "stroke",
  "fillRect",
  "strokeRect",
  "drawImage",
  "putImageData",
  "fillText",
]) {
  const f = C2D[m];
  C2D[m] = function (...a) {
    if (!probing) ticks++;
    return f.apply(this, a);
  };
}
const watch = (n) =>
  mo.observe(n, { subtree: true, childList: true, attributes: true, characterData: true });
const mo = new MutationObserver(() => ticks++);
/** Wait until something changed since `from` (or `end` passed), plus one frame. */
const settle = async (from, end) => {
  while (ticks === from && performance.now() < end) await frame();
  await frame();
};

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
  probing = true;
  tg.clearRect(0, 0, 16, 16);
  tg.drawImage(c, 0, 0, 16, 16);
  probing = false;
  return tg.getImageData(0, 0, 16, 16).data.join();
};
const BLANK = pixels(thumb);
const hasMarks = () => {
  const c = canvasOf();
  if (c) return pixels(c) !== BLANK;
  return !!find(root, (e) => /^(path|rect|circle)$/.test(e.tagName) && e.closest("svg"));
};

/** Run `fn`, then wait until the chart drew (a DOM mutation or a canvas draw call), plus one frame. */
const timedUpdate = async (fn) => {
  const from = ticks;
  const t0 = performance.now();
  await fn();
  await settle(from, t0 + 30_000);
  return performance.now() - t0;
};

try {
  const mod = await import(`/.build/${lib}/${chart}.js`);
  if (mod.unsupported) window.__done = { ok: false, unsupported: true, error: mod.unsupported };
  else {
    const n = +q.get("n");
    const rows = n ? speedRows(n)[chart] : refData()[chart];
    window.__rows = (seed) => speedRows(n, seed)[chart];
    watch(root);
    const t0 = performance.now();
    window.__update = (await mod.default(root, rows)) ?? null;
    const end = t0 + 60_000;
    while (!hasMarks() && performance.now() < end) await frame();
    await frame();
    window.__done = hasMarks()
      ? { ok: true, ttfp: performance.now() - t0 }
      : { ok: false, error: "no marks appeared" };
    find(root, (e) => (e.shadowRoot && watch(e.shadowRoot), false));
    window.__timedUpdate = (rows) => timedUpdate(() => window.__update(rows));
  }
} catch (e) {
  window.__done = { ok: false, error: String(e?.message ?? e) };
}
