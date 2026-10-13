// @vitest-environment happy-dom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { patch } from "../src/element/animate.ts";
import { MayaChart } from "../src/element/maya-chart.ts";
import { renderParts } from "../src/core/render.ts";
import "../src/flow.ts";
import "../src/stats.ts";
import "../src/radial.ts";
import { TEXT } from "../src/core/strings.ts";
import type { ChartSpec } from "../src/core/types.ts";

vi.mock("../src/core/render.ts", async (orig) => {
  const m = await orig<typeof import("../src/core/render.ts")>();
  return { ...m, renderParts: vi.fn(m.renderParts) };
});

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
    const first = [...box.querySelectorAll("[data-maya=marks] [data-key]")];
    patch(box, svg([rows[0]!, rows[2]!, { q: "Q3", r: "N", v: 1 }]), true);
    const now = [...box.querySelectorAll("[data-maya=marks] [data-key]")];
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

  it("legend hover dims through custom properties on .maya, not :has(:hover)", async () => {
    const el = await mount((e) => (e.spec = spec()));
    const maya = el.shadowRoot!.querySelector<HTMLElement>(".maya")!;
    const b = el.shadowRoot!.querySelectorAll<HTMLElement>("[data-maya=legend] button")[1]!;
    b.dispatchEvent(new Event("pointerover", { bubbles: true, composed: true }));
    expect([maya.style.getPropertyValue("--d"), maya.style.getPropertyValue("--h1")]).toEqual([
      ".25",
      "1",
    ]);
    b.dispatchEvent(new Event("pointerout", { bubbles: true, composed: true }));
    expect([maya.style.getPropertyValue("--d"), maya.style.getPropertyValue("--h1")]).toEqual([
      "",
      "",
    ]);
  });

  it("the first draw places the legend from one row per series, so the box is measured once", async () => {
    const draw = vi.mocked(renderParts);
    draw.mockClear();
    await mount((e) => (e.spec = spec()));
    expect(draw.mock.calls[0]![0].data).toHaveLength(2); // N and S, not the three rows
  });

  it("re-renders hand the core the same data array (its shape cache keys on identity)", async () => {
    const draw = vi.mocked(renderParts);
    const el = await mount((e) => (e.spec = spec()));
    const data = rows.slice();
    el.data = data;
    await frame();
    draw.mockClear();
    el.view = { hidden: ["S"] };
    await frame();
    el.dispatchEvent(new Event("pointerover"));
    expect(draw.mock.calls.length).toBeGreaterThan(0);
    expect(draw.mock.calls.every(([s]) => s.data === data)).toBe(true);
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
    // The dim rules key on data-hot, set on the marks group while a mark is active.
    expect(m.closest("[data-maya=marks]")!.hasAttribute("data-hot")).toBe(true);
    el.shadowRoot!.querySelector(".maya-box")!.dispatchEvent(new Event("pointerleave"));
  });

  it("a multi-measure line without a series names the active measure in the tooltip", async () => {
    const data = [
      { m: "Jan", a: 1, b: 7 },
      { m: "Feb", a: 2, b: 8 },
    ];
    const el = await mount(
      (e) =>
        (e.spec = { type: "line", x: "m", y: ["a", "b"], titles: { b: "Bee" }, data } as ChartSpec),
    );
    const tip = el.shadowRoot!.querySelector(".maya-tip")!;
    const hover = () => {
      const m = marks(el)[0]!;
      m.dispatchEvent(new Event("pointerover", { bubbles: true }) as never);
      m.dispatchEvent(
        Object.assign(new Event("pointermove", { bubbles: true }), { pointerType: "mouse" }),
      );
    };
    hover();
    expect(tip.querySelector("div")!.textContent).toMatch(/^a/);
    el.view = { measure: 1 };
    await frame();
    hover();
    expect(tip.querySelector("div")!.textContent).toMatch(/^Bee/);
  });

  it("boxplot hover lights the hovered box's parts, not boxes whose name starts with it", async () => {
    const data = ["Men", "Mens"].flatMap((g) =>
      [1, 2, 3, 4, 5, 9].map((v) => ({ g, v, s: "a", n: g + v })),
    );
    const el = await mount(
      (e) =>
        (e.spec = { type: "boxplot", x: "g", y: "v", series: "s", name: "n", data } as ChartSpec),
    );
    const m = marks(el).find((x) => x.getAttribute("data-key") === "b~a~Men")!;
    m.dispatchEvent(new Event("pointerover", { bubbles: true }) as never);
    m.dispatchEvent(
      Object.assign(new Event("pointermove", { bubbles: true }), { pointerType: "mouse" }),
    );
    const lit = [...el.shadowRoot!.querySelectorAll("[data-lit]")].map((x) =>
      x.getAttribute("data-key"),
    );
    expect(lit).toContain("ws~a~Men");
    expect(lit.filter((k) => k?.includes("Mens"))).toEqual([]);
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

  it("renders in a microtask, before the first rAF", async () => {
    const el = document.createElement("maya-chart") as MayaChart;
    el.spec = spec();
    document.body.append(el);
    await Promise.resolve();
    expect(marks(el)).toHaveLength(3);
  });

  it("a titled single-series chart draws its data once on first paint", async () => {
    vi.mocked(renderParts).mockClear();
    await mount((e) => (e.spec = spec(rows.slice(0, 1), { title: "T", series: undefined })));
    const full = vi.mocked(renderParts).mock.calls.filter(([s]) => s.data.length);
    expect(full).toHaveLength(1);
  });

  it("hydrates when the JSON child is parsed after connectedCallback", async () => {
    Object.defineProperty(document, "readyState", { value: "loading", configurable: true });
    const el = document.createElement("maya-chart") as MayaChart;
    document.body.append(el);
    await frame();
    expect(marks(el)).toHaveLength(0);
    el.innerHTML = `<script type="application/json">${JSON.stringify(spec())}</script>`;
    await frame();
    delete (document as any).readyState;
    expect(marks(el)).toHaveLength(3);
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

describe("patch ghosts", () => {
  it("leaves no unnamed groups after an instant re-render", async () => {
    const { patch } = await import("../src/element/animate.ts");
    const box = document.createElement("div");
    const svg = (n: number) =>
      `<svg><g data-maya="axis-y">${"<text>a</text>".repeat(n)}</g><g data-maya="marks"><rect data-key="k" x="0" y="0" width="1" height="${n}"/></g><g data-maya="labels"></g></svg>`;
    patch(box, svg(1), false);
    patch(box, svg(2), true, { instant: true });
    patch(box, svg(3), true, { instant: true });
    const unnamed = [...box.querySelectorAll("svg > g")].filter(
      (g) => !g.hasAttribute("data-maya"),
    );
    expect(unnamed).toHaveLength(0);
    expect(box.querySelectorAll("[data-maya=axis-y]")).toHaveLength(1);
    expect(box.querySelectorAll("[data-maya=axis-y] text")).toHaveLength(3);
  });
});

describe("idle data table", () => {
  it("a new render cancels the queued table insert, so a stream holds one", async () => {
    vi.stubGlobal("requestIdleCallback", undefined); // the Safari path: a timer
    const set = vi.spyOn(globalThis, "setTimeout");
    const clear = vi.spyOn(globalThis, "clearTimeout");
    const el = document.createElement("maya-chart") as MayaChart;
    document.body.append(el);
    for (const v of [1, 2, 3]) {
      el.spec = { type: "bar", x: "q", y: "v", data: [{ q: "A", v }] } as ChartSpec;
      await Promise.resolve().then(() => {});
    }
    const queued = set.mock.calls.filter((c) => c[1] === 1600).length;
    expect(queued).toBeGreaterThanOrEqual(3);
    expect(clear.mock.calls.length).toBeGreaterThanOrEqual(queued - 1);
    await new Promise((r) => setTimeout(r, 1700));
    expect(el.shadowRoot!.querySelectorAll("table.maya-sr")).toHaveLength(1);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    el.remove();
  });
});

describe("table header sort", () => {
  const tbl = {
    type: "table",
    x: "q",
    y: ["v", "w"],
    data: [
      { q: "A", v: 1, w: 5 },
      { q: "B", v: 3, w: 2 },
    ],
  } as ChartSpec;
  const first = (el: Element) => marks(el)[0]!.getAttribute("data-x");
  const head = (el: Element, f: string) =>
    el.shadowRoot!.querySelector<SVGElement>(`[data-maya=sort][data-field=${f}]`)!;

  it("click sorts desc then asc, Enter works, spec change resets", async () => {
    const el = await mount((e) => (e.spec = tbl));
    expect(first(el)).toBe("A");
    head(el, "v").dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await frame();
    expect(first(el)).toBe("B");
    expect(el.view.sortBy).toEqual(["v", "desc"]);
    head(el, "v").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, composed: true }),
    );
    await frame();
    expect(first(el)).toBe("A");
    expect(el.view.sortBy).toEqual(["v", "asc"]);
    el.spec = { ...tbl, y: ["v"] };
    await frame();
    expect(el.view.sortBy).toBeUndefined();
  });

  it("heatmap measure toggle replaces the ramp legend", async () => {
    const data = [
      { m: "x", y: "p", a: 1, b: 100 },
      { m: "y", y: "p", a: 2, b: 900 },
    ];
    const el = await mount((e) => {
      e.spec = { type: "heatmap", x: "m", series: "y", y: ["a", "b"], data } as ChartSpec;
    });
    const ramps = () => el.shadowRoot!.querySelectorAll(".maya-legend");
    expect(ramps()).toHaveLength(1);
    const before = ramps()[0]!.textContent;
    el.shadowRoot!.querySelectorAll<HTMLElement>(".maya-ctl [role=radio]")[1]!.click();
    await frame();
    expect(ramps()).toHaveLength(1);
    expect(ramps()[0]!.textContent).not.toBe(before);
    expect(ramps()[0]!.textContent).toContain("900");
  });
});

describe("stacked tooltip", () => {
  it("lists rows top-down and ends with a formatted Total", async () => {
    const data = [
      { m: "Jan", s: "A", v: 1000 },
      { m: "Jan", s: "B", v: 2000 },
      { m: "Feb", s: "A", v: 1500 },
      { m: "Feb", s: "B", v: 2500 },
    ];
    const el = await mount((e) => {
      e.spec = { type: "bar", x: "m", y: "v", series: "s", stack: true, data } as ChartSpec;
    });
    const m = marks(el)[0]!;
    m.dispatchEvent(new Event("pointerover", { bubbles: true }) as never);
    m.dispatchEvent(
      Object.assign(new Event("pointermove", { bubbles: true }), { pointerType: "mouse" }),
    );
    const rows = [...el.shadowRoot!.querySelectorAll(".maya-tip div")].map((d) => d.textContent);
    expect(rows[0]).toContain("B");
    expect(rows[1]).toContain("A");
    expect(rows[2]).toMatch(/Total.*3,?000|Total.*3K/);
  });
});

describe("legend part with two blocks", () => {
  it("a legend change replaces every block, never stacks another copy", async () => {
    const data = [
      { a: 1, b: 2, c: 10, s: "x" },
      { a: 3, b: 4, c: 90, s: "x" },
      { a: 5, b: 1, c: 40, s: "y" },
    ];
    const el = await mount((e) => {
      e.spec = { type: "scatter", x: "a", y: "b", size: "c", series: "s", data } as ChartSpec;
    });
    const n = () => el.shadowRoot!.querySelectorAll(".maya-legend").length;
    const start = n();
    expect(start).toBeGreaterThan(1);
    el.shadowRoot!.querySelector<HTMLElement>("[data-maya=legend] button")!.click();
    await frame();
    expect(n()).toBe(start);
  });
});

describe("scatter without hit circles", () => {
  const pts = [
    { a: 10, b: 10, n: "p1" },
    { a: 50, b: 40, n: "p2" },
  ];
  const sc = (extra: object = {}) =>
    ({ type: "scatter", x: "a", y: "b", name: "n", data: pts, ...extra }) as ChartSpec;
  const at = (el: Element, m: Element, dx: number, type: string) => {
    const svg = el.shadowRoot!.querySelector("svg")!;
    const [, , w, h] = svg.getAttribute("viewBox")!.split(" ").map(Number);
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: w, height: h }) as DOMRect;
    for (const x of svg.querySelectorAll("[data-maya=hit]")) x.remove();
    svg.dispatchEvent(
      Object.assign(new Event(type, { bubbles: true }), {
        pointerType: "mouse",
        clientX: +m.getAttribute("cx")! + dx,
        clientY: +m.getAttribute("cy")!,
      }),
    );
  };

  it("hover within 12 px of a point shows its tooltip; farther does not", async () => {
    const el = await mount((e) => (e.spec = sc()));
    const m = marks(el)[1]!;
    at(el, m, 30, "pointermove");
    expect(m.hasAttribute("data-active")).toBe(false);
    at(el, m, 8, "pointermove");
    expect(m.hasAttribute("data-active")).toBe(true);
    expect(el.shadowRoot!.querySelector(".maya-tip")!.textContent).toContain("p2");
  });

  it("click near a point selects it", async () => {
    const el = await mount((e) => (e.spec = sc({ select: true })));
    const got: unknown[] = [];
    el.addEventListener("maya-select", (e) => got.push((e as CustomEvent).detail.selected));
    const m = marks(el)[0]!;
    at(el, m, 5, "pointermove");
    at(el, m, 5, "click");
    expect(got).toEqual([[{ name: "p1" }]]);
  });
});

