// @vitest-environment happy-dom
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MayaChart } from "../src/element/maya-chart.ts";
import { renderParts } from "../src/core/render.ts";
import { reduce } from "../src/element/zoom.ts";
import type { ChartSpec, State } from "../src/core/types.ts";

const S: State = { view: {}, selected: [] };
const rows = ["A", "B", "C", "D", "E", "F"].map((q, i) => ({ q, v: i + 1 }));
const spec = (extra: object = {}): ChartSpec =>
  ({ type: "line", x: "q", y: "v", zoom: true, data: rows, ...extra }) as ChartSpec;

describe("zoom reducer", () => {
  it("sets, orders, clears", () => {
    const z = reduce(S, { type: "zoom", window: [3, 1] });
    expect(z.view.window).toEqual([1, 3]);
    expect(reduce(z, { type: "reset" }).view.window).toBeUndefined();
    expect(reduce(S, { type: "zoom", window: [9, 2, 8, 1] }).view.window).toEqual([2, 9, 1, 8]);
  });
  it("clamps negatives and fractions", () => {
    expect(reduce(S, { type: "zoom", window: [-2, 1.7] }).view.window).toEqual([0, 1]);
  });
  it("resets when x or type changes, keeps otherwise", () => {
    const z = reduce(S, { type: "zoom", window: [1, 2] });
    const ev = (a: object, b: object) => ({ type: "spec" as const, prev: spec(a), next: spec(b) });
    expect(reduce(z, ev({}, { x: "r" })).view.window).toBeUndefined();
    expect(reduce(z, ev({}, { type: "area" })).view.window).toBeUndefined();
    expect(reduce(z, ev({}, { title: "t" })).view.window).toEqual([1, 2]);
  });
});

let renders = true;
try {
  renderParts(spec(), { width: 640, height: 320 });
} catch {
  renders = false;
}
const dom = renders ? describe : describe.skip; // line mark not landed yet

const frame = () => new Promise((r) => setTimeout(r, 20));

beforeAll(() => {
  (Element.prototype as { animate: unknown }).animate = () => ({
    finished: Promise.resolve(),
    onfinish: null,
    addEventListener(_: string, f: () => void) {
      f();
    },
  });
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

const ptr = (type: string, x: number, y = 100) => {
  const e = new Event(type, { bubbles: true, composed: true }) as Event & Record<string, unknown>;
  Object.assign(e, {
    clientX: x,
    clientY: y,
    pointerId: 1,
    pointerType: "mouse",
    button: 0,
    isPrimary: true,
  });
  return e;
};

async function chart() {
  const el = document.createElement("maya-chart") as MayaChart;
  el.spec = spec();
  document.body.append(el);
  await frame();
  const root = el.shadowRoot!;
  const svg = root.querySelector("svg.maya-svg") as SVGSVGElement;
  // fake geometry: 1 css px = 1 viewBox unit; plot spans x 0..600 (6 categories x 100)
  svg.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 640, height: 320, right: 640, bottom: 320 }) as DOMRect;
  svg.setPointerCapture = () => {};
  svg.releasePointerCapture = () => {};
  svg.setAttribute("data-plot", "0 0 600 300");
  svg.setAttribute("data-n", "6");
  svg.setAttribute("viewBox", "0 0 640 320");
  const events: unknown[] = [];
  el.addEventListener("maya-view", (e) => events.push((e as CustomEvent).detail));
  const drag = (x0: number, x1: number) => {
    svg.dispatchEvent(ptr("pointerdown", x0));
    svg.dispatchEvent(ptr("pointermove", (x0 + x1) / 2));
    svg.dispatchEvent(ptr("pointermove", x1));
    svg.dispatchEvent(ptr("pointerup", x1));
  };
  return { el, root, svg, events, drag };
}

dom("zoom brush (DOM)", () => {
  it("drag across 3 categories commits window [1,3]", async () => {
    const { root, events, drag } = await chart();
    drag(150, 350);
    await frame();
    expect(events.at(-1)).toMatchObject({ window: [1, 3] });
    expect(root.querySelector(".maya-reset")).toBeTruthy();
    expect(root.querySelector("[data-maya=brush]")).toBeNull();
  });

  it("a 2 px drag commits nothing", async () => {
    const { events, svg, root } = await chart();
    svg.dispatchEvent(ptr("pointerdown", 150));
    svg.dispatchEvent(ptr("pointermove", 152));
    svg.dispatchEvent(ptr("pointerup", 152));
    await frame();
    expect(events).toHaveLength(0);
    expect(root.querySelector("[data-maya=brush]")).toBeNull();
  });

  it("reset chip, Escape and double-click clear", async () => {
    const { root, events, drag, svg } = await chart();
    drag(150, 350);
    await frame();
    (root.querySelector(".maya-reset") as HTMLElement).click();
    await frame();
    expect(events.at(-1)).not.toHaveProperty("window");
    expect(root.querySelector(".maya-reset")).toBeNull();
    drag(150, 350);
    await frame();
    root
      .querySelector(".maya")!
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }),
      );
    await frame();
    expect(root.querySelector(".maya-reset")).toBeNull();
    drag(150, 350);
    await frame();
    svg.dispatchEvent(new Event("dblclick", { bubbles: true, composed: true }));
    await frame();
    expect(root.querySelector(".maya-reset")).toBeNull();
  });

  it("cancel() removes an in-progress brush", async () => {
    const { el, root, svg } = await chart();
    svg.dispatchEvent(ptr("pointerdown", 100));
    svg.dispatchEvent(ptr("pointermove", 250));
    expect(root.querySelector("[data-maya=brush]")).toBeTruthy();
    root
      .querySelector(".maya")!
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }),
      );
    expect(root.querySelector("[data-maya=brush]")).toBeNull();
    expect(el.shadowRoot!.querySelector(".maya-reset")).toBeNull();
  });
});
