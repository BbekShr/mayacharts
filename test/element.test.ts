// @vitest-environment happy-dom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { patch } from "../src/element/animate.ts";
import { MayaChart } from "../src/element/maya-chart.ts";
import { renderParts } from "../src/core/render.ts";
import type { ChartSpec } from "../src/core/types.ts";

const rows = [
  { q: "Q1", r: "N", v: 3 },
  { q: "Q1", r: "S", v: -2 },
  { q: "Q2", r: "N", v: 5 },
];
const spec = (data = rows, extra: object = {}): ChartSpec =>
  ({ type: "bar", x: "q", y: "v", series: "r", data, ...extra }) as ChartSpec;
const frame = () => new Promise((r) => setTimeout(r, 20));
const marks = (el: Element) => [...el.shadowRoot!.querySelectorAll("[data-maya=mark][data-key]")];

beforeAll(() => {
  const anim = () => ({
    finished: Promise.resolve(),
    onfinish: null,
    addEventListener(_: string, f: () => void) {
      f();
    },
  });
  Element.prototype.animate = anim as never;
  HTMLElement.prototype.showPopover = () => {};
  HTMLElement.prototype.hidePopover = () => {};
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  } as never;
  globalThis.CSSStyleSheet = class {
    cssRules: unknown[] = [];
    replaceSync(s: string) {
      this.cssRules = [s];
    }
  } as never;
  globalThis.matchMedia = (() => ({ matches: false })) as never;
  if (!customElements.get("maya-chart")) customElements.define("maya-chart", MayaChart);
});
beforeEach(() => {
  document.body.innerHTML = "";
});

async function mount(init: (el: MayaChart) => void, child = ""): Promise<MayaChart> {
  const el = document.createElement("maya-chart") as MayaChart;
  el.innerHTML = child;
  init(el);
  document.body.append(el);
  await frame();
  return el;
}

describe("<maya-chart>", () => {
  it("spec precedence: property > JSON child > attribute", async () => {
    const mk = (n: string) => spec([{ q: n, r: "N", v: 1 }]);
    const el = await mount(
      (e) => e.setAttribute("spec", JSON.stringify(mk("attr"))),
      `<script type="application/json">${JSON.stringify(mk("json"))}</script>`,
    );
    expect(marks(el)[0]!.getAttribute("data-x")).toBe("json");
    el.spec = mk("prop");
    await frame();
    expect(marks(el)[0]!.getAttribute("data-x")).toBe("prop");
  });

  it("attribute alone works and data setter updates marks", async () => {
    const el = await mount((e) => e.setAttribute("spec", JSON.stringify(spec())));
    expect(marks(el)).toHaveLength(3);
    el.data = rows.slice(0, 2);
    await frame();
    expect(marks(el)).toHaveLength(2);
    expect(el.data).toHaveLength(2);
  });

  it("diff keeps nodes by data-key, appends and removes", () => {
    const box = document.createElement("div");
    const svg = (d: typeof rows) => renderParts(spec(d), { width: 640, height: 320 }).svg;
    patch(box, svg(rows), false);
    const first = [...box.querySelectorAll("[data-key]")];
    patch(box, svg([rows[0]!, rows[2]!, { q: "Q3", r: "N", v: 1 }]), true);
    const now = [...box.querySelectorAll("[data-key]")];
    expect(now.map((m) => m.getAttribute("data-key"))).toEqual(["N~Q1", "N~Q2", "N~Q3"]);
    expect(now[0]).toBe(first[0]);
    expect(now[1]).toBe(first[2]);
    expect(box.querySelectorAll("[data-maya=mark]")).toHaveLength(3);
    expect(first[1]!.isConnected).toBe(false);
  });

  it("legend click toggles series and keeps the last one", async () => {
    const el = await mount((e) => (e.spec = spec()));
    const btn = () => [
      ...el.shadowRoot!.querySelectorAll<HTMLElement>("[data-maya=legend] button"),
    ];
    btn()[1]!.click();
    await frame();
    expect(btn()[1]!.getAttribute("aria-pressed")).toBe("false");
    expect(marks(el).every((m) => m.getAttribute("data-series") === "N")).toBe(true);
    btn()[0]!.click();
    await frame();
    expect(btn()[0]!.getAttribute("aria-pressed")).toBe("true");
  });

  it("invalid spec shows .maya-err", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const el = await mount((e) => (e.spec = { type: "bar" } as never));
    expect(el.shadowRoot!.querySelector(".maya-err")?.textContent).toBeTruthy();
    expect(err).toHaveBeenCalledTimes(1);
    err.mockRestore();
  });

  it("tooltip content is text, not HTML", async () => {
    const evil = "<img src=x onerror=alert(1)>";
    const el = await mount((e) => (e.spec = spec([{ q: evil, r: evil, v: 1 }])));
    const m = marks(el)[0]!;
    m.dispatchEvent(new Event("pointerover", { bubbles: true }) as never);
    const ev = Object.assign(new Event("pointermove", { bubbles: true }), { pointerType: "mouse" });
    m.dispatchEvent(ev);
    const tip = el.shadowRoot!.querySelector(".maya-tip")!;
    expect(tip.textContent).toContain(evil);
    expect(tip.querySelector("img")).toBeNull();
    expect(m.hasAttribute("data-active")).toBe(true);
  });
});