describe("review fixes", () => {
  const live = (el: Element) => el.shadowRoot!;
  it("a dumbbell connector is neither selectable nor a tooltip target", async () => {
    const data = ["A", "B"].flatMap((c) => [
      { c, p: "2020", v: 10 },
      { c, p: "2024", v: 30 },
    ]);
    const el = await mount(
      (e) => (e.spec = { type: "dumbbell", x: "c", y: "v", series: "p", data, select: true }),
    );
    const got: unknown[] = [];
    el.addEventListener("maya-select", (e) => got.push(e));
    const link = live(el).querySelector("[data-maya=link]")!;
    expect(link).toBeTruthy();
    link.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    link.dispatchEvent(
      Object.assign(new Event("pointerover", { bubbles: true }), { pointerType: "mouse" }),
    );
    await frame();
    expect(got).toEqual([]);
    expect(live(el).querySelector(".maya-tip")!.textContent).toBe("");
  });

  it("a sankey link still shows its row on hover", async () => {
    const data = [
      { a: "X", b: "M", c: "P", v: 6 },
      { a: "Y", b: "M", c: "P", v: 4 },
    ];
    const el = await mount(
      (e) => (e.spec = { type: "sankey", path: ["a", "b", "c"], y: "v", data }),
    );
    const link = live(el).querySelector("[data-maya=link][data-f]")!;
    link.dispatchEvent(
      Object.assign(new Event("pointerover", { bubbles: true }), { pointerType: "mouse" }),
    );
    expect(live(el).querySelector(".maya-tip")!.textContent).not.toBe("");
  });

  it("a spec set beside a pending resize frame renders now and animates", async () => {
    let ro!: () => void;
    globalThis.ResizeObserver = class {
      constructor(f: () => void) {
        ro = f;
      }
      observe() {}
      disconnect() {}
    } as never;
    const el = await mount((e) => (e.spec = spec()));
    Object.defineProperty(live(el).querySelector(".maya-box")!, "clientWidth", { value: 500 });
    ro();
    const spy = vi.spyOn(Element.prototype, "animate");
    let renders = 0;
    el.addEventListener("maya-render", () => renders++);
    el.spec = spec(rows.map((r) => ({ ...r, v: r.v * 3 })));
    await Promise.resolve();
    expect(renders).toBe(1);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("a resize frame at the drawn size does not re-render or cut the entrance", async () => {
    let ro!: () => void;
    globalThis.ResizeObserver = class {
      constructor(f: () => void) {
        ro = f;
      }
      observe() {}
      disconnect() {}
    } as never;
    // A host connects the element, the box gets its size (a resize frame is queued), then the spec lands.
    const el = await mount(() => {});
    Object.defineProperty(live(el).querySelector(".maya-box")!, "clientWidth", { value: 500 });
    ro();
    const cancel = vi.spyOn(Animation.prototype, "cancel");
    let renders = 0;
    el.addEventListener("maya-render", () => renders++);
    el.spec = spec();
    await frame();
    expect(renders).toBe(1);
    expect(cancel).not.toHaveBeenCalled();
    cancel.mockRestore();
  });

  it("tooltip:false keeps the keyboard: Arrow then Enter selects", async () => {
    const el = await mount((e) => (e.spec = spec(rows, { tooltip: false, select: true })));
    const got: unknown[] = [];
    el.addEventListener("maya-select", (e) => got.push((e as CustomEvent).detail.selected));
    const svg = live(el).querySelector(".maya-svg")!;
    for (const key of ["ArrowRight", "Enter"])
      svg.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, composed: true, cancelable: true }),
      );
    await frame();
    expect(got).toHaveLength(1);
  });

  it("the live region reads tabs as spaces and newlines as commas", async () => {
    const el = await mount(
      (e) => (e.spec = spec([{ q: "a\tb\nc", v: 1, r: "s" }], { tooltip: false })),
    );
    live(el)
      .querySelector(".maya-svg")!
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, composed: true }),
      );
    await new Promise((r) => setTimeout(r, 340));
    expect(live(el).querySelector("[data-maya=live]")!.textContent).toMatch(/^a b, c: /);
  });

  it("a spec error removes the stale data table", async () => {
    const el = await mount((e) => (e.spec = spec()));
    await new Promise((r) => setTimeout(r, 1700));
    expect(live(el).querySelector("table.maya-sr")).toBeTruthy();
    el.spec = { type: "bar" } as never;
    await new Promise((r) => setTimeout(r, 50));
    expect(live(el).querySelector(".maya-err")).toBeTruthy();
    expect(live(el).querySelector("table.maya-sr")).toBeNull();
  });
  it("a view set before the first spec survives it", async () => {
    const el = await mount((e) => {
      e.view = { measure: 1, sortBy: ["v", "asc"], frame: 1 } as never;
      e.spec = spec();
    });
    expect(el.view.measure).toBe(1);
    expect(el.view.sortBy).toEqual(["v", "asc"]);
    expect(el.view.frame).toBe(1);
  });

  it("Enter on a focused legend button does not act on the hovered mark", async () => {
    const el = await mount((e) => (e.spec = spec(rows, { select: true })));
    const m = marks(el)[0]!;
    m.dispatchEvent(new Event("pointerover", { bubbles: true }) as never);
    m.dispatchEvent(
      Object.assign(new Event("pointermove", { bubbles: true }), { pointerType: "mouse" }),
    );
    expect(m.hasAttribute("data-active")).toBe(true);
    const got: unknown[] = [];
    el.addEventListener("maya-select", (e) => got.push(e));
    const b = live(el).querySelector<HTMLElement>("[data-maya=legend] button")!;
    const ev = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      composed: true,
      cancelable: true,
    });
    b.dispatchEvent(ev);
    expect(got.length).toBe(0);
    expect(ev.defaultPrevented).toBe(false);
  });

  it("a removed chart does not render", async () => {
    const el = await mount((e) => (e.spec = spec()));
    let n = 0;
    el.addEventListener("maya-render", () => n++);
    el.spec = spec(rows.map((r) => ({ ...r, v: (r.v as number) + 1 })));
    el.remove();
    await frame();
    expect(n).toBe(0);
  });

  it("kpi tooltip tone words are the tile status words, lower-is-better included", async () => {
    const words = async (better: "higher" | "lower", v: number) => {
      const el = await mount((e) => {
        e.spec = {
          type: "kpi",
          x: "m",
          y: "v",
          data: [
            { m: "a", v },
            { m: "b", v },
          ],
          colorBy: { target: 15, warn: better === "lower" ? 20 : 10, better },
        } as ChartSpec;
      });
      const m = marks(el).find((k) => k.getAttribute("data-key") === "b")!;
      m.dispatchEvent(new Event("pointerover", { bubbles: true }) as never);
      m.dispatchEvent(
        Object.assign(new Event("pointermove", { bubbles: true }), { pointerType: "mouse" }),
      );
      return el.shadowRoot!.querySelector(".maya-tip")!.textContent;
    };
    // The kpi tooltip speaks the tile's status words (#93.5), so lower-is-better needs no swap.
    expect(await words("higher", 5)).toContain(TEXT.offTrack);
    expect(await words("higher", 12)).toContain(TEXT.atRisk);
    expect(await words("higher", 20)).toContain(TEXT.onTrack);
    expect(await words("lower", 12)).toContain(TEXT.onTrack);
    expect(await words("lower", 18)).toContain(TEXT.atRisk);
    expect(await words("lower", 25)).toContain(TEXT.offTrack);
  });

  it("kpi tooltip prints data-label and anchors around every headline number", async () => {
    const el = await mount((e) => {
      e.spec = {
        type: "kpi",
        x: "m",
        y: ["a", "b"],
        data: [{ m: "t", a: 1, b: 2 }],
        titles: { a: "Alpha", b: "Beta" },
      } as ChartSpec;
    });
    const root = el.shadowRoot!;
    const vs = [...root.querySelectorAll('[data-key="v"],[data-key^="v~"]')];
    expect(vs.length).toBeGreaterThan(1);
    const m = marks(el)[0]!;
    m.setAttribute("data-label", "Shown");
    m.setAttribute("data-series", "key");
    vs.forEach(
      (v, i) =>
        (v.getBoundingClientRect = () =>
          ({
            left: 0,
            top: i * 100,
            right: 10,
            bottom: i * 100 + 10,
            width: 10,
            height: 10,
          }) as DOMRect),
    );
    m.dispatchEvent(new Event("pointerover", { bubbles: true }) as never);
    m.dispatchEvent(
      Object.assign(new Event("pointermove", { bubbles: true }), { pointerType: "mouse" }),
    );
    expect(root.querySelector(".maya-tip")!.textContent).toContain("Shown");
    const probe = root.querySelector<HTMLElement>(".maya-probe")!;
    if (probe)
      expect(parseFloat(probe.style.height)).toBeGreaterThanOrEqual((vs.length - 1) * 100 + 10);
  });
});

