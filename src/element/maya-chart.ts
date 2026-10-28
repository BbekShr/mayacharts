import { VERSION } from "../core/registry.ts";
import { renderParts, shellInner } from "../core/render.ts";
import { MayaSpecError, subSpec } from "../core/validate.ts";
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
import { type Intro, idle, mend, patch, sync, type PatchOptions, turn, ZOOM } from "./animate.ts";
import * as ctl from "./ctl.ts";
import * as flip from "./flip.ts";
import * as drill from "./drill.ts";
import * as expand from "./expand.ts";
import { html } from "./html.ts";
import { listen } from "./listen.ts";
import * as measure from "./measure.ts";
import * as play from "./play.ts";
import * as brush from "./brush.ts";
import * as select from "./select.ts";
import * as sort from "./sort.ts";
import { still as reduced, type Tooltip, tooltip } from "./tooltip.ts";
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
  #ix:
    | (Record<
        "measure" | "drill" | "expand" | "select" | "brush" | "sort" | "play" | "flip" | "ctl",
        Handlers
      > & {
        zoom: ReturnType<typeof zoom.mount>;
      })
    | undefined;
  #say: ReturnType<typeof setTimeout> | undefined;
  #last: Record<string, string> = {};
  #size = [0, 0];
  #q = false;
  #raf = false;
  #ro: ResizeObserver | undefined;
  #resized = false;
  #unlisten: (() => void)[] = [];
  #tip: Tooltip | undefined;
  #zoom: PatchOptions["zoom"];
  #fl = false; // a drill changed the breadcrumb row: glide the plot
  #vars = new Set<string>();
  #err = "";
  #drawn = false;
  #intro = 0; // performance.now() of the animated first draw
  #idle: (() => void) | undefined; // cancels the queued data-table insert
  #face = "front"; // the face last drawn
  #turn: ((undo?: boolean) => void) | undefined; // cancels a card turn in flight
  #bk: [ChartSpec, ChartSpec, object] | undefined; // [front, sub-spec with the front's rows, sub-spec]

  /** What the interaction modules read: the back's options while the back shows (same rows). */
  #act(): ChartSpec | undefined {
    const s = this.spec;
    const sub =
      this.#state.view.face === "back" && s?.back
        ? s.back
        : s?.drillTo && this.#state.view.drill?.length // a drilled line is the sub-chart: its measure, its titles
          ? subSpec(s, s.drillTo)
          : undefined;
    if (!s || !sub) return s;
    return (this.#bk =
      this.#bk?.[0] === s && this.#bk[2] === sub
        ? this.#bk
        : [s, { ...sub, data: s.data } as ChartSpec, sub])[1];
  }

  #gen = 0; // the latest paint; an older one's settle is dropped
  #end: ((e: Error | null) => void) | undefined; // settles #sp; undefined once settled
  #sp = this.#arm();
  #arm(): Promise<void> {
    const p = new Promise<void>((ok, no) => (this.#end = (e) => (e ? no(e) : ok())));
    p.catch(() => {}); // a rejection nobody reads is not unhandled
    return p;
  }

  /** Resolves when the current or next render has finished animating; rejects with its error. */
  get settled(): Promise<void> {
    return this.#sp;
  }

  #settle(error: Error | null, wait?: Promise<unknown>): void {
    const n = ++this.#gen;
    const fin = () => {
      if (n !== this.#gen) return;
      this.#emit("maya-settled", { error });
      this.#end?.(error);
      this.#end = undefined;
    };
    wait ? wait.then(fin) : fin();
  }

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
      listen(
        root,
        ["click", this.#click],
        ["keydown", this.#key],
        ["pointerover", legend],
        ["pointerout", legend],
      ),
      listen(globalThis, ["maya-register", this.#registered]),
    ];
    const host: Host = {
      root,
      el: this,
      spec: () => this.#act(),
      state: () => this.#state,
      commit: (next, target) => this.#commit(next, target ?? null),
      announce: (text) => this.#announce(text),
      mark: (e) => this.#tip?.pick(e),
    };
    this.#ix = {
      measure: measure.mount(host),
      select: select.mount(host), // before drill: a double click restores the selection, then drills
      drill: drill.mount(host),
      expand: expand.mount(host),
      brush: brush.mount(host),
      zoom: zoom.mount(host),
      sort: sort.mount(host),
      play: play.mount(host),
      flip: flip.mount(host),
      ctl: ctl.mount(host),
    };
    const box = root.querySelector(".maya-box")!;
    this.#tip = tooltip(
      root,
      () => this.spec?.tooltip !== false,
      (t) => this.#announce(t),
      () => this.#act(),
    );
    this.#unlisten.push(this.#tip.off);
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
    this.#ro.observe(this); // the host's height drives data-compact
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
    c.querySelector("[data-hot]")?.removeAttribute("data-hot");
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
    const z = (a: readonly string[] = [], b: readonly string[] = []): PatchOptions["zoom"] =>
      b.length > a.length
        ? { in: b[a.length]! }
        : b.length < a.length
          ? { out: a[b.length]! }
          : undefined;
    const zz = z(prev.view.drill, next.view.drill) ?? z(prev.view.xDrill, next.view.xDrill);
    this.#fl = !!zz;
    // A table row is a thin bar, not a container: its rows swap by key instead of zooming.
    if (/^(sankey|table)$/.test(this.spec?.type ?? "")) this.#fl && this.#tip?.hide();
    else this.#zoom = zz ?? this.#zoom;
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
   * progress -> card back face -> selection -> brush ranges -> zoom window -> drill pop. Enter: select, else drill (drill first without
   * select; Shift+Enter drills), on the keyboard-active mark. + or = halves the zoom window about the active mark, - doubles it. T2 routes the tooltip's own Escape/Enter/Space through here.
   */
  #key = (e: Event) => {
    const ix = this.#ix;
    if (!ix) return;
    if (e.defaultPrevented) return; // the tooltip consumed it (pinned Escape)
    const k = (e as KeyboardEvent).key;
    let done: boolean | undefined;
    if (k === "Escape" && !(e.target as Element).closest?.("input,select"))
      done =
        ix.zoom.cancel?.() ||
        ix.brush.cancel?.() ||
        ix.flip.escape?.() ||
        ix.select.escape?.() ||
        ix.brush.escape?.() ||
        ix.zoom.escape?.() ||
        ix.drill.escape?.();
    else if (k === "Enter") {
      const m = this.#tip?.active();
      done = !!(
        m &&
        (e.target as Element).closest(".maya-svg") &&
        // Enter selects, else drills; Shift+Enter drills, else selects.
        ((e as KeyboardEvent).shiftKey
          ? ix.drill.enter?.(m) || ix.expand.enter?.(m) || ix.select.enter?.(m)
          : ix.select.enter?.(m) || ix.drill.enter?.(m) || ix.expand.enter?.(m))
      );
    } else if (k === "+" || k === "=" || k === "-") {
      const { ctrlKey, metaKey, altKey } = e as KeyboardEvent;
      done =
        !(ctrlKey || metaKey || altKey) &&
        !!(e.target as Element).closest(".maya-svg") &&
        ix.zoom.step(k === "-" ? 2 : 0.5, this.#tip?.active());
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
    if (!raf && !this.#end) this.#sp = this.#arm();
    const run = () => {
      if (raf) this.#raf = false;
      else this.#q = false;
      this.#render(raf);
    };
    if (raf) ((this.#raf = true), requestAnimationFrame(run));
    else ((this.#q = true), queueMicrotask(run));
  }

  #render(fromRaf = false): void {
    if (!this.isConnected) return;
    const root = this.shadowRoot!;
    if (!this.spec) this.#readJson();
    const spec = this.spec;
    const box = root.querySelector(".maya-box")!;
    if (!spec) {
      // Still parsing: the JSON child may arrive later in this document.
      if (document.readyState === "loading") (this.#readJson(), this.#schedule(true));
      return;
    }
    // A resize frame queued before the first draw (the box going from 0 to its size) arrives
    // after it: the chart is already this size, so there is nothing to draw and no entrance to cut.
    if (
      fromRaf &&
      this.#drawn &&
      Math.abs(box.clientWidth - this.#size[0]!) <= 1 &&
      Math.abs(box.clientHeight - this.#size[1]!) <= 1
    ) {
      this.#resized = false;
      return;
    }
    // A resize frame must not cut the entrance short (bars snap, axes keep fading): wait it out,
    // the old svg scales through its viewBox meanwhile. A spec change renders from a microtask and animates.
    const wait = this.#intro + 1100 - performance.now(); // 760 ms + stagger, or the 1100 ms wipe
    if (fromRaf && this.#resized && wait > 0) {
      setTimeout(() => this.#schedule(true), wait);
      return;
    }
    if (spec !== this.#seen) {
      // Persistence rules live in the reducers (measure, drill, zoom, select).
      const ev: SpecEvent = { type: "spec", prev: this.#seen, next: spec };
      for (const r of [ctl, measure, flip, expand, drill, play, sort, zoom, brush, select])
        this.#state = (r.reduce as (s: State, e: SpecEvent) => State)(this.#state, ev);
      this.#seen = spec;
    }
    const draw = (s = spec) => {
      // Compact tile: CSS clamps the title to a line and hides the subtitle. Keyed on the host's own height, which they do not change.
      // ponytail: SSR (Declarative Shadow DOM) tiles show the full title until hydration sets this.
      this.toggleAttribute("data-compact", this.clientHeight < 200);
      this.#clamp(root);
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
    // A drill adds or removes the breadcrumb row, which shifts the plot: measure to glide it.
    const top0 = this.#fl ? box.getBoundingClientRect().top : NaN;
    this.#fl = false;
    let parts;
    try {
      if (!this.#drawn && !box.querySelector("svg"))
        try {
          // Title, controls and legend depend only on the spec and its series names: place them
          // first (one row per series stands for the data), measure once. No measuring here:
          // reading the box now would force a layout that is thrown away.
          const f = spec.series;
          // ponytail: series seen in the first 1000 rows; a later one costs the second draw below.
          const first = new Map<unknown, unknown>();
          if (f) for (const r of spec.data.slice(0, 1000)) first.has(r[f]) || first.set(r[f], r);
          const rows = [...first.values()] as typeof spec.data;
          this.#slots(root, renderParts({ ...spec, data: rows }, { width: 640, height: 320 }));
        } catch {} // the real draw reports the error
      parts = draw();
      // ponytail: a multi-series legend needs the data, so it still costs a second draw.
      // A title, legend or control that just appeared shrinks the box: fit it in this frame.
      const [w, h] = this.#size;
      if (this.#slots(root, parts) && (box.clientWidth !== w || box.clientHeight !== h))
        parts = draw();
    } catch (e) {
      this.#zoom = undefined; // a failed draw must not leave its drill zoom for the next update
      this.#tip?.hide();
      // The old table would describe data the box no longer shows; cancel a pending idle insert.
      this.#idle?.();
      this.#last["table"] = "";
      root.querySelector("table.maya-sr")?.remove();
      const d: MayaErrorDetail | null =
        e instanceof MayaSpecError ? { code: e.code, path: e.path, message: e.message } : null;
      // Cancelable: preventDefault() hides the box (the host shows its own error).
      if (d && !this.#emit("maya-error", d, true)) {
        box.replaceChildren();
        this.#drawn = false;
        return this.#settle(e as Error);
      }
      const pre = document.createElement("pre");
      pre.className = "maya-err"; // styled by theme.ts; never an inline style
      pre.textContent = e instanceof Error ? e.message : String(e);
      box.replaceChildren(pre);
      this.#drawn = false;
      if (pre.textContent !== this.#err) console.error(e);
      this.#err = pre.textContent;
      return this.#settle(e as Error);
    }
    this.#err = "";
    const maya = root.querySelector<HTMLElement>(".maya")!;
    // The table is hidden but costs its markup, style and layout (1000 scatter rows: ~10 ms), so
    // it is built and inserted when the browser is idle (2 s at most) and only the latest lands.
    // ponytail: a screen reader sees the table a moment after the marks.
    this.#idle?.(); // only the latest table is ever built; a stream never queues old ones
    const late = () => {
      if (this.#last["table"] === parts.table) return;
      this.#last["table"] = parts.table;
      root.querySelector("table.maya-sr")?.remove();
      box.insertAdjacentHTML("afterend", html(parts.table));
    };
    // Without requestIdleCallback (Safari) a timer well after the entrance.
    const ric = globalThis.requestIdleCallback as typeof requestIdleCallback | undefined;
    const h = ric ? ric(late, { timeout: 2000 }) : setTimeout(late, 1600);
    this.#idle = () => (ric ? cancelIdleCallback(h as number) : clearTimeout(h));
    // Overrides via CSSOM (never a style attribute).
    for (const [k, v] of parts.vars) maya.style.setProperty(k, v);
    for (const k of this.#vars)
      if (!parts.vars.some(([n]) => n === k)) maya.style.removeProperty(k);
    this.#vars = new Set(parts.vars.map(([k]) => k));
    // Nothing animates on resize: geometry must track the container immediately.
    const still = spec.animate === false || reduced();
    maya.toggleAttribute("data-still", spec.animate === false); // CSS transitions off too
    maya.setAttribute("data-legend", parts.legendAt ?? ""); // absent: top
    // A microtask render beside a pending resize frame is not the resize's own: it animates.
    const resized = this.#resized && fromRaf;
    if (fromRaf) this.#resized = false;
    // First draw plays an entrance, unless the chart arrived server-rendered (already on screen).
    const intro: Intro | undefined =
      this.#drawn || box.querySelector("svg") ? undefined : (INTRO[spec.type] ?? "marks");
    // A drill zoom moves marks under the pointer: no hover mark (its stroke would scale with the zoom) until it lands.
    if (this.#zoom) this.#tip?.hide();
    const face = this.#state.view.face ?? "front";
    const flipped = this.#drawn && face !== this.#face && spec.animate !== false;
    // Turned back before the swap: the card reverses out instead of snapping flat.
    this.#turn?.(face === this.#face);
    this.#turn = undefined;
    const go = (anim: boolean) =>
      patch(box, parts.svg, anim, {
        intro,
        zoom: this.#zoom,
        after: () => this.#tip?.refresh(),
        instant: resized,
        roll: spec.numberMotion === "roll",
      });
    // A new face shares no keys with the old one: turn the card instead of diffing.
    if (flipped && box.firstElementChild && !still) {
      this.#tip?.hide();
      this.#turn = turn(box, () => ((this.#face = face), go(false)));
    } else {
      this.#face = face;
      go((this.#drawn || !!intro) && !still);
    }
    // The hold starts once the zoom does: a slow patch must not eat into it.
    if (this.#zoom && !still) this.#tip?.hide(Number(ZOOM.duration));
    this.#zoom = undefined;
    const dy = top0 - box.getBoundingClientRect().top; // NaN: not measured
    if (dy && !still) box.animate?.([{ translate: `0 ${dy}px` }, { translate: "none" }], ZOOM);
    if (intro && !still) this.#intro = performance.now();
    this.#drawn = true;
    for (const h of Object.values(this.#ix ?? {})) h.painted?.(); // before restore: it makes axes focusable
    this.#restore(focus);
    this.#emit("maya-render", {});
    this.#settle(null, idle(root));
  }

  /** Slots in shell order; each is replaced only when its markup changed. True if any was. */
  /** Native tooltip with the full title, only while it is clamped. */
  #clamp(root: ShadowRoot): void {
    const t = root.querySelector(".maya-title");
    if (this.hasAttribute("data-compact")) t?.setAttribute("title", t.textContent!);
    else t?.removeAttribute("title");
  }

  #slots(root: ShadowRoot, parts: Parts): boolean {
    const box = root.querySelector(".maya-box")!;
    let changed = false;
    SLOTS.forEach(([k, sel], i) => {
      if (this.#last[k] === parts[k]) return;
      changed = true;
      this.#last[k] = parts[k] as string;
      if (k === "controls" && this.#mend(root, sel, parts[k])) return;
      root.querySelectorAll(sel).forEach((e) => e.remove());
      const next = SLOTS.slice(i + 1).map(([, s]) => root.querySelector(s));
      (next.find(Boolean) ?? box).insertAdjacentHTML("beforebegin", html(parts[k] as string));
      if (!i) this.#clamp(root);
    });
    return changed;
  }

  /** Same controls, new values: patch them in place, so a slider mid-drag keeps its focus and an open popover stays open. False: the shape changed, replace. */
  #mend(root: ShadowRoot, sel: string, markup: string): boolean {
    const old = [...root.querySelectorAll(sel)].filter((e) => !e.parentElement?.matches(sel));
    const t = document.createElement("template");
    t.innerHTML = html(markup);
    const wp = [...t.content.children];
    const shape = (e: Element): string => e.localName + "(" + [...e.children].map(shape) + ")";
    if (old.length !== wp.length || old.some((e, i) => shape(e) !== shape(wp[i]!))) return false;
    old.forEach((e, i) => (sync(e, wp[i]!), mend(e, wp[i]!)));
    // Attributes do not move a dirty control's value; a focused one is the user's.
    const on = root.activeElement;
    for (const e of old)
      for (const c of e.matches("input,select") ? [e] : e.querySelectorAll("input,select"))
        if (c !== on && !(c as HTMLInputElement).matches("[type=search]"))
          (c as HTMLInputElement).value =
            c.getAttribute("value") ??
            c.querySelector("option[selected]")?.getAttribute("value") ??
            "";
    return true;
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

/** Legend hover: custom properties on .maya dim the other series (theme.ts), no `:has(:hover)`. */
const legend = (e: Event) => {
  const b = (e.target as Element).closest(".maya-legend [data-s]"),
    on = e.type === "pointerover",
    s = (b?.closest(".maya") as HTMLElement | undefined)?.style;
  if (b?.getAttribute("aria-pressed") === "false") return; // hidden: nothing to highlight, dim nothing
  s?.setProperty("--d", on ? ".25" : "");
  s?.setProperty("--h" + b?.getAttribute("data-s"), on ? "1" : "");
};

const SLOTS: [keyof Parts, string][] = [
  ["title", ".maya-title,.maya-sub"],
  [
    "controls",
    ".maya-ctls,.maya-ctl,.maya-play,.maya-flip,.maya-filter,.maya-frame,.maya-params,.maya-params-btn,.maya-frame-value",
  ],
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
  ["axis", "[data-maya=axis]"],
  ["legend", "[data-maya=legend] button"],
  ["measure", ".maya-ctl [role=radio]"],
  ["flip", ".maya-flip"],
  ["crumb", ".maya-crumbs :is(button,a)"],
  ["filter", ".maya-filter"],
  ["reset", ".maya-reset"],
  ["param", "[data-maya=param],[data-maya=params-reset],[data-maya=frame]"],
  ["play", ".maya-play"],
];
