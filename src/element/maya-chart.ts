import { VERSION } from "../core/registry.ts";
import { renderParts, shellInner } from "../core/render.ts";
import { MayaSpecError } from "../core/validate.ts";
import type {
  ChartSpec,
  Handlers,
  Host,
  MayaErrorDetail,
  MayaSelectDetail,
  Parts,
  Sel,
  SpecEvent,
  State,
  View,
} from "../core/types.ts";
import { css } from "../styles/theme.ts";
import { type Intro, patch, type PatchOptions } from "./animate.ts";
import * as drill from "./drill.ts";
import { html } from "./html.ts";
import { listen } from "./listen.ts";
import * as measure from "./measure.ts";
import * as play from "./play.ts";
import * as select from "./select.ts";
import * as sort from "./sort.ts";
import { type Tooltip, tooltip } from "./tooltip.ts";
import * as zoom from "./zoom.ts";

let sheet: CSSStyleSheet | undefined;

export class MayaChart extends HTMLElement {
  static observedAttributes = ["spec"];
  static version = VERSION;
  #prop: ChartSpec | undefined;
  #json: ChartSpec | undefined;
  #attr: ChartSpec | undefined;
  #state: State = { view: {}, selected: [] };
  #seen: ChartSpec | undefined;
  #ix: Record<"measure" | "drill" | "select" | "zoom" | "sort" | "play", Handlers> | undefined;
  #say: ReturnType<typeof setTimeout> | undefined;
  #last: Record<string, string> = {};
  #size = [0, 0];
  #q = false;
  #raf = false;
  #ro: ResizeObserver | undefined;
  #resized = false;
  #off: (() => void) | undefined;
  #unlisten: (() => void)[] = [];
  #tip: Tooltip | undefined;
  #zoom: PatchOptions["zoom"];
  #vars = new Set<string>();
  #err = "";
  #drawn = false;
  #tbl = 0;

  get spec(): ChartSpec | undefined {
    return this.#prop ?? this.#json ?? this.#attr;
  }
  // Accepts typed rows (ChartSpec<MyRow>); reads back as the Row-typed spec.
  set spec(v: ChartSpec<any> | undefined) {
    this.#prop = v;
    this.#schedule();
  }
  get data(): ChartSpec["data"] | undefined {
    return this.spec?.data;
  }
  set data(rows: ChartSpec["data"]) {
    this.#prop = { ...this.spec!, data: rows };
    this.#schedule();
  }

  /** Interaction state ({ measure, drill, window, hidden }). Setting never dispatches events. */
  get view(): View {
    return this.#state.view;
  }
  set view(v: View) {
    this.#state = { ...this.#state, view: v ?? {} };
    this.#schedule();
  }
  /** Selected marks by raw values. Setting never dispatches events. */
  get selected(): readonly Sel[] {
    return this.#state.selected;
  }
  set selected(v: readonly Sel[]) {
    this.#state = { ...this.#state, selected: v ?? [] };
    this.#schedule();
  }

  attributeChangedCallback(_: string, __: string | null, v: string | null): void {
    try {
      this.#attr = v ? JSON.parse(v) : undefined;
    } catch (e) {
      this.#attr = undefined;
      console.error(e);
    }
    this.#schedule();
  }

  connectedCallback(): void {
    // Upgrade race: properties set on the element before it was defined shadow the accessors.
    for (const p of ["spec", "data", "view", "selected"] as const)
      if (Object.hasOwn(this, p)) {
        const v = (this as any)[p];
        delete (this as any)[p];
        (this as any)[p] = v;
      }
    this.#readJson();
    let root = this.shadowRoot;
    if (!root) {
      root = this.attachShadow({ mode: "open" });
      sheet ??= new CSSStyleSheet();
      if (!sheet.cssRules.length) sheet.replaceSync(css);
      root.adoptedStyleSheets = [sheet];
      root.innerHTML = html(
        shellInner(
          {
            svg: "",
            legend: "",
            controls: "",
            crumbs: "",
            table: "",
            title: "",
            style: "",
            vars: [],
            warnings: [],
          },
          "",
        ),
      );
    }
    this.#unlisten = [
      listen(root, ["click", this.#click], ["keydown", this.#key]),
      listen(globalThis, ["maya-register", this.#registered]),
    ];
    const host: Host = {
      root,
      el: this,
      spec: () => this.spec,
      state: () => this.#state,
      commit: (next, target) => this.#commit(next, target ?? null),
      announce: (text) => this.#announce(text),
      mark: (e) => this.#tip?.pick(e),
    };
    this.#ix = {
      measure: measure.mount(host),
      drill: drill.mount(host),
      select: select.mount(host),
      zoom: zoom.mount(host),
      sort: sort.mount(host),
      play: play.mount(host),
    };
    const box = root.querySelector(".maya-box")!;
    this.#tip = tooltip(
      root,
      () => this.spec?.tooltip !== false,
      (t) => this.#announce(t),
      () => this.spec,
    );
    this.#off = this.#tip.off;
    this.#ro = new ResizeObserver(() => {
      if (
        Math.abs(box.clientWidth - this.#size[0]!) > 1 ||
        Math.abs(box.clientHeight - this.#size[1]!) > 1
      ) {
        this.#ix?.zoom.cancel?.(); // a brush's pixel geometry is stale after a resize
        this.#resized = true;
        this.#schedule(true);
      }
    });
    this.#ro.observe(box);
    this.#schedule();
  }

  /** The SSR spec child. A parser-created element connects before its children are parsed. */
  #readJson(): void {
    const j = this.querySelector(':scope > script[type="application/json"]')?.textContent;
    try {
      if (j) this.#json = JSON.parse(j);
    } catch (e) {
      console.error(e);
    }
  }

