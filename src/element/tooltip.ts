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
const NEAR = 12;
const FIXED = ["position", "position-area", "left", "top", "margin"];
const GLIDE: KeyframeAnimationOptions = { duration: 200, easing: "cubic-bezier(.22,1,.36,1)" };
const still = () => matchMedia?.("(prefers-reduced-motion: reduce)").matches;

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
    clamped = false,
    kb = false,
    timer: ReturnType<typeof setTimeout> | undefined,
    down0: [number, number] | undefined,
    flip: Animation | undefined,
    band: SVGRectElement | undefined;

  let dirty = true,
    cxy: number[] | undefined;
  const index = () => {
    if (!dirty) return;
    dirty = false;
    cxy = undefined;
    list = [...box.querySelectorAll("[data-maya=mark][data-key]")];
    byKey = new Map();
    byC = new Map();
    for (const m of list) {
      byKey.set(a(m, "data-key"), m);
      if (!m.hasAttribute("data-c")) continue;
      const c = a(m, "data-c");
      const g = byC.get(c);
      if (g) g.push(m);
      else byC.set(c, [m]);
    }
  };
  const group = (m: Element) =>
    (a(m, "data-maya") !== "link" && m.hasAttribute("data-c") && byC.get(a(m, "data-c"))) || [m];
  // Lines that belong to one category (parallel coordinates) light up with it.
  // The hovered mark's category stays lit (its tooltip rows) while the rest dims.
  let lit: Element[] = [],
    peers: Element[] = [];
  const light = (m: Element | undefined) => {
    for (const l of lit) l.removeAttribute("data-active");
    for (const l of peers) l.removeAttribute("data-lit");
    lit = m?.hasAttribute("data-c")
      ? [
          ...box.querySelectorAll(
            `[data-maya=line][data-key][data-c="${CSS.escape(a(m, "data-c"))}"]`,
          ),
        ]
      : [];
    peers = m ? [...group(m)] : [];
    // Hierarchy keys (h~a~b) light their ancestors, so the hovered path reads root to leaf.
    const k = m ? a(m, "data-key") : "";
    if (k.startsWith("h~"))
      for (const [p, e] of byKey) if (k.startsWith(p + "~") && p !== "h") peers.push(e);
    for (const l of lit) l.setAttribute("data-active", "");
    for (const l of peers) l.setAttribute("data-lit", "");
  };

  const cross = (m: Element | undefined) => {
    const g = box.querySelector<SVGElement>("[data-maya=cross]");
    if (!g || (!m && g.style.opacity !== "1")) return; // hidden by CSS until first shown
    const was = g.style.opacity === "1";
    g.style.opacity = m ? "1" : "0";
    const svg = g.ownerSVGElement ?? box.querySelector("svg");
    if (!m || !svg) return g.removeAttribute("data-on");
    const r = m.getBoundingClientRect(),
      s = svg.getBoundingClientRect();
    const vw = +(a(svg, "viewBox").split(" ")[2] || s.width) || 1;
    const k = vw / (s.width || vw),
      px = (r.left + r.width / 2 - s.left) * k,
      py = (r.top + r.height / 2 - s.top) * k,
      tx = g.querySelectorAll("text");
    g.style.transform = tx.length ? `translate(${px}px,${py}px)` : `translateX(${px}px)`;
    // Scatter guides: the lines and value pills cancel one axis of the move (see wip-scatter css).
    if (tx.length) {
      g.style.setProperty("--x", px + "px");
      g.style.setProperty("--y", py + "px");
      tx[0]!.textContent = a(m, "data-gx") || a(m, "data-x");
      tx[1]!.textContent = a(m, "data-gy") || a(m, "data-f");
    }
    // Glide between categories once visible; the first placement jumps (flush, then enable).
    if (!was) getComputedStyle(g).transform;
    g.setAttribute("data-on", "");
  };

  /** Bar charts: a soft column behind the hovered category, gliding between categories. */
  const shade = (m: Element | undefined) => {
    const svg = box.querySelector("svg");
    const t = spec()?.type;
    if (!m || !svg || m.localName !== "rect" || (t !== "bar" && t !== "waterfall")) {
      band?.removeAttribute("data-on");
      return;
    }
    const [px, py, pw, ph] = a(svg, "data-plot").split(" ").map(Number) as number[];
    const hz = svg.hasAttribute("data-dir");
    let lo = Infinity,
      hi = -Infinity;
    for (const k of group(m)) {
      const p = +a(k, hz ? "y" : "x"),
        q = p + +a(k, hz ? "height" : "width");
      ((lo = Math.min(lo, p)), (hi = Math.max(hi, q)));
    }
    // Time axis: bars are not evenly spaced; the column is the group's own span plus its 10% pads.
    const step = svg.hasAttribute("data-t")
      ? (hi - lo) / 0.8
      : (hz ? ph! : pw!) / Math.max(1, +a(svg, "data-n") || 1);
    const c = (lo + hi) / 2 - step / 2;
    const fresh = !band?.isConnected;
    if (fresh) {
      band = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      band.setAttribute("data-maya", "band");
      svg.querySelector(":scope > [data-maya=marks]")?.before(band);
    }
    const b = band!;
    for (const [k, v] of Object.entries(
      hz ? { x: px, y: 0, width: pw, height: step } : { x: 0, y: py, width: step, height: ph },
    ))
      b.setAttribute(k, String(v));
    b.style.transform = hz ? `translateY(${c}px)` : `translateX(${c}px)`;
    if (!b.hasAttribute("data-on")) getComputedStyle(b).transform;
    b.setAttribute("data-on", "");
  };

  const hide = () => {
    cur?.removeAttribute("data-active");
    light(undefined);
    cur = undefined;
    pin = false;
    cross(undefined);
    shade(undefined);
    tip.classList.remove("maya-open");
    if (open) {
      open = false;
      clearTimeout(timer);
      timer = setTimeout(() => open || tip.hidePopover(), FADE);
    }
  };

  /** Scatter and beeswarm draw no hit shapes: the mark whose centre is within NEAR px of the pointer. */
  const nearest = (ev?: Event) => {
    const svg = box.querySelector("svg"),
      p = ev as PointerEvent | undefined;
    if (!/^(scatter|beeswarm)$/.test(spec()?.type ?? "") || !svg || p?.clientX === undefined)
      return;
    index();
    cxy ??= list.flatMap((m) => ["cx", "cy"].map((k) => +(m.getAttribute(k) ?? "x")));
    // Client px to viewBox units (the svg may be scaled by CSS).
    const s = svg.getBoundingClientRect(),
      [, , vw, vh] = a(svg, "viewBox").split(" ").map(Number) as number[],
      kx = (vw || s.width) / (s.width || 1),
      ky = (vh || s.height) / (s.height || 1),
      px = (p.clientX - s.left) * kx,
      py = (p.clientY - s.top) * ky;
    let best = -1,
      bd = (NEAR * kx) ** 2;
    for (let i = 0; i < cxy.length; i += 2) {
      const d = (cxy[i]! - px) ** 2 + ((cxy[i + 1]! - py) * (kx / ky)) ** 2;
      if (d < bd) ((bd = d), (best = i));
    }
    return list[best / 2];
  };

  const markOf = (t: EventTarget | null | undefined, ev?: Event) => {
    const e = (t as Element | null)?.closest?.(SEL);
    if (!e) return nearest(ev);
    index();
    if (a(e, "data-maya") !== "hit") return e;
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
    index();
    // Glide: remember where the tooltip is now (mid-glide included) before it moves.
    const from = open ? tip.getBoundingClientRect() : undefined;
    flip?.cancel();
    cur?.removeAttribute("data-active");
    cur = m;
    m.setAttribute("data-active", "");
    light(m);
    const g = group(m);
    // Rows without a series name the measure ("Sales  1.2M"); scatter values carry their own.
    const sp = spec(),
      y = sp?.y,
      label =
        typeof y === "string" && sp?.type !== "scatter"
          ? sp?.titles && Object.hasOwn(sp.titles, y)
            ? sp.titles[y]!
            : y
          : "";
    tip.replaceChildren(
      h("b", a(m, "data-x")),
      ...g.map((k) => {
        const row = h("div", "", k === m ? { "data-on": "" } : {});
        const s = a(k, "data-series");
        if (s) {
          if (k.hasAttribute("data-s")) row.append(h("i", "", { "data-s": a(k, "data-s") }));
          row.append(h("span", s));
        } else if (label) row.append(h("span", label));
        row.append(h("span", a(k, "data-f"), { "data-v": "" }));
        const tn = tone(k);
        if (tn) row.append(h("span", tn));
        return row;
      }),
    );
    cross(m);
    shade(m);
    // The probe's containing block is the host's padding box (:host is position:relative).
    // Charts with a crosshair anchor to it: the tooltip sits beside the line, never over the points.
    const svg = box.querySelector("svg"),
      side = !!svg?.querySelector("[data-maya=cross] :not(text,[data-g])");
    let r: {
      left: number;
      top: number;
      width: number;
      height: number;
      right: number;
      bottom: number;
    } = m.getBoundingClientRect();
    if (side && svg) {
      const s = svg.getBoundingClientRect(),
        k = s.width / (+a(svg, "viewBox").split(" ")[2]! || s.width || 1),
        [, py, , ph] = a(svg, "data-plot").split(" ").map(Number) as number[],
        left = r.left + r.width / 2,
        top = s.top + py! * k;
      r = { left, top, width: 0, height: ph! * k, right: left, bottom: top + ph! * k };
    }
    tip.toggleAttribute("data-side", side);
    const p = host.getBoundingClientRect();
    Object.assign(probe.style, {
      left: r.left - p.left - host.clientLeft + "px",
      top: r.top - p.top - host.clientTop + "px",
      width: r.width + "px",
      height: r.height + "px",
    });
    clearTimeout(timer);
    if (!open) (tip.showPopover(), (open = true));
    tip.classList.add("maya-open");
    // Anchored placement can overflow a tile-sized viewport: measure, then clamp with fixed.
    const vv = globalThis.visualViewport,
      vw = vv?.width ?? innerWidth,
      vh = vv?.height ?? innerHeight;
    if (clamped) for (const k of FIXED) tip.style.removeProperty(k);
    clamped = false;
    let t = tip.getBoundingClientRect();
    if (!anchored || t.left < 0 || t.top < 0 || t.right > vw || t.bottom > vh) {
      // Leave the anchor (position-area would resolve insets against the anchor area).
      for (const k of ["left", "top", "margin"]) tip.style.setProperty(k, "0px");
      tip.style.setProperty("position", "fixed");
      tip.style.setProperty("position-area", "none");
      t = tip.getBoundingClientRect();
      let y = side ? r.top : r.top - t.height - 8;
      if (y < 8) y = r.bottom + 8;
      y = Math.max(8, Math.min(y, vh - t.height - 8));
      let x = side ? r.left + 12 : r.left + r.width / 2 - t.width / 2;
      if (side && x + t.width > vw - 8) x = r.left - 12 - t.width;
      x = Math.max(8, Math.min(x, vw - t.width - 8));
      tip.style.setProperty("left", x + "px");
      tip.style.setProperty("top", y + "px");
      clamped = true;
    }
    if (from && !still() && spec()?.animate !== false) {
      const to = tip.getBoundingClientRect();
      const dx = from.left - to.left,
        dy = from.top - to.top;
      if (dx || dy)
        flip = tip.animate?.(
          [{ transform: `translate(${dx}px,${dy}px)` }, { transform: "none" }],
          GLIDE,
        );
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
    index();
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
      dirty = true;
      if (!cur) return hide(); // rebuilt on the first pointer or key
      index();
      const m = k ? byKey.get(k) : undefined;
      if (m && on()) show(m);
      else hide();
    },
  };
}