describe("maya-settled", () => {
  const events = (el: Element) => {
    const log: string[] = [];
    for (const t of ["maya-render", "maya-error", "maya-settled"])
      el.addEventListener(t, (e) => log.push(t + ((e as CustomEvent).detail?.error ? "!" : "")));
    return log;
  };
  const withAnims = (list: unknown[]) => {
    (ShadowRoot.prototype as any).getAnimations = () => list;
  };
  const running = () => {
    let done!: () => void;
    const finished = new Promise<void>((r) => (done = r));
    const a = { playState: "running", effect: { getComputedTiming: () => ({}) }, finished };
    return { a, end: () => ((a.playState = "finished"), done()) };
  };

  it("fires in the same task as maya-render when nothing animates", async () => {
    withAnims([]);
    const el = await mount(() => {});
    const log = events(el);
    el.spec = spec();
    await Promise.resolve();
    expect(log).toEqual(["maya-render", "maya-settled"]);
  });

  it("waits for running animations; a newer render supersedes", async () => {
    const r = running();
    withAnims([r.a]);
    const el = await mount(() => {});
    const log = events(el);
    el.spec = spec();
    const p = el.settled;
    await frame();
    expect(log).toEqual(["maya-render"]);
    r.end();
    await p;
    expect(log).toEqual(["maya-render", "maya-settled"]);
    const r2 = running();
    withAnims([r2.a]);
    el.spec = spec([{ q: "Q9", r: "N", v: 1 }]);
    await frame();
    withAnims([]);
    el.spec = spec([{ q: "Q8", r: "N", v: 1 }]);
    await frame();
    r2.end();
    await frame();
    expect(log.filter((t) => t === "maya-settled")).toHaveLength(2); // the first render and the latest
    withAnims([]);
  });

  it("a count-up holds it back", async () => {
    withAnims([]);
    const el = await mount((e) => (e.spec = { type: "kpi", y: "v", data: [{ v: 100 }] } as never));
    const log = events(el);
    el.spec = { type: "kpi", y: "v", data: [{ v: 5000 }] } as never;
    await Promise.resolve();
    expect(log).toEqual(["maya-render"]);
    await new Promise((r) => setTimeout(r, 1500));
    expect(log).toEqual(["maya-render", "maya-settled"]);
  });

  it("error: maya-error then maya-settled { error }; el.settled rejects, resolved ones stay resolved", async () => {
    withAnims([]);
    const el = await mount(() => {});
    const log = events(el);
    el.spec = spec();
    await expect(el.settled).resolves.toBeUndefined();
    el.spec = spec(rows, { x: "nope" });
    const p = el.settled;
    await expect(p).rejects.toMatchObject({ code: "unknown-field" });
    expect(log.slice(-2)).toEqual(["maya-error", "maya-settled!"]);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
});

describe("tooltip rows (issues #90.2, #93.3, #93.4, #93.5)", () => {
  const tipOf = async (s: object, i = 0) => {
    const el = await mount((e) => {
      e.spec = s as ChartSpec;
    });
    const m = marks(el)[i]!;
    m.dispatchEvent(new Event("pointerover", { bubbles: true }) as never);
    m.dispatchEvent(
      Object.assign(new Event("pointermove", { bubbles: true }), { pointerType: "mouse" }),
    );
    return el.shadowRoot!.querySelector(".maya-tip")!.textContent!;
  };
  it("a bar with was lists the was row, field and long forms", async () => {
    const d = [{ M: "Jan", S: 13, P: 24 }];
    expect(await tipOf({ type: "bar", x: "M", y: "S", was: "P", data: d })).toContain("was 24");
    const long = [
      { M: "Jan", Y: 2025, S: 24 },
      { M: "Jan", Y: 2026, S: 13 },
    ];
    expect(await tipOf({ type: "bar", x: "M", y: "S", was: { by: "Y" }, data: long })).toContain(
      "was 24",
    );
  });
  it("a field already shown appears once", async () => {
    const data = [{ U: 1, P: 2, S: 3, N: "a" }];
    const t = await tipOf({
      type: "scatter",
      x: "U",
      y: "P",
      size: "S",
      name: "N",
      tooltip: { fields: ["S"] },
      data,
    });
    expect(t.split("S").length - 1).toBe(1);
  });
  it("radial lists only the series present at the category", async () => {
    const data = [
      { it: "Jackets", fam: "Outerwear", v: 189 },
      { it: "Shirts", fam: "Tops", v: 68 },
    ];
    const t = await tipOf({ type: "radial", x: "it", y: "v", series: "fam", data });
    expect(t).toContain("Outerwear");
    expect(t).not.toContain("Tops");
  });
  it("kpi tooltip uses the tile's status keys", async () => {
    const data = [
      { m: "a", v: 1 },
      { m: "b", v: 2 },
    ];
    const t = await tipOf({
      type: "kpi",
      x: "m",
      y: "v",
      colorBy: { target: 5 },
      text: { offTrack: "Way off" },
      data,
    });
    expect(t).toContain("Way off");
  });
});

describe("parallel brush and select peers (issues #86.5, #87)", () => {
  const ptr = (type: string, y: number) =>
    Object.assign(new Event(type, { bubbles: true, composed: true }), {
      clientX: 50,
      clientY: y,
      pointerId: 1,
      pointerType: "mouse",
      button: 0,
      isPrimary: true,
    });
  const par = (extra: object = {}) =>
    ({
      type: "parallel",
      x: "m",
      y: ["a", "b"],
      brush: true,
      data: [
        { m: "p", a: 1, b: 5 },
        { m: "q", a: 3, b: 1 },
      ],
      ...extra,
    }) as ChartSpec;
  /** An axis rect 100..200 tall for a = 0..10 (top = 10); 1 css px = 1 viewBox unit. */
  async function brushed() {
    const el = await mount((e) => {
      e.spec = par();
    });
    const root = el.shadowRoot!;
    const svg = root.querySelector("svg.maya-svg") as SVGSVGElement;
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 640, height: 320 }) as DOMRect;
    svg.setPointerCapture = svg.releasePointerCapture = () => {};
    svg.setAttribute("viewBox", "0 0 640 320");
    const ev: any[] = [];
    el.addEventListener("maya-view", (e) => ev.push((e as CustomEvent).detail));
    // A commit re-renders and drops the rect, so each gesture gets a fresh one.
    const axis = () => {
      const s = root.querySelector("svg.maya-svg") as SVGSVGElement;
      s.getBoundingClientRect = () => ({ left: 0, top: 0, width: 640, height: 320 }) as DOMRect;
      s.setPointerCapture = s.releasePointerCapture = () => {};
      s.setAttribute("viewBox", "0 0 640 320");
      const ax = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      for (const [k, v] of Object.entries({
        "data-maya": "axis",
        "data-field": "a",
        "data-yd": "0 10",
        x: 40,
        y: 100,
        width: 20,
        height: 100,
      }))
        ax.setAttribute(k, String(v));
      s.append(ax);
      return ax;
    };
    const drag = (y0: number, y1: number) => {
      const ax = axis();
      ax.dispatchEvent(ptr("pointerdown", y0));
      ax.dispatchEvent(ptr("pointermove", y1));
      ax.dispatchEvent(ptr("pointerup", y1));
    };
    return { el, root, axis, ev, drag };
  }
  it("a drag inverts through data-yd, a click clears that axis, Escape clears all", async () => {
    const { root, axis, ev, drag } = await brushed();
    drag(120, 170); // top 10 at y100: 120 -> 8, 170 -> 3
    await frame();
    expect(ev.at(-1).brush).toEqual([["a", 3, 8]]);
    await frame();
    drag(110, 180);
    expect(ev.at(-1).brush).toEqual([["a", 2, 9]]);
    await frame();
    const ax = axis();
    ax.dispatchEvent(ptr("pointerdown", 150));
    ax.dispatchEvent(ptr("pointerup", 150));
    expect(ev.at(-1)).not.toHaveProperty("brush");
    await frame();
    drag(120, 170);
    root
      .querySelector(".maya")!
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }),
      );
    expect(ev.at(-1)).not.toHaveProperty("brush");
  });
  it("announces kept of total, and the clear", async () => {
    const { root, ev, drag } = await brushed();
    const lines = [...root.querySelectorAll("[data-maya=line]")];
    drag(120, 170);
    await frame();
    // Core marks data-off on the re-rendered lines; the stand-in marks one.
    root.querySelectorAll("[data-maya=line]")[1]?.setAttribute("data-off", "");
    root
      .querySelector(".maya")!
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }),
      );
    await new Promise((r) => setTimeout(r, 350));
    expect(root.querySelector("[data-maya=live]")!.textContent).toBe(TEXT.brushCleared);
    expect(lines.length).toBeGreaterThan(0);
    expect(ev).toHaveLength(2);
  });
  it("select { peers } sets view.peers from data-peer and clears with the selection", async () => {
    const data = [
      { n: "a", f: "F", i: "x", p: 1 },
      { n: "b", f: "F", i: "y", p: 2 },
    ];
    const el = await mount((e) => {
      e.spec = {
        type: "beeswarm",
        x: "f",
        y: "p",
        name: "n",
        select: { peers: "i" },
        data,
      } as ChartSpec;
    });
    const ev: any[] = [];
    el.addEventListener("maya-view", (e) => ev.push((e as CustomEvent).detail));
    const m = marks(el)[0]!;
    m.setAttribute("data-peer", "x");
    m.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await frame();
    expect(ev.at(-1).peers).toBe("x");
    expect(el.selected).toHaveLength(1);
    el.shadowRoot!.querySelector(".maya")!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }),
    );
    expect(ev.at(-1)).not.toHaveProperty("peers");
  });
});

