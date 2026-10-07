// Interaction latency at 1M rows. node bench/million-ix.mjs [line-time|line-time-8s|scatter] (default all)
import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
await page.setContent(
  `<!doctype html><body style="margin:0"><maya-chart id=c style="display:block;width:960px;height:480px"></maya-chart>`,
);
await page.addScriptTag({ path: "/Users/bibekshrestha/mayaCharts/dist/maya.global.js" });
const only = process.argv[2];
const PROF = process.env.PROF; // PROF=hover|brush|reset|resize: print top self-time functions of that step
const idle = () =>
  page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r)))),
  );
for (const type of ["line-time", "line-time-8s", "scatter"]) {
  if (only && only !== type) continue;
  await page.evaluate((type) => {
    const n = 1e6;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const rows = (f) => Array.from({ length: n }, (_, i) => f(i));
    const T0 = Date.UTC(2020, 0, 1);
    const S = {
      "line-time": () => ({
        type: "line",
        zoom: true,
        x: "t",
        xType: "time",
        y: "v",
        data: rows((i) => ({ t: T0 + i * 6e4, v: Math.sin(i / 5e3) * 50 + rnd() * 10 })),
      }),
      "line-time-8s": () => ({
        type: "line",
        zoom: true,
        x: "t",
        xType: "time",
        y: "v",
        series: "s",
        legend: true,
        data: rows((i) => ({ t: T0 + (i >> 3) * 6e4, s: "s" + (i & 7), v: rnd() * 100 })),
      }),
      scatter: () => ({
        type: "scatter",
        zoom: true,
        x: "a",
        y: "b",
        data: rows(() => ({ a: rnd() * 1e3, b: rnd() * 1e3 })),
      }),
    };
    window.__spec = S[type]();
    window.__long = [];
    new PerformanceObserver((l) =>
      l.getEntries().forEach((e) => __long.push(Math.round(e.duration))),
    ).observe({ entryTypes: ["longtask"] });
    const old = document.getElementById("c");
    const c = document.createElement("maya-chart");
    c.id = "c";
    c.style.cssText = "display:block;width:960px;height:480px";
    old.replaceWith(c);
  }, type);
  await idle();
  const lt = () => page.evaluate(() => __long.splice(0));
  const out = { type };
  let t = Date.now();
  await page.evaluate(() => {
    window.c = document.getElementById("c");
    c.spec = __spec;
  });
  await idle();
  out.mount = Date.now() - t;
  out.mountLong = await lt();
  await page.waitForTimeout(2500);
  out.mountLongIdle = await lt(); // table insert etc.
  const box = await page.locator("#c .maya-box, #c").first().boundingBox();
  const plot = await page.evaluate(() => {
    const s = c.shadowRoot.querySelector(".maya-svg");
    const r = s.getBoundingClientRect();
    const p = s.getAttribute("data-plot").split(" ").map(Number);
    return { x: r.x + p[0], y: r.y + p[1], w: p[2], h: p[3] };
  });
  // [wall ms, worst rAF gap ms, ...long tasks ms]
  await page.evaluate(() => {
    window.__gap = 0;
    let p = performance.now();
    (function f(t) {
      __gap = Math.max(__gap, t - p);
      p = t;
      requestAnimationFrame(f);
    })(p);
  });
  const m = async (name, fn) => {
    const cdp = PROF === name ? await page.context().newCDPSession(page) : null;
    if (cdp) {
      await cdp.send("Profiler.enable");
      await cdp.send("Profiler.setSamplingInterval", { interval: 100 });
      await cdp.send("Profiler.start");
    }
    await lt();
    await page.evaluate(() => (__gap = 0));
    const t0 = Date.now();
    await fn();
    await idle();
    out[name] = [Date.now() - t0, Math.round(await page.evaluate(() => __gap)), ...(await lt())];
    if (cdp) {
      const { profile } = await cdp.send("Profiler.stop");
      const by = new Map(profile.nodes.map((x) => [x.id, x]));
      const self = new Map();
      profile.samples.forEach((id, i) => {
        const c = by.get(id).callFrame;
        const k =
          (c.functionName || "(anon)") +
          " " +
          c.url.split("/").pop() +
          ":" +
          c.lineNumber +
          ":" +
          c.columnNumber;
        self.set(k, (self.get(k) ?? 0) + profile.timeDeltas[i] / 1000);
      });
      console.log(
        [...self]
          .filter(([k]) => !/^\((idle|root|program)/.test(k))
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([k, v]) => v.toFixed(1) + " " + k)
          .join("\n"),
      );
    }
    await page.waitForTimeout(600);
  };
  // hover sweep: 40 moves, report max per-move handler cost via long tasks + total
  await m("hover40", async () => {
    for (let i = 0; i < 40; i++)
      await page.mouse.move(plot.x + 20 + (i * (plot.w - 40)) / 40, plot.y + plot.h / 2);
  });
  await m("brush", async () => {
    await page.mouse.move(plot.x + plot.w * 0.3, plot.y + plot.h * 0.5);
    await page.mouse.down();
    await page.mouse.move(plot.x + plot.w * 0.6, plot.y + plot.h * 0.8, { steps: 6 });
    await page.mouse.up();
  });
  await page.waitForTimeout(800);
  await m("reset", async () => {
    const r = page.locator("#c .maya-reset");
    if (await r.count()) await r.first().click();
  });
  await m("legend", async () => {
    const b = page.locator("#c [data-maya=legend] button");
    out.legendN = await b.count();
    if (out.legendN > 1) await b.nth(1).click();
    out.v1 = await page.evaluate(() => JSON.stringify(c.view));
  });
  await m("keys", async () => {
    await page.evaluate(() => c.shadowRoot.querySelector(".maya-svg").focus());
    for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight");
  });
  await m("resize", async () => {
    await page.evaluate(() => (c.style.width = "800px"));
  });
  out.view = await page.evaluate(() => JSON.stringify(c.view));
  console.log(JSON.stringify(out));
}
await browser.close();
