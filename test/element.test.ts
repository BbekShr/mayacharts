// @vitest-environment happy-dom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { patch } from "../src/element/animate.ts";
import { MayaChart } from "../src/element/maya-chart.ts";
import { renderParts } from "../src/core/render.ts";
import type { ChartSpec } from "../src/core/types.ts";

const rows = [
  { q: "Q1", r: "N", v: 3 },
  { q: "Q1", r: "S", v: -2 },
  { q: "Q2", r: "N", v: 5 },
];
const spec = (data = rows, extra: object = {}): ChartSpec =>
  ({ type: "bar", x: "q", y: "v", series: "r", data, ...extra }) as ChartSpec;
const frame = () => new Promise((r) => setTimeout(r, 20));
const marks = (el: Element) => [...el.shadowRoot!.querySelectorAll("[data-maya=mark][data-key]")];

beforeAll(() => {
  const anim = () => ({
    finished: Promise.resolve(),
    onfinish: null,
    addEventListener(_: string, f: () => void) {
      f();
    },
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

async function mount(init: (el: MayaChart) => void, child = ""): Promise<MayaChart> {
  const el = document.createElement("maya-chart") as MayaChart;
  el.innerHTML = child;
  init(el);
  document.body.append(el);
  await frame();
  return el;
}

describe("<maya-chart>", () => {
  it("spec precedence: property > JSON child > attribute", async () => {
    const mk = (n: string) => spec([{ q: n, r: "N", v: 1 }]);
    const el = await mount(
      (e) => e.setAttribute("spec", JSON.stringify(mk("attr"))),
      `<script type="application/json">${JSON.stringify(mk("json"))}</script>`,
    );
    expect(marks(el)[0]!.getAttribute("data-x")).toBe("json");
    el.spec = mk("prop");
    await frame();
    expect(marks(el)[0]!.getAttribute("data-x")).toBe("prop");
  });

  it("attribute alone works and data setter updates marks", async () => {
    const el = await mount((e) => e.setAttribute("spec", JSON.stringify(spec())));
    expect(marks(el)).toHaveLength(3);
    el.data = rows.slice(0, 2);
    await frame();
    expect(marks(el)).toHaveLength(2);
    expect(el.data).toHaveLength(2);
  });

  it("diff keeps nodes by data-key, appends and removes", () => {
    const box = document.createElement("div");
    const svg = (d: typeof rows) => renderParts(spec(d), { width: 640, height: 320 }).svg;
    patch(box, svg(rows), false);
    const first = [...box.querySelectorAll("[data-key]")];
    patch(box, svg([rows[0]!, rows[2]!, { q: "Q3", r: "N", v: 1 }]), true);
    const now = [...box.querySelectorAll("[data-key]")];
    expect(now.map((m) => m.getAttribute("data-key"))).toEqual(["N~Q1", "N~Q2", "N~Q3"]);
    expect(now[0]).toBe(first[0]);
    expect(now[1]).toBe(first[2]);
    expect(box.querySelectorAll("[data-maya=mark]")).toHaveLength(3);
    expect(first[1]!.isConnected).toBe(false);
  });

  it("legend click toggles series and keeps the last one", async () => {
    const el = await mount((e) => (e.spec = spec()));
    const btn = () => [
      ...el.shadowRoot!.querySelectorAll<HTMLElement>("[data-maya=legend] button"),
    ];
    btn()[1]!.click();
    await frame();
    expect(btn()[1]!.getAttribute("aria-pressed")).toBe("false");
    expect(marks(el).every((m) => m.getAttribute("data-series") === "N")).toBe(true);
    btn()[0]!.click();
    await frame();
    expect(btn()[0]!.getAttribute("aria-pressed")).toBe("true");
  });

  it("invalid spec shows .maya-err", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const el = await mount((e) => (e.spec = { type: "bar" } as never));
    expect(el.shadowRoot!.querySelector(".maya-err")?.textContent).toBeTruthy();
    expect(err).toHaveBeenCalledTimes(1);
    err.mockRestore();
  });

  it("tooltip content is text, not HTML", async () => {
    const evil = "<img src=x onerror=alert(1)>";
    const el = await mount((e) => (e.spec = spec([{ q: evil, r: evil, v: 1 }])));
    const m = marks(el)[0]!;
    m.dispatchEvent(new Event("pointerover", { bubbles: true }) as never);
    const ev = Object.assign(new Event("pointermove", { bubbles: true }), { pointerType: "mouse" });
    m.dispatchEvent(ev);
    const tip = el.shadowRoot!.querySelector(".maya-tip")!;
    expect(tip.textContent).toContain(evil);
    expect(tip.querySelector("img")).toBeNull();
    expect(m.hasAttribute("data-active")).toBe(true);
  });

  it("routes markup through the Trusted Types policy", async () => {
    const createHTML = vi.fn((x: string) => x);
    const createPolicy = vi.fn(() => ({ createHTML }));
    (globalThis as any).trustedTypes = { createPolicy };
    try {
      await mount((e) => (e.spec = spec()));
      expect(createPolicy).toHaveBeenCalledWith("mayacharts", expect.anything());
      expect(createHTML.mock.calls.length).toBeGreaterThan(1);
      // A refused policy name falls back to getPolicy, then to the plain string.
      (globalThis as any).trustedTypes = {
        createPolicy: () => {
          throw new Error("dup");
        },
      };
      expect(await mount((e) => (e.spec = spec()))).toBeTruthy();
    } finally {
      delete (globalThis as any).trustedTypes;
    }
  });

  it("never writes style attributes into the shadow root", async () => {
    const el = await mount((e) => (e.spec = spec()));
    expect(el.shadowRoot!.querySelectorAll("[style]")).toHaveLength(0);
    const c = await mount((e) => (e.spec = spec(rows, { colors: ["#c00", "#0a0"] })));
    const maya = c.shadowRoot!.querySelector<HTMLElement>(".maya")!;
    expect(maya.style.getPropertyValue("--maya-series-1")).toBeTruthy(); // CSSOM, not markup
    expect(c.shadowRoot!.querySelectorAll(".maya-box [style], .maya-legend [style]")).toHaveLength(
      0,
    );
    const bad = await mount((e) => (e.spec = { type: "bar" } as never));
    expect(bad.shadowRoot!.querySelector(".maya-err")!.hasAttribute("style")).toBe(false);
  });

  it("restores focus across el.data =", async () => {
    const el = await mount((e) => (e.spec = spec()));
    const btn = () => el.shadowRoot!.querySelectorAll<HTMLElement>("[data-maya=legend] button");
    btn()[1]!.focus();
    expect(el.shadowRoot!.activeElement).toBe(btn()[1]);
    el.data = [...rows, { q: "Q3", r: "S", v: 1 }];
    await frame();
    expect(el.shadowRoot!.activeElement).toBe(btn()[1]);
  });

  it("legend toggles by data-key, not by text", async () => {
    const el = await mount((e) => (e.spec = spec()));
    const b = el.shadowRoot!.querySelectorAll<HTMLElement>("[data-maya=legend] button")[1]!;
    b.setAttribute("data-key", "S");
    b.click();
    await frame();
    expect(el.view.hidden).toEqual(["S"]);
  });

  it("maya-view is not fired on first render or data updates; setters stay silent", async () => {
    const seen: string[] = [];
    const el = document.createElement("maya-chart") as MayaChart;
    for (const t of ["maya-view", "maya-select", "maya-render"])
      el.addEventListener(t, () => seen.push(t));
    el.spec = spec();
    document.body.append(el);
    await frame();
    el.data = rows.slice(0, 2);
    el.view = { hidden: ["S"] };
    el.selected = [{ x: "Q1" }];
    await frame();
    expect(seen).not.toContain("maya-view");
    expect(seen).not.toContain("maya-select");
    expect(seen.filter((t) => t === "maya-render").length).toBeGreaterThanOrEqual(2);
  });

  it("maya-error is cancelable; preventDefault hides .maya-err", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let cancelable = false;
    const el = document.createElement("maya-chart") as MayaChart;
    el.addEventListener("maya-error", (e) => {
      cancelable = e.cancelable;
      e.preventDefault();
    });
    el.spec = { type: "bar" } as never;
    document.body.append(el);
    await frame();
    expect(cancelable).toBe(true);
    expect(el.shadowRoot!.querySelector(".maya-err")).toBeNull();
    vi.restoreAllMocks();
  });

  it("upgrade race: own properties set before upgrade are re-applied", async () => {
    const el = document.createElement("maya-chart") as MayaChart;
    Object.defineProperty(el, "spec", {
      value: spec(),
      writable: true,
      configurable: true,
      enumerable: true,
    });
    document.body.append(el);
    await frame();
    expect(Object.hasOwn(el, "spec")).toBe(false);
    expect(marks(el)).toHaveLength(3);
  });
});

describe("patch()", () => {
  const svg = (items: string) =>
    `<svg viewBox="0 0 100 100"><g data-maya="marks">${items}</g></svg>`;
  const rect = (k: string, x = 0) =>
    `<rect data-maya="mark" data-key="${k}" x="${x}" y="10" width="5" height="20"/>`;

  it("a key whose tag changed is replaced, not synced", () => {
    const box = document.createElement("div");
    patch(box, svg(rect("a")), false);
    const old = box.querySelector("[data-key=a]")!;
    patch(box, svg(`<circle data-maya="mark" data-key="a" cx="5" cy="5" r="3"/>`), true);
    expect(old.isConnected).toBe(false);
    expect(box.querySelector("[data-key=a]")!.localName).toBe("circle");
  });

  it("entering marks start from origin; after() runs post-patch", () => {
    const box = document.createElement("div");
    patch(box, svg(rect("a")), false);
    const spy = vi.spyOn(Element.prototype, "animate");
    const after = vi.fn((s: Element) =>
      s.querySelector("[data-key=b]")!.setAttribute("data-selected", ""),
    );
    patch(box, svg(rect("a") + rect("b", 50)), true, { origin: [40, 0, 0, 0], after });
    const k = spy.mock.calls.find(([, ,]) => true)![0] as Keyframe[];
    expect(String(k[0]!.transform)).toContain("translate(-10px,-10px)");
    expect(after).toHaveBeenCalledTimes(1);
    expect(box.querySelector("[data-key=b]")!.hasAttribute("data-selected")).toBe(true);
    spy.mockRestore();
  });

  it("exiting marks collapse into the origin and lose their key", () => {
    const box = document.createElement("div");
    patch(box, svg(rect("a") + rect("b", 50)), false);
    const gone = box.querySelector("[data-key=b]")!;
    patch(box, svg(rect("a")), true, { origin: [1, 2, 0, 0] });
    expect(gone.hasAttribute("data-key")).toBe(false);
  });
});
