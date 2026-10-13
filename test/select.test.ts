// @vitest-environment happy-dom
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MayaChart } from "../src/element/maya-chart.ts";
import { reduce, selOf } from "../src/element/select.ts";
import { reduce as reduceBrush } from "../src/element/brush.ts";
import type { ChartSpec, State } from "../src/core/types.ts";

const rows = [
  { m: "Jan", r: "N", v: 3 },
  { m: "Feb", r: "N", v: 5 },
  { m: "Jan", r: "S", v: 2 },
];
const spec = (extra: object = {}, data = rows): ChartSpec =>
  ({ type: "bar", x: "m", y: "v", data, ...extra }) as ChartSpec;
const frame = () => new Promise((r) => setTimeout(r, 20));
const st = (selected: State["selected"] = []): State => ({ view: {}, selected });
const sp = (o: object) => spec(o);

describe("select reducer", () => {
  it("single replaces, same clears", () => {
    let s = reduce(st(), { type: "toggle", sel: { x: "a" }, multi: false });
    expect(s.selected).toEqual([{ x: "a" }]);
    s = reduce(s, { type: "toggle", sel: { x: "b" }, multi: false });
    expect(s.selected).toEqual([{ x: "b" }]);
    s = reduce(s, { type: "toggle", sel: { x: "b" }, multi: false });
    expect(s.selected).toEqual([]);
  });
  it("a numeric x matches the string the DOM hands back", () => {
    const num = { x: 2024 } as never;
    const str = { x: "2024" };
    expect(
      reduce(reduce(st(), { type: "toggle", sel: num, multi: true }), {
        type: "toggle",
        sel: str,
        multi: true,
      }).selected,
    ).toEqual([]);
    expect(
      reduce(reduce(st(), { type: "toggle", sel: num, multi: false }), {
        type: "toggle",
        sel: str,
        multi: false,
      }).selected,
    ).toEqual([]);
  });
  it("multi toggles in the array; clear empties", () => {
    let s = reduce(st(), { type: "toggle", sel: { x: "a" }, multi: true });
    s = reduce(s, { type: "toggle", sel: { x: "b" }, multi: true });
    expect(s.selected).toHaveLength(2);
    s = reduce(s, { type: "toggle", sel: { x: "a" }, multi: true });
    expect(s.selected).toEqual([{ x: "b" }]);
    expect(reduce(s, { type: "clear" }).selected).toEqual([]);
  });
  it("persists across data change, clears on x/type change", () => {
    const s = st([{ x: "a" }]);
    const ev = (p: ChartSpec, n: ChartSpec) => ({ type: "spec" as const, prev: p, next: n });
    expect(reduce(s, ev(spec(), spec({}, [])))).toBe(s);
    expect(reduce(s, ev(spec(), sp({ x: "r" }))).selected).toEqual([]);
    expect(reduce(s, ev(spec(), sp({ type: "line" }))).selected).toEqual([]);
  });
});

