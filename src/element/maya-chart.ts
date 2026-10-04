import { renderParts, shellInner } from "../core/render.ts";
import type { ChartSpec } from "../core/types.ts";
import { css } from "../styles/theme.ts";
import { patch } from "./animate.ts";
import { tooltip } from "./tooltip.ts";

let sheet: CSSStyleSheet | undefined;

export class MayaChart extends HTMLElement {
  static observedAttributes = ["spec"];
  #prop: ChartSpec | undefined;
  #json: ChartSpec | undefined;
  #attr: ChartSpec | undefined;
  #hidden = new Set<string>();
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
  set spec(v: ChartSpec | undefined) {
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
      root.innerHTML = shellInner({ svg: "", legend: "", table: "", title: "", style: "" }, "");
    }
    root.addEventListener("click", this.#click);
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
  }

  #click = (e: Event) => {
    const b = (e.target as Element).closest("[data-maya=legend] button");
    if (!b) return;
    const k = b.textContent ?? "";
    if (this.#hidden.has(k)) this.#hidden.delete(k);
    else if (this.shadowRoot!.querySelectorAll("[data-maya=legend] [aria-pressed=true]").length > 1)
      this.#hidden.add(k);
    else return;
    this.#schedule();
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
    const width = box.clientWidth || 640,
      height = box.clientHeight || 320;
    this.#size = [box.clientWidth, box.clientHeight];
    let parts;
    try {
      parts = renderParts(spec, { width, height, hidden: [...this.#hidden] });
    } catch (e) {
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
      const html = parts[k];
      if (this.#last[k] === html) return;
      this.#last[k] = html;
      const old = root.querySelector(sel);
      const i =
        k === "legend"
          ? [...root.querySelectorAll("[data-maya=legend] button")].indexOf(
              (root.activeElement ?? box) as Element,
            )
          : -1;
      old?.remove();
      (ref ?? box).insertAdjacentHTML(where, html);
      if (i >= 0) root.querySelectorAll<HTMLElement>("[data-maya=legend] button")[i]?.focus();
    };
    put("legend", "[data-maya=legend]", null, "beforebegin");
    put("title", ".maya-title", root.querySelector("[data-maya=legend]"), "beforebegin");
    put("table", ".maya-sr", null, "afterend");
    if (this.#last["style"] !== parts.style) {
      this.#last["style"] = parts.style;
      if (parts.style) maya.setAttribute("style", parts.style);
      else maya.removeAttribute("style");
    }
    const still = spec.animate === false || matchMedia("(prefers-reduced-motion: reduce)").matches;
    patch(box, parts.svg, this.#drawn && !still);
    this.#drawn = true;
  }
}
