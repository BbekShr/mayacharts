// @vitest-environment happy-dom
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MayaChart } from "../src/element/maya-chart.ts";
import { reduce } from "../src/element/drill.ts";
import { reduce as xreduce } from "../src/element/expand.ts";
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

describe("M4 reducers", () => {
  const sp = (extra: object) =>
    ({ type: "area", x: "q", y: "v", drill: true, data: [], ...extra }) as ChartSpec;
  const push = (s: State, value: string, spec: ChartSpec) =>
    reduce(s, { type: "drill", value, spec });
  it("gates pushes on drillDepth: seriesPath, drillTo, chord with 3 levels", () => {
    const sps = sp({ seriesPath: ["fam", "item"] });
    const s1 = push(st(), "Outerwear", sps);
    expect(s1.view.drill).toEqual(["Outerwear"]);
    expect(push(s1, "Jackets", sps)).toBe(s1);
    const dt = sp({ type: "line", series: "yr", drill: false, drillTo: { type: "bar" } });
    expect(push(st(), "2025", dt).view.drill).toEqual(["2025"]);
    const c3 = sp({ type: "chord", path: ["a", "b", "c"] });
    const c1 = push(st(), "Outerwear", c3);
    expect(push(c1, "x", c3)).toBe(c1);
  });
  it("persistence filters each level on its own field", () => {
    const rows = [{ q: 1, fam: "O", item: "J", v: 1 }];
    const a = sp({ seriesPath: ["fam", "item"], data: rows });
    expect(reduce(st(["O"]), ev(a, { ...a, data: [...rows] })).view.drill).toEqual(["O"]);
    expect(reduce(st(["Z"]), ev(a, { ...a, data: [...rows] })).view.drill).toEqual([]);
    const dt = sp({ type: "line", series: "yr", drillTo: { type: "bar" }, data: [{ yr: 5 }] });
    expect(reduce(st(["5"]), ev(dt, { ...dt, data: [{ yr: 5 }] })).view.drill).toEqual(["5"]);
  });
  it("column drill pushes, pops and resets on its own", () => {
    const h = sp({ type: "heatmap", xPath: ["fam", "item"], path: ["reg", "st"] });
    const s1 = reduce(st(), { type: "xdrill", value: "O", spec: h });
    expect(s1.view.xDrill).toEqual(["O"]);
    expect(reduce(s1, { type: "xdrill", value: "J", spec: h })).toBe(s1);
    expect(reduce(s1, { type: "xpop", depth: 0 }).view.xDrill).toEqual([]);
    expect(reduce(s1, ev(h, { ...h }))).toBe(s1);
    expect(reduce(s1, ev(h, { ...h, xPath: ["item", "fam"] })).view.xDrill).toEqual([]);
    expect(reduce(s1, ev(h, { ...h, drill: false })).view.xDrill).toEqual([]);
  });
  it("expand toggles one row, more pages, filter resets the page", () => {
    const open = xreduce(st(), { type: "expand", value: "a", open: "" });
    expect(open.view.expanded).toBe("a");
    expect(xreduce(open, { type: "expand", value: "b", open: "a" }).view.expanded).toBe("b");
    expect(xreduce(open, { type: "expand", value: "a", open: "a" }).view.expanded).toBe("");
    const p = xreduce(open, { type: "more" });
    expect(p.view.page).toBe(1);
    const f = xreduce(p, { type: "filter", value: "jac" });
    expect(f.view).toMatchObject({ filter: "jac", page: 0, expanded: "a" });
    expect(xreduce(f, { type: "filter", value: "jac" })).toBe(f);
    expect(xreduce(f, ev(sp({}), sp({ type: "bar" }))).view).toEqual({});
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

describe("M4 interactions in <maya-chart>", () => {
  const q = (el: Element, sel: string) => el.shadowRoot!.querySelector<SVGElement>(sel)!;
  const click = (e: Element, detail = 1) =>
    e.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true, detail }));
  const keydown = (e: Element, key: string) =>
    e.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, composed: true, cancelable: true }),
    );
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const leafs = (el: Element) => {
    const out: unknown[] = [];
    el.addEventListener("maya-drill-leaf", (e) => out.push((e as CustomEvent).detail));
    return out;
  };
  const rows = ["O", "B"].flatMap((f) =>
    [f + "1", f + "2"].flatMap((i) => ["W", "E"].map((r) => ({ f, i, r, s: r + "1", v: 3 }))),
  );
  const heat = (extra: object = {}): ChartSpec =>
    ({
      type: "heatmap",
      path: ["r", "s"],
      xPath: ["f", "i"],
      y: "v",
      drill: true,
      data: rows,
      ...extra,
    }) as ChartSpec;

  it("a column header drills (click, Enter), the second nav pops it, Escape pops columns first", async () => {
    const el = await mount(heat());
    const tick = () => q(el, "[data-maya=axis-x] text[data-key=O]");
    expect(tick().getAttribute("tabindex")).toBe("0");
    expect(tick().getAttribute("role")).toBe("button");
    const leaf = leafs(el);
    click(tick());
    await frame();
    expect(el.view.xDrill).toEqual(["O"]);
    expect(el.view.drill ?? []).toEqual([]);
    expect(el.shadowRoot!.querySelector('.maya-crumbs[data-axis="x"]')).toBeTruthy();
    keydown(q(el, "[data-maya=axis-x] text[data-key=O1]"), "Enter");
    expect(leaf).toEqual([{ path: ["O", "O1"], axis: "x" }]);
    click(q(el, '.maya-crumbs[data-axis="x"] [data-depth="0"]'));
    await frame();
    expect(el.view.xDrill).toEqual([]);
    click(tick());
    await frame();
    click(byCat(el, "O1"));
    await frame();
    expect(el.view.drill).toEqual(["W"]);
    keydown(q(el, ".maya-svg"), "Escape");
    await frame();
    expect(el.view.xDrill).toEqual([]);
    expect(el.view.drill).toEqual(["W"]);
  });

  it("a series drill pushes the mark's data-series; a total or Other never drills", async () => {
    const data = [1, 2].flatMap((q) =>
      ["O", "B"].flatMap((f) => ["J", "P"].map((i) => ({ q, f, i, v: q }))),
    );
    const el = await mount({
      type: "area",
      x: "q",
      y: "v",
      seriesPath: ["f", "i"],
      drill: true,
      data,
    } as ChartSpec);
    expect(q(el, ".maya-svg").getAttribute("data-drill")).toBe("series");
    click(marks(el).find((m) => m.getAttribute("data-series") === "O")!);
    await frame();
    expect(el.view.drill).toEqual(["O"]);
    const leaf = leafs(el);
    click(marks(el)[0]!);
    expect(leaf).toHaveLength(1);
    const m = marks(el)[0]!;
    m.setAttribute("data-way", "total");
    click(m);
    expect(leaf).toHaveLength(1);
  });

  const table = (extra: object = {}): ChartSpec =>
    ({
      type: "table",
      x: "n",
      y: "a",
      page: 2,
      filter: true,
      expand: { type: "bar", x: "m", y: "v" },
      data: [1, 2, 3, 4].map((i) => ({ n: "r" + i, a: i, m: "x", v: i })),
      ...extra,
    }) as ChartSpec;

  it("table: a row opens and closes, one at a time", async () => {
    const el = await mount(table());
    click(q(el, '[data-maya=hit][data-key="a~r1"]'));
    await frame();
    expect(el.view.expanded).toBe("r1");
    click(q(el, '[data-maya=hit][data-key="a~r2"]'));
    await frame();
    expect(el.view.expanded).toBe("r2");
    click(q(el, '[data-maya=hit][data-key="a~r2"]'));
    await frame();
    expect(el.view.expanded).toBe("");
  });

  it("table: with select a click selects (no expand) and a double click expands", async () => {
    const el = await mount(table({ select: true }));
    const hit = () => q(el, '[data-maya=hit][data-key="a~r1"]');
    click(hit(), 1);
    await frame();
    expect(el.view.expanded).toBeUndefined();
    click(hit(), 2);
    await frame();
    expect(el.view.expanded).toBe("r1");
  });

  it("table: the more row pages by click and Enter and keeps focus on itself", async () => {
    const el = await mount(
      table({
        expand: undefined,
        data: [1, 2, 3, 4, 5, 6].map((i) => ({ n: "r" + i, a: i })),
      }),
    );
    click(q(el, "[data-maya=more]"));
    await frame();
    expect(el.view.page).toBe(1);
    keydown(q(el, "[data-maya=more]"), "Enter");
    await frame();
    expect(el.view.page).toBe(2);
  });

  const pages = (extra: object = {}) =>
    table({
      expand: undefined,
      data: [1, 2, 3, 4, 5, 6].map((i) => ({ n: "r" + i, a: i })),
      ...extra,
    });

  it("table: a selection survives a click on Show more and on a sort header", async () => {
    const el = await mount(pages({ select: true }));
    el.selected = [{ x: "r1" }];
    await frame();
    click(q(el, "[data-maya=more]"));
    await frame();
    click(q(el, "[data-maya=sort]"));
    await frame();
    expect(el.selected).toEqual([{ x: "r1" }]);
  });

  it("table: a double click on Show more with select pages once", async () => {
    const el = await mount(pages({ select: true }));
    click(q(el, "[data-maya=more]"), 1);
    click(q(el, "[data-maya=more]"), 2);
    await frame();
    expect(el.view.page).toBe(1);
  });

  it("table: Escape typed in the filter does not clear the selection", async () => {
    const el = await mount(pages({ select: true }));
    el.selected = [{ x: "r1" }];
    await frame();
    keydown(q(el, "[data-maya=filter]"), "Escape");
    await frame();
    expect(el.selected).toEqual([{ x: "r1" }]);
  });

  it("table: focus lands on the chart after the last page", async () => {
    const el = await mount(pages({ page: 5 }));
    click(q(el, "[data-maya=more]"));
    await frame();
    expect(q(el, "[data-maya=more]")).toBeNull();
    expect(el.shadowRoot!.activeElement).toBe(q(el, ".maya-svg"));
  });

  it("table: the filter debounces, resets the page, and keeps focus and caret", async () => {
    const el = await mount(table({ expand: undefined }));
    el.view = { page: 1 };
    await frame();
    const input = () => q(el, "[data-maya=filter]") as unknown as HTMLInputElement;
    input().focus();
    input().value = "r3";
    input().setSelectionRange(1, 1);
    input().dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    expect(el.view.filter).toBeUndefined();
    await wait(200);
    expect(el.view).toMatchObject({ filter: "r3", page: 0 });
    expect(input().value).toBe("r3");
    expect(el.shadowRoot!.activeElement).toBe(input());
    expect(input().selectionStart).toBe(1);
  });

  it("table: the header follows the box's scroll by CSSOM transform", async () => {
    const el = await mount(table({ expand: undefined }));
    const box = q(el, ".maya-box");
    Object.defineProperty(box, "scrollTop", { value: 40, configurable: true });
    box.dispatchEvent(new Event("scroll"));
    expect(q(el, "[data-maya=thead]").style.transform).toBe("translateY(40px)");
    expect(q(el, "[data-maya=thead]").hasAttribute("style")).toBe(true); // CSSOM write, not markup
  });

  it("list: the first move starts open and a click on it closes it", async () => {
    const data = [
      { m: "A", v: 1 },
      { m: "A", e: "x", v: 1 },
      { m: "B", v: 2 },
      { m: "B", e: "y", v: 2 },
    ];
    const el = await mount({ type: "list", x: "m", y: "v", path: ["m", "e"], data } as ChartSpec);
    click(q(el, '[data-key="m~A"]'));
    await frame();
    expect(el.view.expanded).toBe("");
    click(q(el, '[data-key="m~B"]'));
    await frame();
    expect(el.view.expanded).toBe("B");
  });
});
