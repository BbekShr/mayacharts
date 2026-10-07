// Real-mouse sweep across one chart with frame timing, plus a CPU profile summary of the sweep.
// node bench/hover-profile.mjs <type> <n>
import { chromium } from "@playwright/test";

const [type = "bar", n = "5000", css = ""] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
await page.setContent(
  `<!doctype html><body style="margin:0"><maya-chart id=c style="display:block;width:960px;height:480px"></maya-chart>`,
);
await page.addScriptTag({ path: new URL("../dist/maya.global.js", import.meta.url).pathname });
await page.evaluate(
  ({ type, n }) => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const rows = (f) => Array.from({ length: n }, (_, i) => f(i));
    const S = {
      bar: { type: "bar", x: "c", y: "v", data: rows((i) => ({ c: "c" + i, v: rnd() * 100 })) },
      scatter: {
        type: "scatter",
        x: "a",
        y: "b",
        data: rows(() => ({ a: rnd() * 1e3, b: rnd() * 1e3 })),
      },
      beeswarm: {
        type: "beeswarm",
        x: "g",
        y: "v",
        data: rows((i) => ({ g: "g" + (i % 4), v: rnd() * 100 })),
      },
      "line-cat": {
        type: "line",
        x: "c",
        y: "v",
        data: rows((i) => ({ c: "c" + i, v: rnd() * 100 })),
      },
      treemap: {
        type: "treemap",
        path: ["a", "b", "c"],
        y: "v",
        data: rows((i) => ({ a: "a" + (i % 5), b: "b" + (i % 37), c: "c" + i, v: rnd() * 100 })),
      },
      dumbbell: {
        type: "dumbbell",
        x: "c",
        y: "v",
        series: "s",
        data: rows((i) => ({ c: "c" + (i >> 1), s: i & 1 ? "b" : "a", v: rnd() * 100 })),
      },
    };
    document.getElementById("c").spec = S[type];
  },
  { type, n: +n },
);
await page.waitForTimeout(2000);
if (css)
  await page.evaluate((css) => {
    const s = new CSSStyleSheet();
    s.replaceSync(css);
    const r = document.getElementById("c").shadowRoot;
    r.adoptedStyleSheets = [...r.adoptedStyleSheets, s];
  }, css);
const cdp = await page.context().newCDPSession(page);
await cdp.send("Profiler.enable");
await cdp.send("Performance.enable");
const met = async () =>
  Object.fromEntries(
    (await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]),
  );
const m0 = await met();
await cdp.send("Profiler.start");
await page.evaluate(() => {
  window.__gaps = [];
  let last = performance.now();
  const step = (now) => {
    window.__gaps.push(now - last);
    last = now;
    if (!window.__stop) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
});
const b = await page.locator("#c").boundingBox();
await page.mouse.move(b.x + 40, b.y + b.height / 2);
for (let i = 0; i <= 120; i++)
  await page.mouse.move(
    b.x + 40 + ((b.width - 60) * i) / 120,
    b.y + b.height * (0.3 + (0.4 * ((i * 7) % 10)) / 10),
  );
const gaps = await page.evaluate(() => ((window.__stop = true), window.__gaps.slice(1)));
const { profile } = await cdp.send("Profiler.stop");
const m1 = await met();
console.log(
  "  " +
    [
      "TaskDuration",
      "ScriptDuration",
      "RecalcStyleDuration",
      "LayoutDuration",
      "RecalcStyleCount",
      "LayoutCount",
    ]
      .map(
        (k) =>
          `${k.replace("Duration", "")} ${(m1[k] - m0[k]).toFixed(k.endsWith("Count") ? 0 : 2)}`,
      )
      .join(" "),
);
gaps.sort((a, b) => a - b);
const p = (q) => gaps[Math.floor(q * (gaps.length - 1))].toFixed(0);
console.log(`${type} ${n}: frames ${gaps.length} p50 ${p(0.5)}ms p95 ${p(0.95)}ms max ${p(1)}ms`);
// Self time by function.
const self = new Map();
const dt = profile.timeDeltas;
const byId = new Map(profile.nodes.map((x) => [x.id, x]));
profile.samples.forEach((id, i) => {
  const f = byId.get(id).callFrame;
  const k = `${f.functionName || "(anon)"} ${f.url.split("/").pop()}:${f.lineNumber}`;
  self.set(k, (self.get(k) ?? 0) + (dt[i] ?? 0) / 1000);
});
console.log(
  [...self]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([k, v]) => `  ${v.toFixed(0).padStart(6)}ms ${k}`)
    .join("\n"),
);
await browser.close();
