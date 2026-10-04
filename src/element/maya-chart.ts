import { VERSION } from "../core/registry.ts";
import { renderParts, shellInner } from "../core/render.ts";
import { MayaSpecError } from "../core/validate.ts";
import type {
  ChartSpec,
  Handlers,
  Host,
  MayaErrorDetail,
  MayaSelectDetail,
  Sel,
  SpecEvent,
  State,
  View,
} from "../core/types.ts";
import { css } from "../styles/theme.ts";
import { patch } from "./animate.ts";
import * as drill from "./drill.ts";
import { html } from "./html.ts";
import * as measure from "./measure.ts";
import * as select from "./select.ts";
import { tooltip } from "./tooltip.ts";
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
  #off: (() => void) | undefined;
  #hide: (() => void) | undefined;
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
      announce: (text) => {
        clearTimeout(this.#say);
        this.#say = setTimeout(() => {
          const live = root.querySelector("[data-maya=live]");
          if (live) live.textContent = text;
        }, 300);
      },
    };
    this.#ix = {
      measure: measure.mount(host),
      drill: drill.mount(host),
      select: select.mount(host),
      zoom: zoom.mount(host),
    };
    const box = root.querySelector(".maya-box")!;
    [this.#off, this.#hide] = tooltip(root, () => this.spec?.tooltip !== false);
    this.#ro = new ResizeObserver(() => {
      if (
        Math.abs(box.clientWidth - this.#size[0]!) > 1 ||
        Math.abs(box.clientHeight - this.#size[1]!) > 1
      )
        this.#schedule();
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

  #emit(type: string, detail: unknown, cancelable = false): boolean {
    return this.dispatchEvent(
      new CustomEvent(type, { detail, bubbles: true, composed: true, cancelable }),
    );
  }

  /** User-initiated state change: re-render, then tell the page what changed. */
  #commit(next: State, target: MayaSelectDetail["target"]): void {
    const prev = this.#state;
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
    const k = (e as KeyboardEvent).key;
    let done: boolean | undefined;
    if (k === "Escape")
      done =
        ix.zoom.cancel?.() || ix.select.escape?.() || ix.zoom.escape?.() || ix.drill.escape?.();
    else if (k === "Enter") {
      const m = this.shadowRoot!.querySelector("[data-maya=mark][data-active]");
      done = !!m && (ix.drill.enter?.(m) || ix.select.enter?.(m));
    }
    if (done) e.preventDefault();
  };

  #click = (e: Event) => {
    // In select mode the legend selects (select.ts) instead of hiding.
    if (this.spec?.select) return;
    const b = (e.target as Element).closest("[data-maya=legend] button");
    if (!b) return;
    const k = b.textContent ?? "";
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
      const d: MayaErrorDetail | null =
        e instanceof MayaSpecError ? { code: e.code, path: e.path, message: e.message } : null;
      // Cancelable: preventDefault() hides the box (the host shows its own error).
      if (d && !this.#emit("maya-error", d, true)) {
        box.replaceChildren();
        this.#drawn = false;
        return;
      }
      const pre = document.createElement("pre");
      pre.className = "maya-err";
      pre.setAttribute(
        "style",
        "margin:0;padding:8px;color:#c00;white-space:pre-wrap;font:12px monospace",
      );
      pre.textContent = e instanceof Error ? e.message : String(e);
      box.replaceChildren(pre);
      this.#drawn = false;
      if (pre.textContent !== this.#err) console.error(e);
      this.#err = pre.textContent;
      return;
    }
    this.#err = "";
    this.#hide?.();
    const maya = root.querySelector(".maya")!;
    const put = (
      k: "legend" | "title" | "table",
      sel: string,
      ref: Element | null,
      where: InsertPosition,
    ) => {
      const markup = parts[k];
      if (this.#last[k] === markup) return;
      this.#last[k] = markup;
      const old = root.querySelector(sel);
      const i =
        k === "legend"
          ? [...root.querySelectorAll("[data-maya=legend] button")].indexOf(
              (root.activeElement ?? box) as Element,
            )
          : -1;
      old?.remove();
      (ref ?? box).insertAdjacentHTML(where, html(markup));
      if (i >= 0) root.querySelectorAll<HTMLElement>("[data-maya=legend] button")[i]?.focus();
    };
    put("legend", "[data-maya=legend]", null, "beforebegin");
    put("title", ".maya-title", root.querySelector("[data-maya=legend]"), "beforebegin");
    put("table", "table.maya-sr", null, "afterend");
    if (this.#last["style"] !== parts.style) {
      this.#last["style"] = parts.style;
      if (parts.style) maya.setAttribute("style", parts.style);
      else maya.removeAttribute("style");
    }
    const still = spec.animate === false || matchMedia("(prefers-reduced-motion: reduce)").matches;
    patch(box, parts.svg, this.#drawn && !still);
    this.#drawn = true;
    for (const h of Object.values(this.#ix ?? {})) h.painted?.();
    this.#emit("maya-render", {});
  }
}
