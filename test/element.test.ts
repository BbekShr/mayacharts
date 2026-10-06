// @vitest-environment happy-dom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { patch } from "../src/element/animate.ts";
import { MayaChart } from "../src/element/maya-chart.ts";
import { renderParts } from "../src/core/render.ts";
import "../src/flow.ts";
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

  it("a spec error removes the stale data table", async () => {
    const el = await mount((e) => (e.spec = spec()));
    await new Promise((r) => setTimeout(r, 50));
    expect(live(el).querySelector("table.maya-sr")).toBeTruthy();
    el.spec = { type: "bar" } as never;
    await new Promise((r) => setTimeout(r, 50));
    expect(live(el).querySelector(".maya-err")).toBeTruthy();
    expect(live(el).querySelector("table.maya-sr")).toBeNull();
  });
});
