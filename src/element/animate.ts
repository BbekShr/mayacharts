import { html } from "./html.ts";

/** x, y, width, height in viewBox units. */
export type Box = [x: number, y: number, w: number, h: number];
export interface PatchOptions {
  /** Entering marks start from this box; exiting marks collapse into it. */
  origin?: Box | undefined;
  /** Post-patch hook, called with the live svg after every patch (animated or not). */
  after?: (svg: Element) => void;
}

const EASE = "cubic-bezier(.2,.8,.2,1)";
const DATA: KeyframeAnimationOptions = { duration: 280, easing: EASE };
const UI: KeyframeAnimationOptions = { duration: 160, easing: EASE };
const MAX = 1500; // ponytail: no animation above this many marks
const Z = 1e-6;
const n = (e: Element, k: string) => +(e.getAttribute(k) ?? 0);

/** Geometry of a rect or circle (circle = its bounding square); undefined for paths etc. */
const geo = (e: Element): Box | undefined => {
  if (e.localName === "rect") return [n(e, "x"), n(e, "y"), n(e, "width"), n(e, "height")];
  if (e.localName === "circle") {
    const r = n(e, "r");
    return [n(e, "cx") - r, n(e, "cy") - r, 2 * r, 2 * r];
  }
};

/** Box of any mark (paths via getBBox where it exists); used to derive a drill origin. */
export const boxOf = (e: Element): Box | undefined => {
  const b = (e as SVGGraphicsElement).getBBox?.();
  return geo(e) ?? (b ? [b.x, b.y, b.width, b.height] : undefined);
};

/** Transform (origin 0 0 of the fill-box) that maps geometry `g` onto box `b`. */
const tf = (g: Box, b: Box) =>
  `translate(${b[0] - g[0]}px,${b[1] - g[1]}px) scale(${Math.max(b[2], Z) / Math.max(g[2], Z)},${Math.max(b[3], Z) / Math.max(g[3], Z)})`;

const run = (e: Element, k: Keyframe[], o: KeyframeAnimationOptions, then?: () => void) => {
  const a = e.animate?.(k, o);
  if (then) a ? (a.addEventListener("finish", then), a.addEventListener("cancel", then)) : then();
};

function sync(o: Element, w: Element): void {
  for (const a of [...o.attributes]) if (!w.hasAttribute(a.name)) o.removeAttribute(a.name);
  for (const a of [...w.attributes]) o.setAttribute(a.name, a.value);
}

/** Where an entering mark starts (and an exiting one ends): `origin`, else its own baseline/centre. */
function seed(e: Element, g: Box, origin?: Box): Box {
  if (origin) return origin;
  const [x, y, w, h] = g;
  if (e.localName === "circle") return [x + w / 2, y + h / 2, 0, 0];
  const neg = e.hasAttribute("data-neg");
  return e.closest("[data-dir=h]") ? [neg ? x + w : x, y, 0, h] : [x, neg ? y : y + h, w, 0];
}

function fade(e: Element, out: boolean, then?: () => void, o = DATA): void {
  const k = [{ opacity: 0 }, { opacity: 1 }];
  run(e, out ? k.reverse() : k, out ? { ...o, fill: "forwards" } : o, then);
}

function enter(e: Element, origin?: Box): void {
  const g = geo(e);
  if (g)
    run(
      e,
      [
        { transform: tf(g, seed(e, g, origin)), opacity: 0 },
        { transform: "none", opacity: 1 },
      ],
      DATA,
    );
  else if (e.matches("path[data-maya=line]")) {
    e.setAttribute("pathLength", "1");
    const d = (o: string) => ({ strokeDasharray: "1", strokeDashoffset: o });
    run(e, [d("1"), d("0")], DATA);
  } else fade(e, false);
}

function exit(e: Element, origin?: Box): void {
  // No longer addressable while it leaves.
  e.removeAttribute("data-key");
  e.removeAttribute("data-maya");
  const g = geo(e);
  const done = () => e.remove();
  if (g)
    run(
      e,
      [
        { transform: "none", opacity: 1 },
        { transform: tf(g, seed(e, g, origin)), opacity: 0 },
      ],
      { ...DATA, fill: "forwards" },
      done,
    );
  else fade(e, true, done);
}

