// CPU profile of mount and of an animated update: node bench/mount-profile.mjs <type> <n> [mount|update]
import { chromium } from "@playwright/test";

const [type = "bar", n = "5000", phase = "mount"] = process.argv.slice(2);
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
    window.mk = () =>
      ({
        bar: { type: "bar", x: "c", y: "v", data: rows((i) => ({ c: "c" + i, v: rnd() * 100 })) },
        scatter: {
          type: "scatter",
          x: "a",
          y: "b",
          data: rows(() => ({ a: rnd() * 1e3, b: rnd() * 1e3 })),
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
        "line-time": {
          type: "line",
          zoom: true,
          x: "t",
          xType: "time",
          y: "v",
          data: rows((i) => ({ t: 1.6e12 + i * 6e4, v: Math.sin(i / 5e3) * 50 + rnd() * 10 })),
        },
        "line-time-8s": {
          type: "line",
          x: "t",
          xType: "time",
          y: "v",
          series: "s",
          data: rows((i) => ({ t: 1.6e12 + (i >> 3) * 6e4, s: "s" + (i & 7), v: rnd() * 100 })),
        },
        "line-cat": {
          type: "line",
          x: "c",
          y: "v",
          data: rows((i) => ({ c: "c" + i, v: rnd() * 100 })),
        },
      })[type];
  },
  { type, n: +n },
);
if (phase === "update") {
  await page.evaluate(() => (document.getElementById("c").spec = mk()));
  await page.waitForTimeout(2500);
}
const cdp = await page.context().newCDPSession(page);
await cdp.send("Performance.enable");
const met = async () =>
  Object.fromEntries(
    (await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]),
  );
await cdp.send("Profiler.enable");
await cdp.send("Profiler.setSamplingInterval", { interval: 100 });
const spec = await page.evaluateHandle(() => mk());
const m0 = await met();
await cdp.send("Profiler.start");
const ms = await page.evaluate(async (spec) => {
  const t = performance.now();
  document.getElementById("c").spec = spec;
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r)));
  return performance.now() - t;
}, spec);
const { profile } = await cdp.send("Profiler.stop");
const m1 = await met();
console.log(
  `${type} ${n} ${phase}: ${ms.toFixed(0)} ms  ` +
    ["ScriptDuration", "RecalcStyleDuration", "LayoutDuration", "TaskDuration"]
      .map((k) => `${k.replace("Duration", "")} ${((m1[k] - m0[k]) * 1000).toFixed(0)}`)
      .join(" "),
);
const self = new Map(),
  total = new Map();
const byId = new Map(profile.nodes.map((x) => [x.id, x]));
const parent = new Map();
for (const x of profile.nodes) for (const c of x.children ?? []) parent.set(c, x.id);
const name = (x) =>
  `${x.callFrame.functionName || "(anon)"} ${x.callFrame.url.split("/").pop()}:${x.callFrame.lineNumber}:${x.callFrame.columnNumber}`;
profile.samples.forEach((id, i) => {
  const d = (profile.timeDeltas[i] ?? 0) / 1000;
  self.set(name(byId.get(id)), (self.get(name(byId.get(id))) ?? 0) + d);
  const seen = new Set();
  for (let p = id; p !== undefined; p = parent.get(p)) {
    const k = name(byId.get(p));
    if (!seen.has(k)) (seen.add(k), total.set(k, (total.get(k) ?? 0) + d));
  }
});
const top = (m) =>
  [...m]
    .filter(([k]) => !/^\((idle|root|program)/.test(k))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 14)
    .map(([k, v]) => `  ${v.toFixed(1).padStart(7)} ${k}`)
    .join("\n");
console.log("self:\n" + top(self) + "\ntotal:\n" + top(total));
await browser.close();