describe("<maya-chart select>", () => {
  beforeAll(() => {
    Element.prototype.animate = (() => ({
      finished: Promise.resolve(),
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
  const mount = async (s: ChartSpec) => {
    const el = document.createElement("maya-chart") as MayaChart;
    el.spec = s;
    document.body.append(el);
    await frame();
    return el;
  };
  const mk = (el: Element) => [
    ...el.shadowRoot!.querySelectorAll<SVGElement>("[data-maya=mark][data-key]"),
  ];
  const on = (el: Element) =>
    mk(el)
      .filter((m) => m.hasAttribute("data-selected"))
      .map((m) => m.getAttribute("data-x"));
  const click = async (n: Element) => {
    n.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await frame();
  };

  it("click selects, dispatches maya-select, survives data change", async () => {
    const el = await mount(spec({ select: true }));
    let detail: any;
    el.addEventListener("maya-select", (e) => (detail = (e as CustomEvent).detail));
    await click(mk(el)[0]!);
    expect(on(el)).toEqual(["Jan"]);
    expect(detail).toEqual({ selected: [{ x: "Jan" }], target: { x: "Jan", value: 5 } });
    el.data = [...rows, { m: "Mar", r: "N", v: 1 }];
    await frame();
    expect(on(el)).toEqual(["Jan"]);
    el.selected = [{ x: "Feb" }];
    await frame();
    expect(on(el)).toEqual(["Feb"]);
  });

  it("kpi: a sparkline dot (key ~Feb) picks its category; the headline (key v) picks nothing", () => {
    const m = (k: string) => {
      const e = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      e.setAttribute("data-key", k);
      return e;
    };
    expect(selOf(m("~Feb"), "kpi")).toEqual({ x: "Feb" });
    expect(selOf(m("v"), "kpi")).toBeUndefined();
    expect(selOf(m("b"), "kpi")).toBeUndefined();
  });

  it("empty chart space, a click elsewhere and the same mark again all deselect", async () => {
    const el = await mount(spec({ select: true }));
    let n = 0;
    el.addEventListener("maya-select", () => n++);
    await click(mk(el)[0]!);
    await click(mk(el)[0]!);
    expect(on(el)).toEqual([]);
    await click(mk(el)[0]!);
    await click(el.shadowRoot!.querySelector(".maya-svg")!);
    expect(on(el)).toEqual([]);
    await click(mk(el)[1]!);
    await click(document.body);
    expect(on(el)).toEqual([]);
    expect(n).toBe(6);
  });

  it("multi toggles two; Escape clears and announces", async () => {
    const el = await mount(spec({ select: "multi" }, rows.slice(0, 2)));
    await click(mk(el)[0]!);
    await click(mk(el)[1]!);
    expect(on(el)).toEqual(["Jan", "Feb"]);
    el.shadowRoot!.querySelector(".maya-svg")!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        composed: true,
        cancelable: true,
      }),
    );
    await new Promise((r) => setTimeout(r, 350));
    expect(on(el)).toEqual([]);
    expect(el.shadowRoot!.querySelector("[data-maya=live]")!.textContent).toBe("Selection cleared");
  });

  it("legend click selects the series", async () => {
    const el = await mount(spec({ select: true, series: "r" }));
    await click(el.shadowRoot!.querySelectorAll("[data-maya=legend] button")[1]!);
    expect(el.selected).toEqual([{ series: "S" }]);
    expect(
      mk(el)
        .filter((m) => m.hasAttribute("data-selected"))
        .map((m) => m.getAttribute("data-series")),
    ).toEqual(["S"]);
    expect(mk(el).length).toBe(3);
  });
});

describe("kpi select", () => {
  it("a sparkline dot selects by its category", () => {
    expect(reduce(st(), { type: "toggle", sel: { x: "b" }, multi: false }).selected).toEqual([
      { x: "b" },
    ]);
  });
});

const mount = async (s: ChartSpec) => {
  document.body.innerHTML = "";
  const el = document.createElement("maya-chart") as MayaChart;
  el.spec = s;
  document.body.append(el);
  await frame();
  return el;
};
const click = async (n: Element) => {
  n.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
  await frame();
};

describe("parallel brush without dragging", () => {
  const par = {
    type: "parallel",
    x: "s",
    y: ["a", "b"],
    brush: true,
    data: [0, 1, 2, 3, 4].map((i) => ({ s: `S${i}`, a: i * 10, b: 40 - i * 10 })),
  } as ChartSpec;
  const brushed = reduceBrush;
  it("nudge starts at an end, moves, grows, shrinks and stays inside the axis", () => {
    const n = (s: State, dir: 1 | -1, grow = false) =>
      brushed(s, { type: "nudge", field: "a", dom: [0, 100], dir, grow });
    let s = n(st(), 1);
    expect(s.view.brush).toEqual([["a", 80, 100]]);
    expect(n(s, 1).view.brush).toEqual([["a", 80, 100]]); // already at the top
    s = n(s, -1);
    expect(s.view.brush).toEqual([["a", 70, 90]]);
    s = n(s, 1, true);
    expect(s.view.brush).toEqual([["a", 60, 100]]);
    s = n(n(s, -1, true), -1, true);
    expect(s.view.brush).toEqual([["a", 75, 85]]); // never narrower than a step
    expect(n(st(), -1).view.brush).toEqual([["a", 0, 20]]);
  });
  it("axis strips are sliders; arrows brush, Delete clears", async () => {
    const el = await mount(par);
    const ax = el.shadowRoot!.querySelector<SVGElement>("[data-maya=axis][data-field=a]")!;
    expect(ax.getAttribute("role")).toBe("slider");
    expect(ax.getAttribute("tabindex")).toBe("0");
    const key = async (k: string, init: object = {}) => {
      el.shadowRoot!.querySelector("[data-maya=axis][data-field=a]")!.dispatchEvent(
        new KeyboardEvent("keydown", { key: k, bubbles: true, composed: true, ...init }),
      );
      await frame();
    };
    await key("ArrowUp");
    expect(el.view?.brush).toEqual([["a", 32, 40]]);
    await key("ArrowDown", { shiftKey: true });
    expect(el.view?.brush?.[0]?.[2]! - el.view?.brush?.[0]?.[1]!).toBeLessThan(8);
    await key("Delete");
    expect(el.view?.brush).toBeUndefined();
  });
  it("click twice on an axis makes a range, a click on a brushed axis clears it, Escape drops a pending end", async () => {
    const el = await mount(par);
    const rt = el.shadowRoot!;
    const ax = () => rt.querySelector("[data-maya=axis][data-field=a]")!;
    const y0 = +ax().getAttribute("y")!,
      h = +ax().getAttribute("height")!;
    const tap = async (f: number) => {
      const o = {
        bubbles: true,
        composed: true,
        pointerId: 1,
        isPrimary: true,
        clientX: 5,
        clientY: y0 + f * h,
      };
      ax().dispatchEvent(new PointerEvent("pointerdown", o));
      ax().dispatchEvent(new PointerEvent("pointerup", o));
      await frame();
    };
    await tap(0.25);
    expect(el.view?.brush).toBeUndefined();
    expect(rt.querySelectorAll("[data-maya=brush]").length).toBe(1);
    await tap(0.75);
    expect(el.view?.brush).toEqual([["a", 10, 30]]);
    expect(rt.querySelectorAll("rect[data-maya=brush]").length).toBe(0);
    await tap(0.5); // brushed: clears
    expect(el.view?.brush).toBeUndefined();
    await tap(0.5);
    rt.querySelector(".maya")!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }),
    );
    expect(rt.querySelectorAll("[data-maya=brush]").length).toBe(0);
    await tap(0.1);
    await tap(0.9);
    expect(el.view?.brush).toBeDefined();
  });
});

describe("select dims the other ridges and series paths", () => {
  it("lines of the unselected series step back, and return on clear", async () => {
    const el = await mount(
      spec({ type: "ridgeline", select: true, series: "r", y: "v" }, [
        { m: "Jan", r: "N", v: 3 },
        { m: "Feb", r: "N", v: 5 },
        { m: "Jan", r: "S", v: 2 },
        { m: "Feb", r: "S", v: 4 },
      ]),
    );
    const dot = el.shadowRoot!.querySelector("[data-maya=mark][data-series=N]")!;
    await click(dot);
    const d = () =>
      [...el.shadowRoot!.querySelectorAll<SVGElement>("path[data-maya=line][data-s]")].map((l) =>
        l.style.getPropertyValue("--d"),
      );
    expect(d().filter(Boolean)).toEqual([".3"]);
    await click(dot);
    expect(d().filter(Boolean)).toEqual([]);
  });
});
