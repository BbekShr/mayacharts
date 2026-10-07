// @vitest-environment happy-dom
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MayaChart } from "../src/element/maya-chart.ts";
import { reduce } from "../src/element/select.ts";
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
