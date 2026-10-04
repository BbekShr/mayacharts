// @vitest-environment happy-dom
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MayaChart } from "../src/element/maya-chart.ts";
import { reduce } from "../src/element/drill.ts";
import { MODULES } from "../src/core/registry.ts";
import type { ChartSpec, State } from "../src/core/types.ts";

const data = [
  { region: "West", state: "CA", v: 5 },
  { region: "West", state: "OR", v: 3 },
  { region: "East", state: "NY", v: 4 },
];
const spec = (extra: object = {}): ChartSpec =>
  ({ type: "bar", y: "v", path: ["region", "state"], drill: true, data, ...extra }) as ChartSpec;
const st = (drill?: string[]): State => ({ view: drill ? { drill } : {}, selected: [{ x: "a" }] });
const ev = (prev: ChartSpec | undefined, next: ChartSpec) => ({
  type: "spec" as const,
  prev,
  next,
});

describe("drill reducer", () => {
  it("pushes, clears selection, and stops at the last level", () => {
    const s1 = reduce(st(), { type: "drill", value: "West", spec: spec() });
    expect(s1.view.drill).toEqual(["West"]);
    expect(s1.selected).toEqual([]);
    expect(reduce(s1, { type: "drill", value: "CA", spec: spec() })).toBe(s1);
    const deep = spec({ path: ["region", "state", "city"] });
    expect(reduce(s1, { type: "drill", value: "CA", spec: deep }).view.drill).toEqual([
      "West",
      "CA",
    ]);
  });
  it("ignores push without drill/path", () => {
    const s = st();
    expect(reduce(s, { type: "drill", value: "West", spec: spec({ drill: false }) })).toBe(s);
    expect(reduce(s, { type: "drill", value: "West", spec: spec({ path: undefined }) })).toBe(s);
    expect(reduce(s, { type: "drill", value: "West" })).toBe(s);
  });
  it("pops by depth", () => {
    expect(reduce(st(["a", "b"]), { type: "pop", depth: 1 }).view.drill).toEqual(["a"]);
    expect(reduce(st(["a"]), { type: "pop", depth: 0 }).view.drill).toEqual([]);
  });
  it("resets when type/x/path change", () => {
    const a = spec();
    for (const b of [
      spec({ type: "line" }),
      spec({ x: "state" }),
      spec({ path: ["state", "region"] }),
    ])
      expect(reduce(st(["West"]), ev(a, b)).view.drill).toEqual([]);
  });
  it("keeps a branch that still exists, pops to the deepest that does", () => {
    const a = spec({ path: ["region", "state", "city"] });
    const data2 = [{ region: "West", state: "CA", city: "LA", v: 1 }];
    const s = st(["West", "CA"]);
    const same = { ...a, data: data2 };
    expect(reduce(s, ev(a, same)).view.drill).toEqual(["West", "CA"]);
    const gone = { ...a, data: [{ region: "West", state: "OR", city: "X", v: 1 }] };
    expect(reduce(s, ev(a, gone)).view.drill).toEqual(["West"]);
    const none = { ...a, data: [{ region: "East", state: "NY", city: "X", v: 1 }] };
    expect(reduce(s, ev(a, none)).view.drill).toEqual([]);
  });
  it("resets when drill is turned off", () => {
    expect(reduce(st(["West"]), ev(spec(), spec({ drill: false }))).view.drill).toEqual([]);
  });
});

beforeAll(() => {
  const anim = () => ({
    finished: Promise.resolve(),
    onfinish: null,
    addEventListener: (_: string, f: () => void) => f(),
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
const frame = () => new Promise((r) => setTimeout(r, 20));
async function mount(s: ChartSpec): Promise<MayaChart> {
  const el = document.createElement("maya-chart") as MayaChart;
  el.spec = s;
  document.body.append(el);
  await frame();
  return el;
}
const marks = (el: Element) => [
  ...el.shadowRoot!.querySelectorAll<SVGElement>("[data-maya=mark][data-key]"),
];
const byCat = (el: Element, c: string) => marks(el).find((m) => m.getAttribute("data-x") === c)!;

describe("drill in <maya-chart>", () => {
  it("click drills, renders crumbs, Escape pops, emits maya-view", async () => {
    const el = await mount(spec());
    const views: unknown[] = [];
    el.addEventListener("maya-view", (e) => views.push((e as CustomEvent).detail));
    byCat(el, "West").dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await frame();
    expect(el.view?.drill).toEqual(["West"]);
    expect(views).toEqual([{ drill: ["West"] }]);
    expect(
      marks(el)
        .map((m) => m.getAttribute("data-x"))
        .sort(),
    ).toEqual(["CA", "OR"]);
    const nav = el.shadowRoot!.querySelector(".maya-crumbs")!;
    expect(nav.querySelector("[data-depth='0']")!.textContent).toBe("Back");
    expect(nav.querySelector("[aria-current]")!.textContent).toBe("West");
    // last level: another click is inert
    byCat(el, "CA").dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await frame();
    expect(el.view?.drill).toEqual(["West"]);
    el.shadowRoot!.querySelector(".maya")!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }),
    );
    await frame();
    expect(el.view?.drill ?? []).toEqual([]);
    expect(views.at(-1)).toEqual({ drill: [] });
    expect(el.shadowRoot!.querySelector("nav.maya-crumbs")).toBeNull();
  });
  it("Back crumb pops to root", async () => {
    const el = await mount(spec());
    byCat(el, "East").dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await frame();
    el.shadowRoot!.querySelector<HTMLElement>(".maya-crumbs [data-depth='0']")!.click();
    await frame();
    expect(el.view?.drill ?? []).toEqual([]);
  });
  it("clears selection on drill and ignores data-other marks", async () => {
    const el = await mount(spec());
    const m = byCat(el, "West");
    m.setAttribute("data-other", "");
    m.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await frame();
    expect(el.view?.drill ?? []).toEqual([]);
  });
  it.skipIf(!MODULES.has("treemap"))("drills a treemap", async () => {
    const el = await mount(spec({ type: "treemap" }));
    marks(el)[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await frame();
    expect(el.view?.drill?.length).toBe(1);
  });
});
