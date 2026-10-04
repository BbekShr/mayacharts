// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { MayaChart } from "../src/element/maya-chart.ts";
import type { ChartSpec } from "../src/core/types.ts";

const frame = () => new Promise((r) => setTimeout(r, 20));
// Leaving marks keep data-maya (so they stay styled) but are flagged data-ghost until removed.
const marks = (el: Element) =>
  el.shadowRoot!.querySelectorAll("[data-maya=mark]:not([data-ghost])");
const mkRows = (n: number) => Array.from({ length: n }, (_, i) => ({ q: "Q" + i, v: i + 1 }));
const spec = (data: object[]): ChartSpec =>
  ({ type: "bar", x: "q", y: "v", data }) as unknown as ChartSpec;

// animate() registry: every call is "running" until its finish listener fires.
let running = 0;
const targets = { add: 0, remove: 0 };

beforeAll(() => {
  Element.prototype.animate = (() => {
    running++;
    let done = false;
    const finish = () => {
      if (!done) ((done = true), running--);
    };
    // finish on the next macrotask, like a real animation of a few ms
    setTimeout(finish, 5);
    return {
      finished: Promise.resolve(),
      onfinish: null,
      cancel: finish,
      addEventListener() {},
    };
  }) as never;
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

describe("<maya-chart> leaks", () => {
  it("100x connect/disconnect balances every listener on window, document and the shadow root", async () => {
    const adds = new Map<string, number>();
    const removes = new Map<string, number>();
    const wrap = (target: EventTarget, label: string) => {
      const add = target.addEventListener.bind(target);
      const rem = target.removeEventListener.bind(target);
      target.addEventListener = ((t: string, f: unknown, o?: unknown) => {
        adds.set(label + ":" + t, (adds.get(label + ":" + t) ?? 0) + 1);
        return add(t, f as never, o as never);
      }) as never;
      target.removeEventListener = ((t: string, f: unknown, o?: unknown) => {
        removes.set(label + ":" + t, (removes.get(label + ":" + t) ?? 0) + 1);
        return rem(t, f as never, o as never);
      }) as never;
    };
    wrap(document, "document");
    wrap(window, "window");
    wrap(globalThis, "globalThis");
    const el = document.createElement("maya-chart") as MayaChart;
    el.spec = spec(mkRows(5));
    document.body.append(el);
    await frame();
    wrap(el.shadowRoot!, "root");
    for (let i = 0; i < 100; i++) {
      el.remove();
      document.body.append(el);
    }
    await frame();
    el.remove();
    await frame();
    const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
    // Initial connect happened before wrapping; its adds on globalThis/root are unwrapped, so compare per key
    // only for what we observed: every observed add has a matching remove, and removes never exceed adds + 1.
    // REAL BUG, asserted separately below: zoom.ts adds an anonymous pointercancel listener it never removes.
    adds.delete("root:pointercancel");
    for (const [k, n] of adds) expect(removes.get(k) ?? 0, k).toBeGreaterThanOrEqual(n);
    expect(sum(removes)).toBeGreaterThanOrEqual(sum(adds));
    void targets;
  });

  // REAL BUG: src/element/zoom.ts registers an inline pointercancel listener on the shadow root that off() never removes.
  it("pointercancel listener on the shadow root is removed on disconnect", async () => {
    const el = document.createElement("maya-chart") as MayaChart;
    el.spec = spec(mkRows(3));
    document.body.append(el);
    await frame();
    let live = 0;
    const root = el.shadowRoot!;
    const add = root.addEventListener.bind(root);
    const rem = root.removeEventListener.bind(root);
    root.addEventListener = ((t: string, f: never, o: never) => (
      t === "pointercancel" && live++,
      add(t, f, o)
    )) as never;
    root.removeEventListener = ((t: string, f: never, o: never) => (
      t === "pointercancel" && live--,
      rem(t, f, o)
    )) as never;
    for (let i = 0; i < 20; i++) {
      el.remove();
      document.body.append(el);
    }
    el.remove();
    expect(live).toBeLessThanOrEqual(0);
  });

  it("100x el.data = rows leaves no ghost marks and bounded animations", async () => {
    const el = document.createElement("maya-chart") as MayaChart;
    el.spec = spec(mkRows(8));
    document.body.append(el);
    await frame();
    let peak = 0;
    for (let i = 0; i < 100; i++) {
      el.data = mkRows(3 + (i % 9));
      await new Promise((r) => setTimeout(r, 2));
      peak = Math.max(peak, running);
    }
    el.data = mkRows(7);
    await frame();
    await new Promise((r) => setTimeout(r, 30));
    expect(marks(el)).toHaveLength(7);
    expect(el.shadowRoot!.querySelectorAll("[data-maya=mark][data-key]")).toHaveLength(7);
    expect(running).toBeLessThanOrEqual(7);
    // Ghosts leave on their own timer even when no finish event ever fires (hidden tabs).
    await new Promise((r) => setTimeout(r, 800));
    expect(el.shadowRoot!.querySelectorAll("[data-ghost]")).toHaveLength(0);
    void peak;
  });

  it("rapid assignments without awaiting still converge to the last rows", async () => {
    const el = document.createElement("maya-chart") as MayaChart;
    el.spec = spec(mkRows(4));
    document.body.append(el);
    await frame();
    for (let i = 0; i < 100; i++) el.data = mkRows(1 + (i % 12));
    el.data = mkRows(6);
    await frame();
    await new Promise((r) => setTimeout(r, 30));
    expect(marks(el)).toHaveLength(6);
    expect(running).toBeLessThanOrEqual(6);
  });
});