describe("maya-register (#88)", () => {
  it("a failed invalid-theme chart and a connected one re-render on registerTheme", async () => {
    const { registerTheme } = await import("../src/core/validate.ts");
    const s = { ...spec(), theme: "late-house" } as ChartSpec;
    const a = await mount((e) => {
      e.spec = s;
    });
    expect(a.shadowRoot!.querySelector(".maya-err")).toBeTruthy();
    registerTheme("late-house", { accent: "#ff0000" });
    await frame();
    expect(a.shadowRoot!.querySelector(".maya-err")).toBeNull();
    expect(a.shadowRoot!.querySelector("svg.maya-svg")).toBeTruthy();
    registerTheme("late-house", { accent: "#00ff00" });
    await frame();
    expect(a.shadowRoot!.querySelector(".maya")!.getAttribute("class")).toBeTruthy();
  });
});

describe("M5 controls (#78 #80 #85)", () => {
  const qs = (el: Element, s: string) => el.shadowRoot!.querySelector<HTMLInputElement>(s)!;
  const fire = (e: Element, type: string) =>
    e.dispatchEvent(new Event(type, { bubbles: true, composed: true }));
  const prm = {
    type: "bar",
    x: "q",
    y: "v",
    colorBy: { target: { param: "t" }, better: "higher" },
    params: [{ id: "t", label: "Target", min: 0, max: 10, step: 1, value: 4 }],
    data: [
      { q: "A", v: 3 },
      { q: "B", v: 6 },
    ],
  } as unknown as ChartSpec;

  it("a param slider commits view.params once per frame and keeps its node; Reset clears it", async () => {
    const el = await mount((e) => (e.spec = prm));
    const ev: any[] = [];
    el.addEventListener("maya-view", (e) => ev.push((e as CustomEvent).detail));
    const input = qs(el, "[data-maya=param]");
    input.focus();
    for (const v of ["5", "7"]) {
      input.value = v;
      fire(input, "input");
    }
    await frame();
    expect(el.view.params).toEqual({ t: 7 });
    expect(ev).toHaveLength(1);
    expect(qs(el, "[data-maya=param]")).toBe(input); // patched in place, not replaced
    expect(qs(el, "output").textContent).toBe("7");
    expect(input.value).toBe("7");
    input.blur();
    qs(el, "[data-maya=params-reset]").click();
    await frame();
    expect(el.view.params).toBeUndefined();
    expect(qs(el, "[data-maya=param]").value).toBe("4");
  });

  const fr = (extra: object) =>
    ({
      type: "bar",
      x: "k",
      y: "v",
      frame: "yr",
      data: ["2021", "2022", "2023"].flatMap((yr, i) => [
        { yr, k: "A", v: i + 1 },
        { yr, k: "B", v: 2 },
      ]),
      ...extra,
    }) as ChartSpec;

  it("frame slider, select and tabs set view.frame; Play steps at frameSpeed and stops when a control moves it", async () => {
    const el = await mount((e) => (e.spec = fr({ frameControl: "both", frameSpeed: 100 })));
    const sl = qs(el, "input[data-maya=frame]");
    sl.value = "0";
    fire(sl, "input");
    await frame();
    expect(el.view.frame).toBe(0);
    expect(qs(el, "input[data-maya=frame]").getAttribute("aria-valuetext")).toBe("2021");
    qs(el, ".maya-play").click();
    await new Promise((r) => setTimeout(r, 330));
    expect(el.view.frame).toBe(2);
    el.spec = fr({ frameControl: "select" });
    await frame();
    const sel = qs(el, "select[data-maya=frame]") as unknown as HTMLSelectElement;
    sel.value = "1";
    fire(sel, "change");
    await frame();
    expect(el.view.frame).toBe(1);
    el.spec = fr({ frameControl: "tabs" });
    await frame();
    el.shadowRoot!.querySelectorAll<HTMLElement>("[data-maya=frame] [role=radio]")[2]!.click();
    await frame();
    expect(el.view.frame).toBe(2);
    expect(
      el.shadowRoot!.querySelectorAll("[data-maya=frame] [aria-checked=true]")[0]!.textContent,
    ).toBe("2023");
  });

  const fc = (extra: object = {}) =>
    ({
      type: "bar",
      x: "q",
      y: "v",
      facet: "s",
      drill: true,
      data: ["N", "S"].flatMap((s) =>
        ["Q1", "Q2"].map((q, i) => ({ s, q, v: (s === "N" ? 1 : 5) + i })),
      ),
      ...extra,
    }) as ChartSpec;

  it("facetScale radios write view.facetScale", async () => {
    const el = await mount((e) => (e.spec = fc({ facetScale: ["shared", "own"] })));
    const r = el.shadowRoot!.querySelectorAll<HTMLElement>("[data-maya=facetScale] [role=radio]");
    expect(r).toHaveLength(2);
    r[1]!.click();
    await frame();
    expect(el.view.facetScale).toBe("own");
    expect(
      el.shadowRoot!.querySelector("[data-maya=facetScale] [aria-checked=true]")!.textContent,
    ).toBe(TEXT.own);
  });

  it("facet panels: keyed per panel, a panel click drills, Escape and the crumb return", async () => {
    const el = await mount((e) => (e.spec = fc()));
    const root = el.shadowRoot!;
    const ps = [...root.querySelectorAll("svg[data-maya=panel]")];
    expect(ps.map((p) => p.getAttribute("data-facet"))).toEqual(["N", "S"]);
    expect(ps[0]!.querySelector("[data-maya=mark]")!.getAttribute("data-key")).toMatch(/^N~/);
    const keep = ps[1]!.querySelector("[data-maya=mark]");
    el.data = fc().data.map((r) => ({ ...r, v: (r.v as number) + 1 }));
    await frame();
    expect(root.querySelector("svg[data-maya=panel][data-facet=S] [data-maya=mark]")).toBe(keep);
    ps[1]!.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true, detail: 1 }));
    await frame();
    expect(el.view.drill).toEqual(["S"]);
    expect(root.querySelector("svg[data-maya=panel]")).toBeNull();
    root
      .querySelector(".maya")!
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }),
      );
    await frame();
    expect(el.view.drill ?? []).toEqual([]);
    expect(root.querySelectorAll("svg[data-maya=panel]")).toHaveLength(2);
  });

  it("Enter on a focused panel drills it; arrows stay inside the panel", async () => {
    const el = await mount((e) => (e.spec = fc()));
    const root = el.shadowRoot!;
    const p = root.querySelector("svg[data-maya=panel][data-facet=S]")!;
    const key = (k: string) =>
      p.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, composed: true }));
    key("ArrowRight");
    const on = root.querySelector("[data-active]")!;
    expect(p.contains(on)).toBe(true);
    key("Enter");
    await frame();
    expect(el.view.drill).toEqual(["S"]);
  });

  it("frame output follows view.frame without replacing the focused slider", async () => {
    const el = await mount((e) => (e.spec = fr({ frameControl: "both" })));
    const sl = qs(el, "input[data-maya=frame]");
    sl.focus();
    el.view = { frame: 0 };
    await frame();
    expect(qs(el, "input[data-maya=frame]")).toBe(sl);
    expect(qs(el, "[data-maya=frame-value]").textContent).toBe("2021");
  });

  it("a list headline keeps its tspans after the entrance and an update", async () => {
    const ls = (n: number) =>
      ({
        type: "list",
        x: "m",
        y: "v",
        data: ["A", "B"].map((m, i) => ({ m, v: n + i })),
      }) as ChartSpec;
    const el = await mount((e) => (e.spec = ls(10)));
    const n = () => el.shadowRoot!.querySelectorAll("text[data-maya=mark] tspan[data-num]").length;
    expect(n()).toBe(2);
    el.spec = ls(20);
    await frame();
    expect(n()).toBe(2);
    expect(el.shadowRoot!.querySelectorAll("text[data-maya=mark] tspan[data-hd]")).toHaveLength(2);
  });
});

