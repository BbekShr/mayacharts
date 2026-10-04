// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { MayaChart } from "../src/element/maya-chart.ts";
import type { ChartSpec } from "../src/core/types.ts";

const frame = () => new Promise((r) => setTimeout(r, 30));
const root = (el: Element) => el.shadowRoot!;

beforeAll(() => {
  // Animations that never finish on their own: ghosts must still leave on their timers.
  Element.prototype.animate = (() => ({
    cancel() {},
    addEventListener() {},
    playState: "running",
  })) as never;
  Element.prototype.getAnimations = () => [];
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

const kpi = (v: number): ChartSpec =>
  ({
    type: "kpi",
    x: "m",
    y: "v",
    format: "compact",
    data: [
      { m: "a", v: v / 2 },
      { m: "b", v: v * 0.8 },
      { m: "c", v },
    ],
  }) as unknown as ChartSpec;

describe("motion", () => {
  it("a kpi value counts up and ends on the latest number after rapid updates", async () => {
    const el = document.createElement("maya-chart") as MayaChart;
    el.spec = kpi(1_200_000);
    document.body.append(el);
    await frame();
    const value = () => root(el).querySelector("text[data-maya=mark]")!.textContent;
    el.spec = kpi(1_500_000);
    await frame();
    el.spec = kpi(1_900_000);
    await new Promise((r) => setTimeout(r, 1200));
    expect(value()).toBe("1.9M");
    el.remove();
  });

  it("a path that changes shape leaves a ghost with the OLD outline, then removes it", async () => {
    const rows = (k: number) => ["a", "b", "c"].map((x, i) => ({ x, v: (i + 1) * k }));
    const el = document.createElement("maya-chart") as MayaChart;
    el.spec = { type: "line", x: "x", y: "v", data: rows(1) } as unknown as ChartSpec;
    document.body.append(el);
    await frame();
    const before = root(el).querySelector("path[data-maya=line][data-key]")!.getAttribute("d");
    // Different point count: no morph, crossfade.
    el.spec = {
      type: "line",
      x: "x",
      y: "v",
      data: [...rows(2), { x: "d", v: 9 }],
    } as unknown as ChartSpec;
    await frame();
    const ghost = root(el).querySelector("path[data-ghost]");
    expect(ghost?.getAttribute("d")).toBe(before);
    expect(ghost?.hasAttribute("data-key")).toBe(false);
    await new Promise((r) => setTimeout(r, 800));
    expect(root(el).querySelector("[data-ghost]")).toBeNull();
    el.remove();
  });

  it("toggling a legend entry keeps keyboard focus on it", async () => {
    const el = document.createElement("maya-chart") as MayaChart;
    el.spec = {
      type: "bar",
      x: "q",
      y: "v",
      series: "s",
      data: [
        { q: "Q1", s: "A", v: 1 },
        { q: "Q1", s: "B", v: 2 },
      ],
    } as unknown as ChartSpec;
    document.body.append(el);
    await frame();
    const btn = () => root(el).querySelector<HTMLButtonElement>("[data-maya=legend] button")!;
    btn().focus();
    btn().click();
    await frame();
    expect(root(el).activeElement).toBe(btn());
    expect(btn().getAttribute("aria-pressed")).toBe("false");
    el.remove();
  });

  it("animate: false marks the root so CSS transitions stop", async () => {
    const el = document.createElement("maya-chart") as MayaChart;
    el.spec = { type: "bar", x: "q", y: "v", animate: false, data: [{ q: "a", v: 1 }] } as never;
    document.body.append(el);
    await frame();
    expect(root(el).querySelector(".maya")!.hasAttribute("data-still")).toBe(true);
    el.remove();
  });
});
