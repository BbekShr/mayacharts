// Browser stress: mount, animated update and pointer pick of <maya-chart> at growing mark counts.
// Run after `npm run build`: node bench/browser.mjs [chromium|firefox|webkit] [type ...]
import { chromium, firefox, webkit } from "@playwright/test";

const engines = { chromium, firefox, webkit };
const [engine = "chromium", ...only] = process.argv.slice(2);
const browser = await engines[engine].launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
await page.setContent(
  `<!doctype html><body style="margin:0"><maya-chart id=c style="display:block;width:960px;height:480px"></maya-chart>`,
);
await page.addScriptTag({ path: new URL("../dist/maya.global.js", import.meta.url).pathname });

const NS = [500, 1000, 2500, 5000, 10000, 20000];
const TYPES = only.length
  ? only
  : ["bar", "line-cat", "scatter", "beeswarm", "heatmap", "treemap", "units", "dumbbell"];

for (const type of TYPES) {
  const cells = [];
  for (const n of NS) {
    const r = await page.evaluate(
      async ({ type, n }) => {
        let seed = 7;
        const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
        const rows = (f) => Array.from({ length: n }, (_, i) => f(i));
        const w = Math.ceil(Math.sqrt(n));
        const S = {
          bar: () => ({
            type: "bar",
            x: "c",
            y: "v",
            data: rows((i) => ({ c: "c" + i, v: rnd() * 100 })),
          }),
          "line-cat": () => ({
            type: "line",
            x: "c",
            y: "v",
            data: rows((i) => ({ c: "c" + i, v: rnd() * 100 })),
          }),
          scatter: () => ({
            type: "scatter",
            x: "a",
            y: "b",
            data: rows(() => ({ a: rnd() * 1e3, b: rnd() * 1e3 })),
          }),
          beeswarm: () => ({
            type: "beeswarm",
            x: "g",
            y: "v",
            data: rows((i) => ({ g: "g" + (i % 4), v: rnd() * 100 })),
          }),
          heatmap: () => ({
            type: "heatmap",
            x: "x",
            series: "y",
            y: "v",
            data: rows((i) => ({ x: "x" + (i % w), y: "y" + Math.floor(i / w), v: rnd() })),
          }),
          treemap: () => ({
            type: "treemap",
            path: ["a", "b", "c"],
            y: "v",
            data: rows((i) => ({
              a: "a" + (i % 5),
              b: "b" + (i % 37),
              c: "c" + i,
              v: rnd() * 100,
            })),
          }),
          units: () => ({
            type: "units",
            x: "g",
            y: "v",
            data: rows((i) => ({ g: "g" + (i % 4), v: rnd() * 100 })),
          }),
          dumbbell: () => ({
            type: "dumbbell",
            x: "c",
            y: "v",
            series: "s",
            data: rows((i) => ({ c: "c" + (i >> 1), s: i & 1 ? "b" : "a", v: rnd() * 100 })),
          }),
        };
        const el = document.getElementById("c");
        el.replaceWith(
          ((el2) => el2)(Object.assign(document.createElement("maya-chart"), { id: "c" })),
        );
        const c = document.getElementById("c");
        c.style.cssText = "display:block;width:960px;height:480px";
        const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r)));
        await frame();
        // Mount: spec set to the frame after (render + parse + style + layout + paint).
        let t = performance.now();
        c.spec = S[type]();
        await frame();
        const mount = performance.now() - t;
        const err = c.shadowRoot.querySelector(".maya-err");
        if (err) return { err: err.textContent.split("\n")[0].slice(0, 60) };
        const nodes = c.shadowRoot.querySelectorAll("*").length;
        await new Promise((r) => setTimeout(r, 1500)); // let the entrance finish
        // Update: new values, same keys, animated. Track the worst frame gap for 1 s.
        t = performance.now();
        c.spec = S[type]();
        await frame();
        const update = performance.now() - t;
        let last = performance.now(),
          worst = 0,
          frames = 0;
        await new Promise((res) => {
          const end = last + 1000;
          const step = (now) => {
            worst = Math.max(worst, now - last);
            last = now;
            frames++;
            now < end ? requestAnimationFrame(step) : res();
          };
          requestAnimationFrame(step);
        });
        // Pointer: 200 moves across the plot, synchronous handler time.
        const svg = c.shadowRoot.querySelector("svg");
        const b = svg.getBoundingClientRect();
        t = performance.now();
        for (let i = 0; i < 200; i++) {
          const x = b.left + 60 + ((b.width - 80) * i) / 200;
          const y = b.top + 40 + ((b.height - 80) * ((i * 37) % 200)) / 200;
          const tg = c.shadowRoot.elementFromPoint(x, y) ?? svg;
          tg.dispatchEvent(
            new PointerEvent("pointermove", {
              clientX: x,
              clientY: y,
              bubbles: true,
              composed: true,
              pointerType: "mouse",
            }),
          );
        }
        const hover = (performance.now() - t) / 200;
        return { mount, nodes, update, fps: frames, worst, hover };
      },
      { type, n },
    );
    if (r.err) {
      cells.push(`${n}: ${r.err.replace(/^mayacharts: /, "")}`);
      break;
    }
    cells.push(
      `${n}: mount ${r.mount.toFixed(0)} upd ${r.update.toFixed(0)} fps ${r.fps} jank ${r.worst.toFixed(0)} hover ${r.hover.toFixed(1)} nodes ${r.nodes}`,
    );
    console.log(type, cells.at(-1));
    if (r.mount > 5000) break;
  }
}
await browser.close();