/** Current on-screen box of an animating mark (cancels its animations). */
function visual(m: Element, g: Box): Box {
  const an = m.getAnimations?.() ?? [];
  if (!an.length) return g;
  const t = getComputedStyle(m).transform; // user units under fill-box, origin 0 0
  for (const a of an) a.cancel();
  if (!t || t === "none" || typeof DOMMatrix === "undefined") return g;
  const c = new DOMMatrix(t);
  return [g[0] + c.e, g[1] + c.f, g[2] * c.a, g[3] * c.d];
}

function marks(o: Element, w: Element, origin?: Box): void {
  const old = new Map<string, Element>();
  for (const e of o.children)
    if (e.hasAttribute("data-key")) old.set(e.getAttribute("data-key")!, e);
  const order: Element[] = [];
  for (const e of [...w.children]) {
    const k = e.getAttribute("data-key")!;
    const m = old.get(k);
    if (!m || m.localName !== e.localName) {
      // Unknown key, or same key with another tag: replace (old one exits).
      order.push(e);
      continue;
    }
    old.delete(k);
    const g0 = geo(m);
    const v = g0 && visual(m, g0);
    sync(m, e);
    const g1 = geo(m);
    if (v && g1 && v.some((x, i) => Math.abs(x - g1[i]!) > 0.01))
      run(m, [{ transform: tf(g1, v) }, { transform: "none" }], DATA);
    order.push(m);
  }
  for (const m of old.values()) exit(m, origin);
  let ref = o.firstElementChild;
  for (const m of order) {
    while (ref && ref !== m && !ref.hasAttribute("data-key")) ref = ref.nextElementSibling;
    if (ref === m) ref = ref.nextElementSibling;
    else {
      const fresh = !m.isConnected;
      o.insertBefore(m, ref);
      if (fresh) enter(m, origin);
    }
  }
}

/** Crossfade the non-mark children (axes, grid, labels): changed groups fade 160 ms. */
function ui(o: Element, w: Element, om: Element, wm: Element): void {
  const id = (c: Element) => c.getAttribute("data-maya") ?? c.localName;
  const pool = new Map([...o.children].filter((c) => c !== om).map((c) => [id(c), c]));
  const out: Element[] = [];
  const fadeIn: Element[] = [];
  const fadeable = (c: Element) => c.localName === "g" && !/^(cross|hits)$/.test(id(c));
  for (const c of [...w.children]) {
    if (c === wm) {
      out.push(om);
      continue;
    }
    const p = pool.get(id(c));
    pool.delete(id(c));
    if (p && p.outerHTML === c.outerHTML) out.push(p);
    else {
      if (p && fadeable(p)) {
        ghost(p);
        out.push(p);
      }
      out.push(c);
      if (p && fadeable(c)) fadeIn.push(c);
    }
  }
  for (const p of pool.values()) if (fadeable(p)) (ghost(p), out.push(p));
  o.replaceChildren(...out);
  // Animations started on template children stay pending forever in WebKit and Firefox.
  for (const c of fadeIn) fade(c, false, undefined, UI);
}

/** An outgoing group: unaddressable while it fades, then removed. */
function ghost(g: Element): void {
  g.removeAttribute("data-maya");
  for (const d of g.querySelectorAll("[data-maya]")) d.removeAttribute("data-maya");
  fade(g, true, () => g.remove(), UI);
}

export function patch(
  box: Element,
  markup: string,
  animate: boolean,
  opts: PatchOptions = {},
): void {
  const t = document.createElement("template");
  t.innerHTML = html(markup);
  const w = t.content.firstElementChild!;
  const o = box.firstElementChild;
  const om = o?.querySelector(":scope > [data-maya=marks]");
  const wm = w.querySelector(":scope > [data-maya=marks]");
  if (!animate || !o || !om || !wm || wm.childElementCount > MAX || om.childElementCount > MAX)
    box.replaceChildren(w);
  else {
    sync(o, w);
    sync(om, wm);
    marks(om, wm, opts.origin);
    ui(o, w, om, wm);
  }
  opts.after?.(box.firstElementChild!);
}
