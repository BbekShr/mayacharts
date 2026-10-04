import { chromium, firefox, webkit } from "@playwright/test";

const html = `<svg width="20" height="20"><rect width="20" height="20" style="--c:color-mix(in oklab,oklch(.6 .17 255) 50%,transparent);fill:var(--c)"/></svg>`;
for (const [name, type] of Object.entries({ chromium, firefox, webkit })) {
  try {
    const b = await type.launch();
    const p = await b.newPage();
    await p.setContent(html);
    console.log(name, await p.$eval("rect", (r) => getComputedStyle(r).fill));
    await b.close();
  } catch (e) {
    console.log(name, "FAILED", String(e.message).split("\n")[0]);
  }
}