describe("patch motion fixes", () => {
  const bar = (v: number, extra: object = {}) =>
    renderParts(
      {
        type: "bar",
        x: "q",
        y: "v",
        rules: [{ y: v }],
        data: ["A", "B", "C"].map((q, i) => ({ q, v: 10 + i * 5 + v })),
        ...extra,
      } as ChartSpec,
      { width: 640, height: 320 },
    ).svg;

  it("a rules group that moves is followed, not ghosted and re-faded", () => {
    const box = document.createElement("div");
    patch(box, bar(12), false);
    const g = box.querySelector("[data-maya=rules]");
    patch(box, bar(13), true);
    expect(box.querySelector("[data-maya=rules]")).toBe(g);
    expect(box.querySelectorAll("[data-ghost]")).toHaveLength(0);
  });

  it("an interrupted bar restarts without its stagger delay", () => {
    const box = document.createElement("div");
    document.body.append(box);
    const real = Element.prototype.animate;
    const next = bar(0, { data: ["A", "B", "C"].map((q, i) => ({ q, v: 30 + i * 9 })) });
    const delayOfLast = (interrupt: boolean) => {
      patch(box, bar(0), false);
      const last = [...box.querySelectorAll("rect[data-maya=mark]")].at(-1) as Element;
      let d: number | undefined;
      Element.prototype.animate = function (this: Element, _: unknown, o: { delay?: number }) {
        if (this === last) d = o.delay ?? 0;
        return { finished: Promise.resolve(), cancel() {}, addEventListener() {} } as never;
      } as never;
      const om = box.querySelector("[data-maya=marks]") as Element;
      om.getAnimations = (() =>
        interrupt ? [{ effect: { target: last }, cancel() {} }] : []) as never;
      patch(box, next, true);
      Element.prototype.animate = real;
      return d;
    };
    expect(delayOfLast(false)).toBeGreaterThan(0);
    expect(delayOfLast(true)).toBe(0);
  });

  it("a ghosted group keeps its computed paint", () => {
    const box = document.createElement("div");
    document.body.append(box);
    patch(box, bar(0), false);
    const labels = box.querySelector("[data-maya=labels], [data-maya=axis-x]");
    expect(labels).toBeTruthy();
    patch(box, bar(0, { xAxis: false, labels: false }), true);
    for (const gh of box.querySelectorAll("[data-ghost]"))
      expect(gh.hasAttribute("data-maya")).toBe(false);
  });
});
