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
import { type Box, boxOf, patch } from "./animate.ts";
import * as drill from "./drill.ts";
import { html } from "./html.ts";
import * as measure from "./measure.ts";
import * as select from "./select.ts";
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
  #ix: Record<"measure" | "drill" | "select" | "zoom", Handlers> | undefined;
  #say: ReturnType<typeof setTimeout> | undefined;
  #last: Record<string, string> = {};
  #size = [0, 0];
  #raf = 0;
  #ro: ResizeObserver | undefined;
  #resized = false;
  #off: (() => void) | undefined;
  #tip: Tooltip | undefined;
  #origin: Box | undefined;
  #vars = new Set<string>();
  #err = "";
  #drawn = false;

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
    const j = this.querySelector(':scope > script[type="application/json"]')?.textContent;
    try {
      if (j) this.#json = JSON.parse(j);
    } catch (e) {
      console.error(e);
    }
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
    root.addEventListener("click", this.#click);
    root.addEventListener("keydown", this.#key);
    globalThis.addEventListener("maya-register", this.#registered);
    const host: Host = {
      root,
      el: this,
      spec: () => this.spec,
      state: () => this.#state,
      commit: (next, target) => this.#commit(next, target ?? null),
      announce: (text) => this.#announce(text),
    };
    this.#ix = {
      measure: measure.mount(host),
      drill: drill.mount(host),
      select: select.mount(host),
      zoom: zoom.mount(host),
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
        this.#schedule();
      }
    });
    this.#ro.observe(box);
    this.#schedule();
  }

  disconnectedCallback(): void {
    cancelAnimationFrame(this.#raf);
    this.#raf = 0;
    this.#ro?.disconnect();
    this.#off?.();
    this.shadowRoot?.removeEventListener("click", this.#click);
    this.shadowRoot?.removeEventListener("keydown", this.#key);
    globalThis.removeEventListener("maya-register", this.#registered);
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
    for (const e of c.querySelectorAll("[data-active]")) e.removeAttribute("data-active");
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
    // Drilling: the clicked mark is where entering marks start from.
    const am = this.#tip?.active();
    if (am && JSON.stringify(prev.view.drill) !== JSON.stringify(next.view.drill))
      this.#origin = boxOf(am);
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

  #schedule(): void {
    if (this.isConnected && !this.#raf)
      this.#raf = requestAnimationFrame(() => ((this.#raf = 0), this.#render()));
  }

  #render(): void {
    const root = this.shadowRoot!;
    const spec = this.spec;
    const box = root.querySelector(".maya-box")!;
    if (!spec) return;
    if (spec !== this.#seen) {
      // Persistence rules live in the reducers (measure, drill, zoom, select).
      const ev: SpecEvent = { type: "spec", prev: this.#seen, next: spec };
      this.#state = select.reduce(
        zoom.reduce(drill.reduce(measure.reduce(this.#state, ev), ev), ev),
        ev,
      );
      this.#seen = spec;
    }
    const width = box.clientWidth || 640,
      height = box.clientHeight || 320;
    this.#size = [box.clientWidth, box.clientHeight];
    let parts;
    try {
      parts = renderParts(spec, {
        width,
        height,
        view: this.#state.view,
        selected: this.#state.selected,
      });
    } catch (e) {
      this.#tip?.hide();
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
    const focus = this.#focusId();
    const maya = root.querySelector<HTMLElement>(".maya")!;
    // Slots in shell order; each is replaced only when its markup changed.
    const slots: [keyof Parts, string][] = [
      ["title", ".maya-title"],
      ["controls", ".maya-ctl"],
      ["legend", "[data-maya=legend]"],
      ["crumbs", ".maya-crumbs"],
    ];
    slots.forEach(([k, sel], i) => {
      if (this.#last[k] === parts[k]) return;
      this.#last[k] = parts[k] as string;
      root.querySelector(sel)?.remove();
      const next = slots.slice(i + 1).map(([, s]) => root.querySelector(s));
      (next.find(Boolean) ?? box).insertAdjacentHTML("beforebegin", html(parts[k] as string));
    });
    if (this.#last["table"] !== parts.table) {
      this.#last["table"] = parts.table;
      root.querySelector("table.maya-sr")?.remove();
      box.insertAdjacentHTML("afterend", html(parts.table));
    }
    // Overrides via CSSOM (never a style attribute).
    for (const [k, v] of parts.vars) maya.style.setProperty(k, v);
    for (const k of this.#vars)
      if (!parts.vars.some(([n]) => n === k)) maya.style.removeProperty(k);
    this.#vars = new Set(parts.vars.map(([k]) => k));
    // Nothing animates on resize: geometry must track the container immediately.
    const still =
      this.#resized ||
      spec.animate === false ||
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.#resized = false;
    patch(box, parts.svg, this.#drawn && !still, {
      origin: this.#origin,
      after: () => this.#tip?.refresh(),
    });
    this.#origin = undefined;
    this.#drawn = true;
    this.#restore(focus);
    for (const h of Object.values(this.#ix ?? {})) h.painted?.();
    this.#emit("maya-render", {});
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

const FOCUS: [string, string][] = [
  ["svg", ".maya-svg"],
  ["legend", "[data-maya=legend] button"],
  ["measure", ".maya-ctl [role=radio]"],
  ["crumb", ".maya-crumbs :is(button,a)"],
  ["reset", ".maya-reset"],
];
