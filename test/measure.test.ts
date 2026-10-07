// @vitest-environment happy-dom
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MayaChart } from "../src/element/maya-chart.ts";
import { reduce } from "../src/element/measure.ts";
import "../src/units.ts";
import type { ChartSpec, State } from "../src/core/types.ts";

const rows = [
  { q: "Q1", a: 1, b: 5 },
  { q: "Q2", a: 2, b: 6 },
];
const spec = (extra: object = {}): ChartSpec =>
  ({
    type: "bar",
    x: "q",
    y: ["a", "b"],
    data: rows,
    titles: { b: "Beta" },
    ...extra,
  }) as ChartSpec;
const st = (measure?: number): State => ({
  view: measure === undefined ? {} : { measure },
  selected: [],
});

describe("measure.reduce", () => {
  it("sets and clamps the index", () => {
    expect(reduce(st(), { type: "measure", index: 1 }).view.measure).toBe(1);
    expect(reduce(st(), { type: "measure", index: 9, count: 2 }).view.measure).toBe(1);
    expect(reduce(st(1), { type: "measure", index: -3 }).view.measure).toBe(0);
  });
  it("resets when y changes or stops being an array; keeps on data change", () => {
    const prev = spec();
    expect(
      reduce(st(1), { type: "spec", prev, next: spec({ y: ["a", "c"] }) }).view.measure,
    ).toBeUndefined();
    expect(
      reduce(st(1), { type: "spec", prev, next: spec({ y: "a" }) }).view.measure,
    ).toBeUndefined();
    const s = st(1);
    expect(reduce(s, { type: "spec", prev, next: spec({ data: [rows[0]] }) })).toBe(s);
  });
});

const frame = () => new Promise((r) => setTimeout(r, 20));
const radios = (el: Element) => [
  ...el.shadowRoot!.querySelectorAll<HTMLElement>(".maya-ctl [role=radio]"),
];

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

async function make() {
  const el = document.createElement("maya-chart") as MayaChart;
  const views: unknown[] = [];
  el.addEventListener("maya-view", (e) => views.push((e as CustomEvent).detail));
  el.spec = spec();
  document.body.append(el);
  await frame();
  return { el, views };
}

describe("<maya-chart> measure toggle", () => {
  it("renders two radios and fires no maya-view on first render", async () => {
    const { el, views } = await make();
    expect(radios(el)).toHaveLength(2);
    expect(radios(el)[0]!.getAttribute("aria-checked")).toBe("true");
    expect(views).toHaveLength(0);
  });

  it("click commits measure 1, checks it, emits once, announces the title", async () => {
    const { el, views } = await make();
    radios(el)[1]!.click();
    await frame();
    await new Promise((r) => setTimeout(r, 320));
    expect(el.view.measure).toBe(1);
    expect(radios(el)[1]!.getAttribute("aria-checked")).toBe("true");
    expect(radios(el)[0]!.getAttribute("aria-checked")).toBe("false");
    expect(views).toEqual([{ measure: 1 }]);
    expect(el.shadowRoot!.querySelector("[data-maya=live]")!.textContent).toContain("Beta");
  });

  it("ArrowRight moves, commits and keeps focus on the active radio", async () => {
    const { el, views } = await make();
    radios(el)[0]!.focus();
    radios(el)[0]!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowRight",
        bubbles: true,
        composed: true,
        cancelable: true,
      }),
    );
    await frame();
    expect(el.view.measure).toBe(1);
    expect(views).toEqual([{ measure: 1 }]);
    expect(radios(el)[1]!.getAttribute("aria-checked")).toBe("true");
    expect(el.shadowRoot!.activeElement).toBe(radios(el)[1]);
  });
});

describe("units form control", () => {
  const dots = Array.from({ length: 6 }, (_, i) => ({
    g: i % 2 ? "A" : "B",
    v: i + 1,
    id: "r" + i,
  }));
  const keys = (el: Element) =>
    [...el.shadowRoot!.querySelectorAll("circle[data-maya=mark]")].map((c) =>
      c.getAttribute("data-key"),
    );
  const forms = (el: Element) => [
    ...el.shadowRoot!.querySelectorAll<HTMLElement>("[data-maya=form] [role=radio]"),
  ];

  it("reduce writes view.form, clamped, and leaves measure alone", () => {
    expect(reduce(st(1), { type: "form", index: 2 }).view).toEqual({ measure: 1, form: 2 });
    expect(reduce(st(), { type: "form", index: 9, count: 3 }).view.form).toBe(2);
  });

  it("click and ArrowRight write view.form; the measure toggle ignores the control; keys stay", async () => {
    const el = document.createElement("maya-chart") as MayaChart;
    const views: unknown[] = [];
    el.addEventListener("maya-view", (e) => views.push((e as CustomEvent).detail));
    el.spec = { type: "units", x: "g", y: "v", name: "id", data: dots } as ChartSpec;
    document.body.append(el);
    await frame();
    expect(el.shadowRoot!.querySelectorAll(".maya-ctl")).toHaveLength(1);
    const before = keys(el);
    forms(el)[1]!.click();
    await frame();
    expect(el.view).toEqual({ form: 1 });
    expect(views).toEqual([{ form: 1 }]);
    expect(forms(el)[1]!.getAttribute("aria-checked")).toBe("true");
    expect(keys(el)).toEqual(before);
    forms(el)[1]!.focus();
    forms(el)[1]!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, composed: true }),
    );
    await frame();
    expect(el.view.form).toBe(2);
    expect(el.shadowRoot!.activeElement).toBe(forms(el)[2]);
  });
});
