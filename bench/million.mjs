import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
await page.setContent(
  `<!doctype html><body style="margin:0"><maya-chart id=c style="display:block;width:960px;height:480px"></maya-chart>`,
);
await page.addScriptTag({ path: "/Users/bibekshrestha/mayaCharts/dist/maya.global.js" });
for (const type of [
  "line-time",
  "line-time-8s",
  "scatter",
  "sunburst",
  "boxplot",
  "kpi",
  "bar-agg",
  "bar-1m",
  "line-cat",
  "table",
]) {
  const r = await page.evaluate(async (type) => {
    const n = 1e6;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const rows = (f) => Array.from({ length: n }, (_, i) => f(i));
    const T0 = Date.UTC(2020, 0, 1);
    const S = {
      "line-time": () => ({
        type: "line",
        x: "t",
        xType: "time",
        y: "v",
        data: rows((i) => ({ t: T0 + i * 6e4, v: Math.sin(i / 5e3) * 50 + rnd() * 10 })),
      }),
      "line-time-8s": () => ({
        type: "line",
        x: "t",
        xType: "time",
        y: "v",
        series: "s",
        data: rows((i) => ({ t: T0 + (i >> 3) * 6e4, s: "s" + (i & 7), v: rnd() * 100 })),
      }),
      scatter: () => ({
        type: "scatter",
        x: "a",
        y: "b",
        data: rows(() => ({ a: rnd() * 1e3, b: rnd() * 1e3 })),
      }),
      sunburst: () => ({
        type: "sunburst",
        path: ["a", "b", "c"],
        y: "v",
        data: rows((i) => ({ a: "a" + (i % 5), b: "b" + (i % 37), c: "c" + (i % 500), v: rnd() })),
      }),
      boxplot: () => ({
        type: "boxplot",
        x: "g",
        y: "v",
        data: rows((i) => ({ g: "g" + (i % 6), v: rnd() * 100 })),
      }),
      kpi: () => ({ type: "kpi", x: "t", y: "v", data: rows((i) => ({ t: "d" + i, v: rnd() })) }),
      "bar-1m": () => ({
        type: "bar",
        x: "c",
        y: "v",
        data: rows((i) => ({ c: "c" + i, v: rnd() })),
      }),
      "line-cat": () => ({
        type: "line",
        x: "c",
        y: "v",
        data: rows((i) => ({ c: "c" + i, v: rnd() })),
      }),
      table: () => ({
        type: "table",
        x: "c",
        y: ["a", "b"],
        data: rows((i) => ({ c: "c" + i, a: rnd(), b: rnd() })),
      }),
      "bar-agg": () => ({
        type: "bar",
        x: "c",
        y: "v",
        data: rows((i) => ({ c: "c" + (i % 20), v: rnd() })),
      }),
    };
    const old = document.getElementById("c");
    const c = document.createElement("maya-chart");
    c.id = "c";
    c.style.cssText = "display:block;width:960px;height:480px";
    old.replaceWith(c);
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r)));
    const spec = S[type]();
    const heap0 = performance.memory?.usedJSHeapSize;
    let t = performance.now();
    c.spec = spec;
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r)));
    const mount = performance.now() - t;
    const err = c.shadowRoot.querySelector(".maya-err")?.textContent?.slice(0, 80);
    await new Promise((r) => setTimeout(r, 2500));
    t = performance.now();
    c.style.width = "800px";
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r))),
    );
    const resize = performance.now() - t;
    return { mount, resize, err, nodes: c.shadowRoot.querySelectorAll("*").length };
  }, type);
  console.log(type, JSON.stringify(r));
}
await browser.close();
