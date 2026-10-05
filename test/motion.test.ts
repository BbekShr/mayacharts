// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { MayaChart } from "../src/element/maya-chart.ts";
import type { ChartSpec } from "../src/core/types.ts";
import { patch } from "../src/element/animate.ts";

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

  /** Record every animate() call: element, keyframes. */
  const spy = () => {
    const calls: { e: Element; k: Keyframe[] }[] = [];
    const orig = Element.prototype.animate;
    Element.prototype.animate = function (this: Element, k: Keyframe[]) {
      calls.push({ e: this, k });
      return orig.call(this, k as never) as never;
    } as never;
    return { calls, done: () => (Element.prototype.animate = orig) };
  };

  it("a fade in leaves its end opacity to the CSS value; a fade out starts from it", async () => {
    const rows = (k: number) => ["a", "b", "c"].map((x, i) => ({ x, v: (i + 1) * k }));
    const el = document.createElement("maya-chart") as MayaChart;
    el.spec = { type: "line", x: "x", y: "v", data: rows(1) } as unknown as ChartSpec;
    document.body.append(el);
    await frame();
    const s = spy();
    el.spec = {
      type: "line",
      x: "x",
      y: "v",
      data: [...rows(2), { x: "d", v: 9 }],
    } as unknown as ChartSpec;
    await frame();
    s.done();
    const paths = s.calls.filter((c) => c.e.matches("path[data-maya=line]"));
    const inn = paths.find((c) => !c.e.hasAttribute("data-ghost"))!;
    const out = paths.find((c) => c.e.hasAttribute("data-ghost"))!;
    expect(inn.k).toEqual([{ opacity: 0 }, {}]);
    expect(out.k).toEqual([{}, { opacity: 0 }]);
    el.remove();
  });

  it("a drill zoom moves circles by translate only and maps dumbbell connector ends", () => {
    const box = document.createElement("div");
    const svg = (marks: string) =>
      `<svg viewBox="0 0 100 100" data-plot="10 10 80 80"><g data-maya="marks">${marks}</g></svg>`;
    const dot = (k: string, x: number, y: number) =>
      `<circle data-maya="mark" data-key="${k}" cx="${x}" cy="${y}" r="3"/>`;
    const link = (k: string, x: number) =>
      `<line data-maya="link" data-key="${k}" x1="${x}" y1="20" x2="${x}" y2="40"/>`;
    patch(box, svg(dot("a~A", 20, 30) + dot("a~B", 70, 30) + link("k~A", 20)), false);
    const s = spy();
    patch(box, svg(dot("c~x", 50, 50) + link("k~x", 50)), true, { zoom: { in: "A" } });
    s.done();
    const tr = (sel: string) =>
      s.calls
        .filter((c) => c.e.matches(sel))
        .map((c) => JSON.stringify(c.k.map((f) => f.transform)));
    const circles = tr("circle");
    expect(circles.length).toBe(3); // clip is on the group; two exit, one enters
    for (const t of circles) {
      expect(t).toContain("translate(");
      expect(t).not.toContain("scale");
    }
    const lines = tr("line");
    expect(lines.length).toBe(2);
    for (const t of lines) expect(t).toContain("matrix(1,0,0,"); // stroke width keeps its scale
  });

  it("a group already fading out is not ghosted again by the next patch", async () => {
    const el = document.createElement("maya-chart") as MayaChart;
    const at = (k: number) =>
      ({
        type: "bar",
        x: "x",
        y: "v",
        labels: true,
        data: [
          { x: "a", v: k },
          { x: "b", v: 2 * k },
        ],
      }) as unknown as ChartSpec;
    el.spec = at(1);
    document.body.append(el);
    await frame();
    const s = spy();
    el.spec = at(1000);
    await frame();
    el.spec = at(5);
    await frame();
    s.done();
    const out = s.calls.filter((c) => c.e.localName === "g" && c.k.at(-1)?.opacity === 0);
    expect(out.length).toBeGreaterThan(0);
    expect(new Set(out.map((c) => c.e)).size).toBe(out.length);
    el.remove();
  });
});
