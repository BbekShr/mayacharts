// @vitest-environment happy-dom
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MayaChart } from "../src/element/maya-chart.ts";
import { reduce } from "../src/element/drill.ts";
import { MODULES } from "../src/core/registry.ts";
import "../src/hierarchy.ts";
import "../src/flow.ts";
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
  it("flows drill to path.length - 1 values, like every other type", () => {
    const three = spec({ type: "sankey", path: ["region", "state", "city"] });
    const s1 = reduce(st(), { type: "drill", value: "West", spec: three });
    expect(s1.view.drill).toEqual(["West"]);
    const s2 = reduce(s1, { type: "drill", value: "CA", spec: three });
    expect(s2.view.drill).toEqual(["West", "CA"]);
    expect(reduce(s2, { type: "drill", value: "LA", spec: three })).toBe(s2);
    expect(
      reduce(st(), { type: "drill", value: "West", spec: spec({ type: "chord" }) }).view.drill,
    ).toEqual(["West"]);
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
  const click = (e: Element) =>
    e.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true, detail: 1 }));
  it("a click on empty chart space pops one level, unless drillOut is false", async () => {
    const el = await mount(spec());
    click(byCat(el, "West"));
    await frame();
    expect(el.view?.drill).toEqual(["West"]);
    click(el.shadowRoot!.querySelector(".maya-svg")!);
    await frame();
    expect(el.view?.drill ?? []).toEqual([]);
    el.spec = spec({ drillOut: false });
    await frame();
    click(byCat(el, "West"));
    await frame();
    click(el.shadowRoot!.querySelector(".maya-svg")!);
    await frame();
    expect(el.view?.drill).toEqual(["West"]);
  });
  it("the second click of a double click does nothing", async () => {
    const el = await mount(spec());
    click(byCat(el, "West"));
    await frame();
    el.shadowRoot!.querySelector(".maya-svg")!.dispatchEvent(
      new MouseEvent("click", { bubbles: true, composed: true, detail: 2 }),
    );
    await frame();
    expect(el.view?.drill).toEqual(["West"]);
  });
  it("line: a click on the plot drills the nearest category", async () => {
    const el = await mount(spec({ type: "line" }));
    // The plot-wide hit stands for the point nearest the pointer (x 0: the first category).
    click(el.shadowRoot!.querySelector("[data-maya=hit]")!);
    await frame();
    expect(el.view?.drill).toEqual(["West"]);
  });
  it("sunburst: a slice drills to its branch, the centre pops", async () => {
    const el = await mount(spec({ type: "sunburst" }));
    click(marks(el).find((m) => m.getAttribute("data-key") === "h~West~CA")!);
    await frame();
    expect(el.view?.drill).toEqual(["West"]);
    click(marks(el).find((m) => m.getAttribute("data-depth") === "0")!);
    await frame();
    expect(el.view?.drill ?? []).toEqual([]);
  });
  it("sankey: an outer node drills by name, an inner one does not", async () => {
    const rows = [
      { region: "West", state: "CA", city: "LA", v: 5 },
      { region: "West", state: "OR", city: "PDX", v: 3 },
      { region: "East", state: "NY", city: "NYC", v: 4 },
    ];
    const el = await mount(spec({ type: "sankey", path: ["region", "state", "city"], data: rows }));
    click(marks(el).find((m) => m.getAttribute("data-key") === "n~1~CA")!);
    await frame();
    expect(el.view?.drill ?? []).toEqual([]);
    click(marks(el).find((m) => m.getAttribute("data-key") === "n~0~West")!);
    await frame();
    expect(el.view?.drill).toEqual(["West"]);
    // Keys keep the level in the whole path, so the state nodes survive the drill.
    expect(marks(el).some((m) => m.getAttribute("data-key") === "n~1~CA")).toBe(true);
  });
  it("a keyboard drill waits on the animations of the whole marks subtree", async () => {
    const el = await mount(spec());
    const asked: unknown[] = [];
    const was = Element.prototype.getAnimations;
    Element.prototype.getAnimations = function (this: Element, o?: GetAnimationsOptions) {
      if (this.matches("[data-maya=marks]")) asked.push(o);
      return [];
    };
    const svg = el.shadowRoot!.querySelector(".maya-svg")!;
    for (const key of ["ArrowRight", "Enter"])
      svg.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, composed: true, cancelable: true }),
      );
    await frame();
    Element.prototype.getAnimations = was;
    expect(el.view?.drill?.length).toBe(1);
    expect(asked).toContainEqual({ subtree: true });
  });
  it("sankey: a drill hides the tooltip, as a zoom does", async () => {
    const rows = [
      { region: "West", state: "CA", city: "LA", v: 5 },
      { region: "East", state: "NY", city: "NYC", v: 4 },
    ];
    const el = await mount(spec({ type: "sankey", path: ["region", "state", "city"], data: rows }));
    const [node, inner] = ["n~0~West", "n~1~CA"].map((k) =>
      marks(el).find((m) => m.getAttribute("data-key") === k)!,
    );
    // The hovered node survives the drill (stable keys): the tooltip would stay on it.
    inner!.dispatchEvent(
      Object.assign(new Event("pointerover", { bubbles: true }), { pointerType: "mouse" }),
    );
    const tip = el.shadowRoot!.querySelector(".maya-tip")!;
    expect(tip.classList.contains("maya-open")).toBe(true);
    click(node!);
    await frame();
    expect(el.view?.drill).toEqual(["West"]);
    expect(tip.classList.contains("maya-open")).toBe(false);
  });
});

