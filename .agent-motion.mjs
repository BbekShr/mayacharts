import { chromium, webkit } from "playwright";
const OUT =
  "/private/tmp/claude-501/-Users-bibekshrestha-mayaCharts/100ef2cc-6a6d-4ae1-84cd-cf5acbe3f740/scratchpad/f";
const BASE = "http://localhost:5173/mayacharts/";
const FS = "/mayacharts/@fs/Users/bibekshrestha/mayaCharts/src/";
const which = process.argv[2];
const browsers = (process.argv[3] ?? "chromium,webkit").split(",");
const scen = (await import("./.agent-motion-scen.mjs")).default;

for (const bn of browsers) {
  const b = await (bn === "webkit" ? webkit : chromium).launch();
  const page = await b.newPage({ viewport: { width: 900, height: 700 } });
  page.on("console", (m) => m.type() === "error" && console.log(bn, "console:", m.text()));
  page.on("pageerror", (e) => console.log(bn, "pageerror:", e.message));
  await page.route("**/@vite/client", (r) =>
    r.fulfill({ contentType: "text/javascript", body: "" }),
  );
  await page.goto(BASE + "errors.html");
  await page.evaluate(async (FS) => {
    document.body.innerHTML = "";
    document.body.style.margin = "0";
    for (const m of ["element", "hierarchy", "radial", "units", "geo", "stats", "flow"])
      await import(FS + m + ".ts");
    window.mk = (spec, w = 640, h = 360) => {
      document.body.innerHTML = "";
      const el = document.createElement("maya-chart");
      el.style.cssText = `display:block;width:${w}px;height:${h}px;background:#fff`;
      document.body.append(el);
      el.spec = spec;
      window.el = el;
      return el;
    };
    window.freeze = () => {
      const a = el.shadowRoot.getAnimations();
      a.forEach((x) => x.pause());
      window.frozen = a;
      return a.length;
    };
    window.seek = (t) =>
      window.frozen.forEach((x) => {
        try {
          x.currentTime = t;
        } catch {}
      });
    window.thaw = () =>
      window.frozen.forEach((x) => {
        try {
          x.finish();
        } catch {
          x.cancel();
        }
      });
    window.boxes = (sel) =>
      [...el.shadowRoot.querySelectorAll(sel)].map((e) => {
        const r = e.getBoundingClientRect();
        return [
          e.getAttribute("data-key") ?? e.localName,
          Math.round(r.x),
          Math.round(r.y),
          Math.round(r.width),
          Math.round(r.height),
          +getComputedStyle(e).opacity,
        ];
      });
  }, FS);
  const ctx = {
    page,
    bn,
    async shot(name) {
      await page.locator("maya-chart").screenshot({ path: `${OUT}/${bn}-${which}-${name}.png` });
    },
    async settle() {
      await page.evaluate(() => el.settled.catch(() => {}));
      await page.waitForTimeout(100);
    },
    async frames(name, act, times = [0, 120, 270, 400], probe) {
      await act();
      const n = await page.evaluate(() => freeze());
      const out = [];
      for (const t of times) {
        await page.evaluate((t) => seek(t), t);
        await this.shot(`${name}-${t}`);
        if (probe) out.push([t, await page.evaluate(probe)]);
      }
      await page.evaluate(() => thaw());
      await page.waitForTimeout(700);
      await this.shot(`${name}-end`);
      if (probe) out.push(["end", await page.evaluate(probe)]);
      console.log(bn, name, "anims", n);
      const sp = await b.newPage();
      const imgs = (
        await Promise.all(
          [...times, "end"].map(
            async (t) =>
              `<figure style="margin:0 4px"><img style="width:300px;border:1px solid #ccc" src="data:image/png;base64,${(await import("node:fs")).readFileSync(`${OUT}/${bn}-${which}-${name}-${t}.png`).toString("base64")}"><figcaption>${t}</figcaption></figure>`,
          ),
        )
      ).join("");
      await sp.setContent(
        `<body style="margin:0;display:flex;font:12px sans-serif">${imgs}</body>`,
      );
      await sp.waitForTimeout(150);
      await sp.screenshot({ path: `${OUT}/strip-${bn}-${which}-${name}.png`, fullPage: true });
      await sp.close();
      if (probe) for (const o of out) console.log("  ", JSON.stringify(o));
      return out;
    },
  };
  try {
    await scen[which](ctx);
  } catch (e) {
    console.log(bn, "ERR", e.message);
  }
  await b.close();
}
