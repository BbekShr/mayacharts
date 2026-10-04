import { t as str } from "../core/strings.ts";
import type { ChartSpec } from "../core/types.ts";

const a = (e: Element, k: string) => e.getAttribute(k) ?? "";
const h = (t: string, txt = "", at: Record<string, string> = {}) => {
  const e = document.createElement(t);
  e.textContent = txt;
  for (const k in at) e.setAttribute(k, at[k]!);
  return e;
};
// Links (sankey flows, chord ribbons) carry the same payload as marks.
const SEL = "[data-maya=hit],[data-maya=mark],[data-maya=link][data-key]";
const FADE = 120;

export interface Tooltip {
  off(): void;
  hide(): void;
  /** The mark the tooltip is showing (hover, tap or keyboard). */
  active(): Element | undefined;
  /** Rebuild the key index after a patch and re-show the active mark if it survived. */
  refresh(): void;
}

export function tooltip(
  root: ShadowRoot,
  on: () => boolean,
  announce: (text: string) => void = () => {},
  spec: () => ChartSpec | undefined = () => undefined,
): Tooltip {
  const q = (s: string) => root.querySelector<HTMLElement>(s)!;
  const box = q(".maya-box"),
    tip = q(".maya-tip"),
    probe = q(".maya-probe"),
    host = root.host;
  const anchored = !!globalThis.CSS?.supports?.("anchor-name: --x");
  // Hit-testing: closest() + these maps, rebuilt once per patch (never querySelectorAll per move).
  let list: Element[] = [],
    byKey = new Map<string, Element>(),
    byC = new Map<string, Element[]>();
  let cur: Element | undefined,
    open = false,
    pin = false,
    kb = false,
    timer: ReturnType<typeof setTimeout> | undefined,
    down0: [number, number] | undefined;

  const index = () => {
    list = [...box.querySelectorAll("[data-maya=mark][data-key]")];
    byKey = new Map();
    byC = new Map();
    for (const m of list) {
      byKey.set(a(m, "data-key"), m);
      if (!m.hasAttribute("data-c")) continue;
      const c = a(m, "data-c");
      byC.set(c, [...(byC.get(c) ?? []), m]);
    }
  };
  const group = (m: Element) =>
    (a(m, "data-maya") !== "link" && m.hasAttribute("data-c") && byC.get(a(m, "data-c"))) || [m];
  // Lines that belong to one category (parallel coordinates) light up with it.
  let lit: Element[] = [];
  const light = (m: Element | undefined) => {
    for (const l of lit) l.removeAttribute("data-active");
    lit = m?.hasAttribute("data-c")
      ? [...box.querySelectorAll(`[data-maya=line][data-c="${CSS.escape(a(m, "data-c"))}"]`)]
      : [];
    for (const l of lit) l.setAttribute("data-active", "");
  };

  const cross = (m: Element | undefined) => {
    const g = box.querySelector<SVGElement>("[data-maya=cross]");
    if (!g || (!m && g.style.opacity !== "1")) return; // hidden by CSS until first shown
    g.style.opacity = m ? "1" : "0";
    const svg = g.ownerSVGElement ?? box.querySelector("svg");
    if (!m || !svg) return;
    const r = m.getBoundingClientRect(),
      s = svg.getBoundingClientRect();
    const vw = +(a(svg, "viewBox").split(" ")[2] || s.width) || 1;
    g.style.transform = `translateX(${((r.left + r.width / 2 - s.left) * vw) / (s.width || vw)}px)`;
  };

  const hide = () => {
    cur?.removeAttribute("data-active");
    light(undefined);
    cur = undefined;
    pin = false;
    cross(undefined);
    tip.classList.remove("maya-open");
    if (open) {
      open = false;
      clearTimeout(timer);
      timer = setTimeout(() => open || tip.hidePopover(), FADE);
    }
  };

  const markOf = (t: EventTarget | null | undefined, ev?: Event) => {
    const e = (t as Element | null)?.closest?.(SEL);
    if (!e || a(e, "data-maya") !== "hit") return e ?? undefined;
    if (e.hasAttribute("data-key")) return byKey.get(a(e, "data-key"));
    // Keyless band hit: the mark in this category nearest the pointer.
    const y = (ev as PointerEvent | undefined)?.clientY ?? 0;
    let best: Element | undefined,
      bd = Infinity;
    for (const m of byC.get(a(e, "data-c")) ?? []) {
      const r = m.getBoundingClientRect(),
        d = Math.abs(y - (r.top + r.height / 2));
      if (d < bd) ((bd = d), (best = m));
    }
    return best;
  };

  /** Plain-text row for one mark: also what the live region reads. */
  const tone = (k: Element) => {
    const v = a(k, "data-tone"),
      s = spec();
    if (!v) return "";
    const tgt = typeof s?.colorBy === "object";
    return str(s ?? {}, v === "good" ? (tgt ? "above" : "positive") : tgt ? "below" : "negative");
  };

  const show = (m: Element, say = false) => {
    cur?.removeAttribute("data-active");
    cur = m;
    m.setAttribute("data-active", "");
    light(m);
    const g = group(m);
    tip.replaceChildren(
      h("b", a(m, "data-x")),
      ...g.map((k) => {
        const row = h("div", "", k === m ? { "data-on": "" } : {});
        const s = a(k, "data-series");
        if (s) {
          if (k.hasAttribute("data-s")) row.append(h("i", "", { "data-s": a(k, "data-s") }));
          row.append(h("span", s));
        }
        row.append(h("span", a(k, "data-f")));
        const tn = tone(k);
        if (tn) row.append(h("span", tn));
        return row;
      }),
    );
    cross(m);
    // The probe's containing block is the host's padding box (:host is position:relative).
    const r = m.getBoundingClientRect(),
      p = host.getBoundingClientRect();
    Object.assign(probe.style, {
      left: r.left - p.left - host.clientLeft + "px",
      top: r.top - p.top - host.clientTop + "px",
      width: r.width + "px",
      height: r.height + "px",
    });
    clearTimeout(timer);
    if (!open) (tip.showPopover(), (open = true));
    tip.classList.add("maya-open");
    if (!anchored) {
      const t = tip.getBoundingClientRect(),
        w = globalThis.visualViewport?.width ?? innerWidth;
      let y = r.top - t.height - 8;
      if (y < 8) y = r.bottom + 8;
      const x = Math.min(Math.max(r.left + r.width / 2 - t.width / 2, 8), w - t.width - 8);
      Object.assign(tip.style, { position: "fixed", left: x + "px", top: y + "px" });
    }
    if (say)
      announce(
        `${a(m, "data-x")}: ${g.map((k) => [a(k, "data-series"), a(k, "data-f"), tone(k)].filter(Boolean).join(" ")).join(", ")}`,
      );
  };

  const move = (e: Event) => {
    kb = false;
    if (!on() || (e as PointerEvent).pointerType !== "mouse") return;
    const m = markOf(e.target, e);
    if (!m) hide();
    else if (m !== cur) show(m);
  };
  // Touch/pen: remember where it started; a tap (moved < 4 px) shows on pointerup.
  const down = (e: Event) => {
    kb = false;
    const p = e as PointerEvent;
    down0 = p.pointerType === "mouse" ? undefined : [p.clientX, p.clientY];
  };
  const up = (e: Event) => {
    const p = e as PointerEvent;
    const d = down0;
    down0 = undefined;
    if (!on() || !d || Math.hypot(p.clientX - d[0], p.clientY - d[1]) >= 4) return;
    const m = markOf(e.target, e);
    if (m) show(m);
  };
  const outside = (e: Event) => {
    const p = e.composedPath();
    if (!p.includes(box) || !markOf(p[0], e)) hide();
  };
  const leave = (e: Event) => (e as PointerEvent).pointerType === "mouse" && hide();
  const key = (e: Event) => {
    const k = (e as KeyboardEvent).key;
    if (!on()) return;
    kb = true;
    if (k === "Escape") {
      // Pinned tooltip is Escape's first priority: consume the key so nothing else reacts.
      if (pin) e.preventDefault();
      return hide();
    }
    let next: Element | undefined;
    if (k === " ") {
      next = cur ?? list[0];
      if (!next) return;
      pin = !pin;
      if (pin) show(next, true);
    } else if (k.startsWith("Arrow")) {
      const d = k === "ArrowRight" || k === "ArrowDown" ? 1 : -1;
      const i = cur ? list.indexOf(cur) : -1;
      if (i < 0) next = list[0];
      else if (k === "ArrowUp" || k === "ArrowDown") {
        const g = group(list[i]!);
        next = g[g.indexOf(list[i]!) + d];
      } else {
        const cs = [...byC.keys()];
        const g = byC.get(cs[cs.indexOf(a(list[i]!, "data-c")) + d]!);
        next = g?.find((m) => a(m, "data-s") === a(list[i]!, "data-s")) ?? g?.[0];
      }
      if (next) show(next, true);
    } else return;
    e.preventDefault();
  };
  const blur = () => pin || hide();

  const on_: [EventTarget, string, EventListener, AddEventListenerOptions?][] = [
    [box, "pointerover", move],
    [box, "pointermove", move],
    [box, "pointerdown", down],
    [box, "pointerup", up],
    [box, "pointerleave", leave],
    [box, "keydown", key],
    [box, "focusout", blur],
    [document, "pointerdown", outside, { capture: true }],
    // Focusing the chart can scroll it into view; that must not close a keyboard tooltip.
    [window, "scroll", () => kb || hide(), { capture: true, passive: true }],
  ];
  for (const [t, n, f, o] of on_) t.addEventListener(n, f, o);
  index();
  return {
    off: () => (
      hide(),
      clearTimeout(timer),
      on_.forEach(([t, n, f, o]) => t.removeEventListener(n, f, o))
    ),
    hide,
    active: () => cur,
    refresh() {
      const k = cur && a(cur, "data-key");
      index();
      const m = k ? byKey.get(k) : undefined;
      if (m && on()) show(m);
      else hide();
    },
  };
}