describe("drill with select, and maya-drill-leaf", () => {
  const evs = (el: Element, type: string) => {
    const got: any[] = [];
    el.addEventListener(type, (e) => got.push((e as CustomEvent).detail));
    return got;
  };
  const click = (m: Element, detail = 1) =>
    m.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true, detail }));
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  it("a click selects after the double-click interval; a double click drills with no selection event", async () => {
    const el = await mount(spec({ select: "multi" }));
    el.selected = [{ x: "East" }];
    await frame();
    const sel = evs(el, "maya-select");
    click(byCat(el, "West"), 1);
    expect(el.selected).toEqual([{ x: "East" }]); // not yet
    await wait(300);
    expect(el.selected).toEqual([{ x: "East" }, { x: "West" }]);
    expect(sel).toHaveLength(1);
    click(byCat(el, "East"), 1);
    click(byCat(el, "East"), 2);
    await wait(300);
    expect(sel).toHaveLength(2); // the pair added none; the drill's own clear is the second
    expect(el.view?.drill).toEqual(["East"]);
  });
  it("a double click on a leaf selects nothing and reports the leaf", async () => {
    const el = await mount(spec({ select: true }));
    el.view = { drill: ["West"] };
    await frame();
    const leaf = evs(el, "maya-drill-leaf");
    const sel = evs(el, "maya-select");
    click(byCat(el, "CA"), 1);
    click(byCat(el, "CA"), 2);
    await wait(300);
    expect(el.selected).toEqual([]);
    expect(sel).toEqual([]);
    expect(leaf).toEqual([{ path: ["West", "CA"] }]);
  });
  it("Enter selects, Shift+Enter drills", async () => {
    const el = await mount(spec({ select: true }));
    const m = byCat(el, "West");
    const key = (shiftKey: boolean) => {
      m.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, composed: true }));
      el.shadowRoot!.querySelector(".maya-svg")!.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowRight",
          bubbles: true,
          composed: true,
          cancelable: true,
        }),
      );
      el.shadowRoot!.querySelector(".maya-svg")!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", shiftKey, bubbles: true, composed: true }),
      );
    };
    key(false);
    await frame();
    expect(el.selected.length).toBe(1);
    expect(el.view?.drill ?? []).toEqual([]);
    key(true);
    await frame();
    expect(el.view?.drill?.length).toBe(1);
  });
  it("the drill gesture at the deepest level fires maya-drill-leaf; without select a click does", async () => {
    const el = await mount(spec());
    const leaf = evs(el, "maya-drill-leaf");
    click(byCat(el, "West"));
    await frame();
    expect(leaf).toEqual([]);
    click(byCat(el, "OR"));
    expect(leaf).toEqual([{ path: ["West", "OR"] }]);
  });
  it("a pinned or touched tooltip offers Drill into, and it drills", async () => {
    const el = await mount(spec({ select: true }));
    const m = byCat(el, "West");
    m.dispatchEvent(
      new PointerEvent("pointerdown", { pointerType: "touch", bubbles: true, composed: true }),
    );
    m.dispatchEvent(
      new PointerEvent("pointerup", { pointerType: "touch", bubbles: true, composed: true }),
    );
    const b = el.shadowRoot!.querySelector<HTMLButtonElement>(".maya-tip button[data-drill]")!;
    expect(b.textContent).toBe("Drill into West");
    click(b, 1);
    await frame();
    expect(el.view?.drill).toEqual(["West"]);
  });
});

describe("nested treemap and title slot", () => {
  it("a child tile (data-to) drills into its parent only", async () => {
    const el = await mount(
      spec({
        type: "treemap",
        path: ["region", "state", "city"],
        depth: 2,
        data: data.map((r) => ({ ...r, city: r.state + "c" })),
      }),
    );
    const child = marks(el).find((m) => m.getAttribute("data-key") === "h~West~CA")!;
    expect(child.getAttribute("data-to")).toBe("1");
    child.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await frame();
    expect(el.view?.drill).toEqual(["West"]);
  });
  it("title and subtitle are replaced together, whichever appears or goes", async () => {
    const el = await mount(spec({ title: "T", subtitle: "S {total}" }));
    const q = () =>
      [...el.shadowRoot!.querySelectorAll(".maya-title,.maya-sub")].map((e) => e.className);
    expect(q()).toEqual(["maya-title", "maya-sub"]);
    el.spec = spec({ title: "T2" });
    await frame();
    expect(q()).toEqual(["maya-title"]);
    el.spec = spec({ title: "T3", subtitle: "S2" });
    await frame();
    expect(q()).toEqual(["maya-title", "maya-sub"]);
    expect(el.shadowRoot!.querySelector(".maya-sub")!.textContent).toBe("S2");
  });
});
