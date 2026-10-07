import { formatter } from "../core/format.ts";
import { t as str } from "../core/strings.ts";
import { resolve } from "../core/validate.ts";
import type { ChartSpec, View } from "../core/types.ts";
import { listen } from "./listen.ts";

const a = (e: Element, k: string) => e.getAttribute(k) ?? "";
const h = (t: string, txt = "", at: Record<string, string> = {}) => {
  const e = document.createElement(t);
  e.textContent = txt;
  for (const k in at) e.setAttribute(k, at[k]!);
  return e;
};
// Links (sankey flows, chord ribbons) carry the same payload as marks.
const SEL = "[data-maya=hit],[data-maya=mark],[data-maya=link][data-f]";
const FADE = 120;
const NEAR = 12;
const FIXED = ["position", "position-area", "left", "top", "margin"];
const GLIDE: KeyframeAnimationOptions = { duration: 200, easing: "cubic-bezier(.22,1,.36,1)" };
/** viewBox units per client px (the svg may be scaled by CSS). */
const unit = (svg: Element, s: DOMRect) => {
  const w = +(a(svg, "viewBox").split(" ")[2] || s.width) || 1;
  return w / (s.width || w);
};
const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export interface Tooltip {
  off(): void;
  hide(): void;
  /** The mark the tooltip is showing (hover, tap or keyboard). */
  active(): Element | undefined;
  /** The mark a pointer event stands for: the mark, a hit's mark, or the nearest point. */
  pick(e: Event): Element | undefined;
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
      // Push, not spread: a group of 1500 dots would copy the array per dot.
      (byC.get(c) ?? byC.set(c, []).get(c)!).push(m);
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
    // Box plot: whiskers, median and outliers share the box's key tail (b~SERIES~CATEGORY, ws~..., d~...~ROW), so they light with it and the tooltip clears them.
    if (m && spec()?.type === "boxplot")
      peers.push(...box.querySelectorAll(`[data-key*="${k.slice(1)}"]`));
    // Flows: a node lights every link and node on a path through it (their data-a lists it).
    if (m?.hasAttribute("data-n"))
      peers.push(...box.querySelectorAll(`[data-a~="${a(m, "data-n")}"]`));
    for (const l of lit) l.setAttribute("data-active", "");
    for (const l of peers) l.setAttribute("data-lit", "");
  };

  // In-bar labels of dimmed marks take the page ink: the bar fades toward the page, the label must not.
  const dim = (m?: Element) => {
    const on = (m ? [m, ...peers] : [])
      .filter((e) => /^(rect|path)$/.test(e.localName) && !e.hasAttribute("data-q"))
      .map((e): number[] => {
        if (e.localName === "path") {
          const b = (e as SVGGraphicsElement).getBBox();
          return [b.x, b.y, b.width, b.height];
        }
        return ["x", "y", "width", "height"].map((k) => +a(e, k));
      });
    for (const t of box.querySelectorAll("[data-maya=labels] [data-in]")) {
      const [x, y] = [+a(t, "x"), +a(t, "y")];
      t.toggleAttribute(
        "data-dim",
        !!on.length &&
          !on.some((r) => r[0]! <= x && x <= r[0]! + r[2]! && r[1]! <= y && y <= r[1]! + r[3]!),
      );
    }
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
    const k = unit(svg, s),
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
      // Corner: the y pill hops over the x pill when both sit in the bottom-left.
      const [pl, pt, , ph] = a(svg, "data-plot").split(" ").map(Number) as number[];
      tx[1]!.setAttribute("y", py > pt! + ph! - 16 && px < pl! + 120 ? "-22" : "-6");
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
      if (k.localName !== "rect") continue; // a y2 line's points share the group
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
    cur?.closest("[data-maya=marks]")?.removeAttribute("data-hot");
    light(undefined);
    dim();
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

  /**
   * Scatter and beeswarm draw no hit shapes: the mark whose centre is within NEAR px of the
   * pointer. Line and area draw one plot-wide hit (`band`): the point at the category nearest
   * the pointer's x, then nearest its y.
   */
  const nearest = (ev?: Event, band = false) => {
    const svg = box.querySelector("svg"),
      p = ev as PointerEvent | undefined;
    if (
      (!band && !/^(scatter|beeswarm|units|constellation)$/.test(spec()?.type ?? "")) ||
      !svg ||
      p?.clientX === undefined
    )
      return;
    index();
    cxy ??= list.flatMap((m) => ["cx", "cy"].map((k) => +(m.getAttribute(k) ?? "x")));
    const s = svg.getBoundingClientRect(),
      k = unit(svg, s),
      px = (p.clientX - s.left) * k,
      py = (p.clientY - s.top) * k;
    let best = -1,
      bx = Infinity,
      bd = band ? Infinity : (NEAR * k) ** 2;
    for (let i = 0; i < cxy.length; i += 2) {
      const dx = Math.abs(cxy[i]! - px),
        dy = Math.abs(cxy[i + 1]! - py),
        d = band ? dy : dx * dx + dy * dy;
      if (band ? dx < bx || (dx === bx && d < bd) : d < bd) ((bx = dx), (bd = d), (best = i));
    }
    return list[best / 2];
  };

  const markOf = (t: EventTarget | null | undefined, ev?: Event) => {
    const e = (t as Element | null)?.closest?.(SEL);
    if (!e) return nearest(ev);
    index();
    if (a(e, "data-maya") !== "hit") return e;
    if (e.hasAttribute("data-key")) return byKey.get(a(e, "data-key"));
    if (!e.hasAttribute("data-c")) return nearest(ev, true);
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
    if (!v || v == "zero") return "";
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
    // One flag on the marks group stands for "something is active": the dim rules key on it,
    // not on :has([data-active]), which restyles every mark each time the active one moves.
    m.closest("[data-maya=marks]")?.setAttribute(
      "data-hot",
      a(m, "data-depth") === "0" ? "r" : m.localName === "path" || lit.length ? "p" : "",
    );
    dim(m);
    const g = group(m);
    const speak = () =>
      announce(
        `${a(m, "data-x")}: ${g.map((k) => [a(k, "data-series"), a(k, "data-f"), tone(k)].filter(Boolean).join(" ")).join(", ")}`,
      );
    // tooltip:false: keys and the live region still work, the popover and guides do not.
    if (!on()) return say && speak();
    // Rows without a series name the measure ("Sales  1.2M"); scatter values carry their own.
    const sp = spec(),
      ys = sp?.y,
      y = Array.isArray(ys) ? ys[(host as { view?: View }).view?.measure ?? 0] : ys,
      label =
        typeof y === "string" && sp?.type !== "scatter"
          ? sp?.titles && Object.hasOwn(sp.titles, y)
            ? sp.titles[y]!
            : y
          : "";
    // Stacked: rows top-down like the stack, then the total.
    const stk = sp?.stack && /^(bar|area)$/.test(sp.type) && g.length > 1;
    const all = stk ? [...g].reverse() : g;
    // ponytail: 12 rows at most (a tooltip must fit the viewport), from 6 before the hovered row; "+N" counts the rest.
    const rows = all.slice(Math.max(0, all.indexOf(m) - 6)).slice(0, 12);
    tip.replaceChildren(
      h("b", a(m, "data-x")),
      ...rows.flatMap((k) => {
        const row = h("div", "", k === m ? { "data-on": "" } : {});
        const s = a(k, "data-series");
        // Scatter names its fields: "label\tvalue" lines, one row each under the series row.
        const f = a(k, "data-f");
        const tab = f.includes("\t");
        if (s) {
          if (k.hasAttribute("data-s")) row.append(h("i", "", { "data-s": a(k, "data-s") }));
          row.append(h("span", s));
        } else if (label && !tab) row.append(h("span", label));
        if (!tab) row.append(h("span", f, { "data-v": "" }));
        const tn = tone(k);
        if (tn) row.append(h("span", tn));
        const more = tab
          ? f.split("\n").map((p) => {
              const [l, v] = p.split("\t"),
                d = h("div");
              d.append(h("span", l), h("span", v, { "data-v": "" }));
              return d;
            })
          : [];
        return row.childElementCount ? [row, ...more] : more;
      }),
      ...(all.length > rows.length ? [h("div", `+${all.length - rows.length}`)] : []),
      ...(stk && sp ? [h("div", "", { "data-t": "" })] : []),
    );
    if (stk && sp)
      tip.lastElementChild!.append(
        h("span", str(sp, "total")),
        h(
          "span",
          formatter(
            resolve(sp, (host as { view?: View }).view),
            typeof y === "string" ? y : (sp.y as string),
          )(g.reduce((t, k) => t + +a(k, "data-y"), 0)),
          { "data-v": "" },
        ),
      );
    cross(m);
    shade(m);
    // The probe's containing block is the host's padding box (:host is position:relative).
    // Charts with a crosshair anchor to it: the tooltip sits beside the line, never over the points.
    const svg = box.querySelector("svg"),
      // Weave: beside the hovered column like a crosshair, so it stays inside the chart.
      side = sp?.type === "weave" || !!svg?.querySelector("[data-maya=cross] :not(text,[data-g])");
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
        k = 1 / unit(svg, s),
        [, py, , ph] = a(svg, "data-plot").split(" ").map(Number) as number[],
        left = r.left + r.width / 2,
        top = s.top + py! * k;
      const h = ph! * k;
      r = { left, top, width: 0, height: h, right: left, bottom: top + h };
    }
    // Orbit (the name) and constellation (the web): anchor to the mark and what it lights, so the tooltip clears them.
    if (/^(orbit|constellation|boxplot)$/.test(sp?.type ?? ""))
      for (const e of peers) {
        const b = e.getBoundingClientRect();
        const [left, top] = [Math.min(r.left, b.left), Math.min(r.top, b.top)];
        const [right, bottom] = [Math.max(r.right, b.right), Math.max(r.bottom, b.bottom)];
        r = { left, top, right, bottom, width: right - left, height: bottom - top };
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
    // The tooltip stays over its own chart on each axis where it fits, so it never covers a
    // neighbour; else the viewport bounds it.
    let [lo, hi] = [Math.max(8, p.left), Math.min(vw - 8, p.right)];
    if (hi - lo < t.width) [lo, hi] = [8, vw - 8];
    let [top, bot] = [Math.max(8, p.top), Math.min(vh - 8, p.bottom)];
    if (bot - top < t.height) [top, bot] = [8, vh - 8];
    if (!anchored || t.left < lo || t.top < top || t.right > hi || t.bottom > bot) {
      // Leave the anchor (position-area would resolve insets against the anchor area).
      for (const k of ["left", "top", "margin"]) tip.style.setProperty(k, "0px");
      tip.style.setProperty("position", "fixed");
      tip.style.setProperty("position-area", "none");
      t = tip.getBoundingClientRect();
      let y = side ? r.top : r.top - t.height - 8;
      if (y < top) y = r.bottom + 8;
      y = Math.max(top, Math.min(y, bot - t.height));
      let x = side ? r.left + 12 : r.left + r.width / 2 - t.width / 2;
      if (side && x + t.width > hi) x = r.left - 12 - t.width;
      x = Math.max(lo, Math.min(x, hi - t.width));
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
    if (say) speak();
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
  let ring: Element[] = [];
  const ang = (e: Element) => Math.atan2(+a(e, "cx"), -a(e, "cy"));
  const key = (e: Event) => {
    const k = (e as KeyboardEvent).key;
    kb = true;
    index();
    if (k === "Escape") {
      // Pinned tooltip is Escape's first priority: consume the key so nothing else reacts.
      if (pin) e.preventDefault();
      return hide();
    }
    let next: Element | undefined;
    if (k === " " && on()) {
      next = cur ?? list[0];
      if (!next) return;
      pin = !pin;
      if (pin) show(next, true);
    } else if (k.startsWith("Arrow")) {
      const d = k === "ArrowRight" || k === "ArrowDown" ? 1 : -1;
      const i = cur ? list.indexOf(cur) : -1;
      const ty = spec()?.type;
      const v = k === "ArrowUp" || k === "ArrowDown";
      // Orbit: clockwise by angle (rank order is golden-angle scattered). Constellation up/down:
      // the star, then the 3 stars it lights.
      if (i >= 0 && ty === "constellation" && v && !ring.includes(cur!))
        ring = [cur!, ...box.querySelectorAll(`[data-a~="${a(cur!, "data-n")}"]`)];
      const c =
        ty === "orbit"
          ? list.filter((e) => e.localName === "circle").sort((p, q) => ang(p) - ang(q))
          : ty === "constellation" && v && ring;
      if (i < 0) next = list[0];
      else if (c) next = c[(c.indexOf(cur!) + d + c.length) % c.length];
      else if (v) {
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

  const offs = [
    listen(
      box,
      ["pointerover", move],
      ["pointermove", move],
      ["pointerdown", down],
      ["pointerup", up],
      ["pointerleave", leave],
      ["keydown", key],
      ["focusout", blur],
    ),
    listen(document, ["pointerdown", outside, { capture: true }]),
    // Focusing the chart can scroll it into view; that must not close a keyboard tooltip.
    listen(window, ["scroll", () => kb || hide(), { capture: true, passive: true }]),
  ];
  return {
    off: () => (hide(), clearTimeout(timer), offs.forEach((f) => f())),
    hide,
    active: () => cur,
    pick: (e) => markOf(e.target, e),
    refresh() {
      const k = cur && a(cur, "data-key");
      dirty = true;
      if (!cur) return hide(); // rebuilt on the first pointer or key
      index();
      const m = k ? byKey.get(k) : undefined;
      if (!m) return hide();
      show(m);
      // Mid-move the mark is still at its old place: land the tooltip where it settles.
      const an = m.getAnimations?.() ?? [];
      if (an.length)
        Promise.all(an.map((x) => x.finished)).then(
          () => cur === m && show(m),
          () => {},
        );
    },
  };
}
