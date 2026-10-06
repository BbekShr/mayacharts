// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MayaChart } from "../src/element/maya-chart.ts";
import { reduce } from "../src/element/play.ts";
import type { ChartSpec, State } from "../src/core/types.ts";

const rows = ["2021", "2022", "2023"].flatMap((yr) => [
  { yr, k: "A", v: 1, w: 3 },
  { yr, k: "B", v: 2, w: 4 },
]);
const spec = (extra: object = {}): ChartSpec =>
  ({ type: "bar", x: "k", y: ["v", "w"], frame: "yr", title: "T", data: rows, ...extra }) as never;
const st = (frame?: number): State => ({
  view: frame === undefined ? {} : { frame },
  selected: [],
});

describe("play.reduce", () => {
  it("drops the frame when spec.frame changes, keeps it otherwise", () => {
    const prev = spec();
    expect(reduce(st(1), { type: "spec", prev, next: spec({ frame: "k" }) }).view.frame).toBe(
      undefined,
    );
    const s = st(1);
    expect(reduce(s, { type: "spec", prev, next: spec({ data: rows.slice(0, 4) }) })).toBe(s);
  });
});

beforeAll(() => {
  Element.prototype.animate = (() => ({
    finished: Promise.resolve(),
    onfinish: null,
    addEventListener(_: string, f: () => void) {
      f();
    },
  })) as never;
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
afterEach(() => vi.useRealTimers());

const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);
const btns = (el: Element) => el.shadowRoot!.querySelectorAll<HTMLElement>(".maya-play");

async function make() {
  vi.useFakeTimers();
  const el = document.createElement("maya-chart") as MayaChart;
  const views: any[] = [];
  el.addEventListener("maya-view", (e) => views.push((e as CustomEvent).detail));
  el.spec = spec();
  document.body.append(el);
  await tick(20);
  return { el, views };
}

describe("<maya-chart> frame playback", () => {
  it("starts paused on the last frame with one Play button", async () => {
    const { el, views } = await make();
    expect(btns(el)).toHaveLength(1);
    expect(btns(el)[0]!.textContent).toBe("Play");
    expect(views).toHaveLength(0);
  });

  it("restarts at frame 0, steps, relabels, stops at the end, emits maya-view", async () => {
    const { el, views } = await make();
    btns(el)[0]!.click();
    await tick(20);
    expect(el.view.frame).toBe(0);
    expect(btns(el)[0]!.textContent).toBe("Pause");
    await tick(900);
    expect(el.view.frame).toBe(1);
    await tick(900);
    expect(el.view.frame).toBe(2);
    expect(btns(el)[0]!.textContent).toBe("Play");
    await tick(2000);
    expect(views.map((v) => v.frame)).toEqual([0, 1, 2]);
  });

  it("Pause stops the timer", async () => {
    const { el } = await make();
    btns(el)[0]!.click();
    await tick(20);
    btns(el)[0]!.click();
    await tick(2000);
    expect(el.view.frame).toBe(0);
    expect(btns(el)[0]!.textContent).toBe("Play");
  });

  it("keeps one button and the label across a measure change", async () => {
    const { el } = await make();
    btns(el)[0]!.click();
    await tick(20);
    el.view = { ...el.view, measure: 1 };
    await tick(20);
    expect(btns(el)).toHaveLength(1);
    expect(btns(el)[0]!.textContent).toBe("Pause");
  });

  it("a new spec stops playback", async () => {
    const { el } = await make();
    btns(el)[0]!.click();
    await tick(20);
    el.spec = spec({ title: "U" });
    await tick(900);
    expect(btns(el)[0]!.textContent).toBe("Play");
    await tick(1800);
    expect(el.view.frame).toBe(0);
  });
});