  disconnectedCallback(): void {
    this.#q = false;
    this.#ro?.disconnect();
    this.#off?.();
    this.#unlisten.forEach((f) => f());
    clearTimeout(this.#say);
    for (const h of Object.values(this.#ix ?? {})) h.off();
    this.#ix = undefined;
  }

  #registered = () => this.#schedule();

  /** Polite live region: static node, textContent only, debounced 300 ms. User-initiated only. */
  #announce(text: string): void {
    clearTimeout(this.#say);
    this.#say = setTimeout(() => {
      const live = this.shadowRoot?.querySelector("[data-maya=live]");
      if (live) live.textContent = text;
    }, 300);
  }

  /** Standalone SVG: custom properties resolved from the computed style (dark export looks right). */
  toSVG(): string {
    const root = this.shadowRoot;
    const svg = root?.querySelector<SVGSVGElement>("svg.maya-svg");
    if (!root || !svg) return "";
    const cs = getComputedStyle(root.querySelector(".maya")!);
    const names = new Set([...css.matchAll(/--maya-[\w-]+/g)].map((m) => m[0]));
    for (const v of this.#vars) names.add(v);
    const decl = [...names]
      .map((k) => [k, cs.getPropertyValue(k).trim()])
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}:${v}`)
      .join(";");
    const c = svg.cloneNode(true) as SVGSVGElement;
    c.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    c.removeAttribute("tabindex");
    for (const e of c.querySelectorAll("[data-active],[data-lit]"))
      (e.removeAttribute("data-active"), e.removeAttribute("data-lit"));
    for (const e of c.querySelectorAll("[data-ghost],[data-maya=band]")) e.remove();
    const st = document.createElementNS("http://www.w3.org/2000/svg", "style");
    st.textContent = `${css}.maya-svg{${decl}}`;
    c.prepend(st);
    return c.outerHTML;
  }

  #emit(type: string, detail: unknown, cancelable = false): boolean {
    return this.dispatchEvent(
      new CustomEvent(type, { detail, bubbles: true, composed: true, cancelable }),
    );
  }

  /** User-initiated state change: re-render, then tell the page what changed. */
  #commit(next: State, target: MayaSelectDetail["target"]): void {
    const prev = this.#state;
    // Drilling zooms into the branch entered, or out of the branch left. Flows keep their
    // nodes in place across a drill (stable keys), so they morph instead.
    const [d0, d1] = [prev.view.drill ?? [], next.view.drill ?? []];
    const flow = this.spec?.type === "sankey";
    if (flow) this.#zoom = undefined;
    else if (d1.length > d0.length) this.#zoom = { in: d1[d0.length]! };
    else if (d1.length < d0.length) this.#zoom = { out: d0[d1.length]! };
    this.#state = next;
    this.#schedule();
    if (JSON.stringify(prev.view) !== JSON.stringify(next.view)) this.#emit("maya-view", next.view);
    if (JSON.stringify(prev.selected) !== JSON.stringify(next.selected))
      this.#emit("maya-select", {
        selected: [...next.selected],
        target,
      } satisfies MayaSelectDetail);
  }

  /*
   * One keydown dispatcher. Escape priority: pinned tooltip (tooltip.ts, T2) -> brush in
   * progress -> selection -> zoom window -> drill pop. Enter: drill, else select, on the
   * keyboard-active mark. T2 routes the tooltip's own Escape/Enter/Space through here.
   */
  #key = (e: Event) => {
    const ix = this.#ix;
    if (!ix) return;
    if (e.defaultPrevented) return; // the tooltip consumed it (pinned Escape)
    const k = (e as KeyboardEvent).key;
    let done: boolean | undefined;
    if (k === "Escape")
      done =
        ix.zoom.cancel?.() || ix.select.escape?.() || ix.zoom.escape?.() || ix.drill.escape?.();
    else if (k === "Enter") {
      const m = this.#tip?.active();
      done = !!m && (ix.drill.enter?.(m) || ix.select.enter?.(m));
    }
    if (done) e.preventDefault();
  };

  #click = (e: Event) => {
    // In select mode the legend selects (select.ts) instead of hiding.
    if (this.spec?.select) return;
    const b = (e.target as Element).closest("[data-maya=legend] button");
    if (!b) return;
    const k = b.getAttribute("data-key") ?? "";
    const hidden = new Set(this.#state.view.hidden);
    if (hidden.has(k)) hidden.delete(k);
    else if (this.shadowRoot!.querySelectorAll("[data-maya=legend] [aria-pressed=true]").length > 1)
      hidden.add(k);
    else return;
    this.#commit({ ...this.#state, view: { ...this.#state.view, hidden: [...hidden] } }, null);
  };

  /** Renders in a microtask (property sets in one task batch); ResizeObserver delivery waits a frame. */
  #schedule(raf = false): void {
    if (!this.isConnected || (raf ? this.#raf : this.#q)) return;
    const run = () => {
      if (raf) this.#raf = false;
      else this.#q = false;
      this.#render(raf);
    };
    if (raf) ((this.#raf = true), requestAnimationFrame(run));
    else ((this.#q = true), queueMicrotask(run));
  }

  #render(fromRaf = false): void {
    const root = this.shadowRoot!;
    if (!this.spec) this.#readJson();
    const spec = this.spec;
    const box = root.querySelector(".maya-box")!;
    if (!spec) {
      // Still parsing: the JSON child may arrive later in this document.
      if (document.readyState === "loading") (this.#readJson(), this.#schedule(true));
      return;
    }
    if (spec !== this.#seen) {
      // Persistence rules live in the reducers (measure, drill, zoom, select).
      const ev: SpecEvent = { type: "spec", prev: this.#seen, next: spec };
      this.#state = select.reduce(
        zoom.reduce(
          sort.reduce(play.reduce(drill.reduce(measure.reduce(this.#state, ev), ev), ev), ev),
          ev,
        ),
        ev,
      );
      this.#seen = spec;
    }
    const draw = (s = spec) => {
      this.#size = [box.clientWidth, box.clientHeight];
      return renderParts(s, {
        width: box.clientWidth || 640,
        height: box.clientHeight || 320,
        view: this.#state.view,
        selected: this.#state.selected,
      });
    };
    // Before #slots: a focused legend button or crumb may be replaced.
    const focus = this.#focusId();
    let parts;
    try {
      if (!this.#drawn && !box.querySelector("svg"))
        try {
          // Title and controls depend only on the spec: place them first, measure once. No
          // measuring here: reading the box now would force a layout that is thrown away.
          this.#slots(root, renderParts({ ...spec, data: [] }, { width: 640, height: 320 }));
        } catch {} // the real draw reports the error
      parts = draw();
      // ponytail: a multi-series legend needs the data, so it still costs a second draw.
      // A title, legend or control that just appeared shrinks the box: fit it in this frame.
      const [w, h] = this.#size;
      if (this.#slots(root, parts) && (box.clientWidth !== w || box.clientHeight !== h))
        parts = draw();
    } catch (e) {
      this.#tip?.hide();
      // The old table would describe data the box no longer shows; cancel a pending idle insert.
      this.#tbl++;
      this.#last["table"] = "";
      root.querySelector("table.maya-sr")?.remove();
      const d: MayaErrorDetail | null =
        e instanceof MayaSpecError ? { code: e.code, path: e.path, message: e.message } : null;
      // Cancelable: preventDefault() hides the box (the host shows its own error).
      if (d && !this.#emit("maya-error", d, true)) {
        box.replaceChildren();
        this.#drawn = false;
        return;
      }
      const pre = document.createElement("pre");
      pre.className = "maya-err"; // styled by theme.ts; never an inline style
      pre.textContent = e instanceof Error ? e.message : String(e);
      box.replaceChildren(pre);
      this.#drawn = false;
      if (pre.textContent !== this.#err) console.error(e);
      this.#err = pre.textContent;
      return;
    }
    this.#err = "";
    const maya = root.querySelector<HTMLElement>(".maya")!;
    // The table is hidden but costs its markup, style and layout (1000 scatter rows: ~10 ms), so
    // it is built and inserted when the browser is idle (2 s at most) and only the latest lands.
    // ponytail: a screen reader sees the table a moment after the marks.
    const n = ++this.#tbl;
    const late = () => {
      if (n !== this.#tbl || this.#last["table"] === parts.table) return;
      this.#last["table"] = parts.table;
      root.querySelector("table.maya-sr")?.remove();
      box.insertAdjacentHTML("afterend", html(parts.table));
    };
    // Without requestIdleCallback (Safari) the options coerce to a 0 ms timeout: the next task.
    (globalThis.requestIdleCallback ?? setTimeout)(late, { timeout: 2000 } as never);
    // Overrides via CSSOM (never a style attribute).
    for (const [k, v] of parts.vars) maya.style.setProperty(k, v);
    for (const k of this.#vars)
      if (!parts.vars.some(([n]) => n === k)) maya.style.removeProperty(k);
    this.#vars = new Set(parts.vars.map(([k]) => k));
    // Nothing animates on resize: geometry must track the container immediately.
    const still = spec.animate === false || matchMedia("(prefers-reduced-motion: reduce)").matches;
    maya.toggleAttribute("data-still", spec.animate === false); // CSS transitions off too
    // A microtask render beside a pending resize frame is not the resize's own: it animates.
    const resized = this.#resized && fromRaf;
    if (fromRaf) this.#resized = false;
    // First draw plays an entrance, unless the chart arrived server-rendered (already on screen).
    const intro: Intro | undefined =
      this.#drawn || box.querySelector("svg") ? undefined : (INTRO[spec.type] ?? "marks");
    patch(box, parts.svg, (this.#drawn || !!intro) && !still, {
      intro,
      zoom: this.#zoom,
      after: () => this.#tip?.refresh(),
      instant: resized,
    });
    this.#zoom = undefined;
    this.#drawn = true;
    this.#restore(focus);
    for (const h of Object.values(this.#ix ?? {})) h.painted?.();
    this.#emit("maya-render", {});
  }

  /** Slots in shell order; each is replaced only when its markup changed. True if any was. */
  #slots(root: ShadowRoot, parts: Parts): boolean {
    const box = root.querySelector(".maya-box")!;
    let changed = false;
    SLOTS.forEach(([k, sel], i) => {
      if (this.#last[k] === parts[k]) return;
      changed = true;
      this.#last[k] = parts[k] as string;
      root.querySelectorAll(sel).forEach((e) => e.remove());
      const next = SLOTS.slice(i + 1).map(([, s]) => root.querySelector(s));
      (next.find(Boolean) ?? box).insertAdjacentHTML("beforebegin", html(parts[k] as string));
    });
    return changed;
  }

  /** Stable id of the focused control: svg, legend:i, measure:i, crumb:i or reset. */
  #focusId(): string | undefined {
    const f = this.shadowRoot!.activeElement;
    if (!f) return;
    for (const [id, sel] of FOCUS) {
      const all = [...this.shadowRoot!.querySelectorAll(sel)];
      const i = all.indexOf(f);
      if (i >= 0) return `${id}:${i}`;
    }
  }

  #restore(id: string | undefined): void {
    const root = this.shadowRoot!;
    if (!id || root.activeElement) return;
    const [k, i] = id.split(":");
    const sel = FOCUS.find(([n]) => n === k)![1];
    root.querySelectorAll<HTMLElement>(sel)[+i!]?.focus({ preventScroll: true });
  }
}

const SLOTS: [keyof Parts, string][] = [
  ["title", ".maya-title"],
  ["controls", ".maya-ctl,.maya-play"],
  ["legend", ".maya-legend"],
  ["crumbs", ".maya-crumbs"],
];

const INTRO: Record<string, Intro> = {
  line: "wipe",
  area: "wipe",
  sankey: "wipe",
  ridgeline: "wipe",
  parallel: "wipe",
  weave: "wipe",
  sunburst: "bloom",
  chord: "bloom",
  radial: "bloom",
};

const FOCUS: [string, string][] = [
  ["svg", ".maya-svg"],
  ["legend", "[data-maya=legend] button"],
  ["measure", ".maya-ctl [role=radio]"],
  ["crumb", ".maya-crumbs :is(button,a)"],
  ["reset", ".maya-reset"],
  ["play", ".maya-play"],
];
