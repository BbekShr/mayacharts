import { html } from "./html.ts";

/** x, y, width, height in viewBox units. */
export type Box = [x: number, y: number, w: number, h: number];
/** First-draw choreography: wipe left to right (lines, flows), bloom from the centre (radial), or per mark. */
export type Intro = "wipe" | "bloom" | "marks";
export interface PatchOptions {
  /** Entering marks start from this box; exiting marks collapse into it. */
  origin?: Box | undefined;
  /** Post-patch hook, called with the live svg after every patch (animated or not). */
  after?: (svg: Element) => void;
  /** Diff and reuse nodes, but apply every change immediately (resize). */
  instant?: boolean;
  /** First draw: play this entrance (only when animating). */
  intro?: Intro | undefined;
}

let instant = false;
let lag = 0; // ms per category step of the current patch's stagger

const EASE = "cubic-bezier(.22,1,.36,1)"; // ease-out-quint: fast start, long soft landing
const POP = "cubic-bezier(.34,1.5,.64,1)"; // slight overshoot for points
const SWEEP = "cubic-bezier(.65,0,.35,1)";
const DATA: KeyframeAnimationOptions = { duration: 520, easing: EASE };
const INTRO: KeyframeAnimationOptions = { duration: 760, easing: EASE };
const UI: KeyframeAnimationOptions = { duration: 220, easing: EASE };
const MAX = 1500; // ponytail: no animation above this many marks
const STAGGER = 320; // total stagger spread across categories, ms
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
  // A delayed animation holds its first frame while it waits (else the mark flashes in place).
  if (o.delay) o = { ...o, fill: o.fill === "forwards" ? "both" : (o.fill ?? "backwards") };
  const a = instant ? undefined : e.animate?.(k, o);
  if (!then) return;
  if (!a) return then();
  let done = false;
  const once = () => done || ((done = true), then());
  a.addEventListener("finish", once);
  a.addEventListener("cancel", once);
  // Hidden tabs freeze animation timelines; ghosts must still leave.
  setTimeout(once, Number(o.duration ?? 0) + Number(o.delay ?? 0) + 100);
};

/** Stagger: a mark's delay follows its category, so bars rise left to right. */
const delay = (e: Element) => (e.hasAttribute("data-c") ? n(e, "data-c") * lag : 0);

function sync(o: Element, w: Element): void {
  // `style` holds element-owned CSSOM writes (bloom origin), never markup: keep it.
  for (const a of [...o.attributes])
    if (!w.hasAttribute(a.name) && a.name !== "style") o.removeAttribute(a.name);
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

/** Paths (arcs, hexes, ribbons): grow from their own centre while fading in. */
const pop = (out = false) => {
  const k: Keyframe[] = [
    { transform: "scale(.6)", transformOrigin: "50% 50%", opacity: 0 },
    { transform: "none", transformOrigin: "50% 50%", opacity: 1 },
  ];
  return out ? k.reverse() : k;
};

function enter(e: Element, origin?: Box, o = DATA): void {
  const g = geo(e);
  const at = { ...o, delay: delay(e) };
  if (g) {
    const c = e.localName === "circle";
    run(
      e,
      [
        { transform: tf(g, seed(e, g, origin)), opacity: 0 },
        { transform: "none", opacity: 1 },
      ],
      c && !origin ? { ...at, easing: POP } : at,
    );
  } else if (e.matches("path[data-maya=line]")) {
    e.setAttribute("pathLength", "1");
    const d = (o: string) => ({ strokeDasharray: "1", strokeDashoffset: o });
    run(e, [d("1"), d("0")], { ...o, easing: SWEEP, duration: Number(o.duration) * 1.4 });
  } else if (e.localName === "path" && !e.matches("[data-maya=area]")) run(e, pop(), at);
  else fade(e, false, undefined, at);
}

/** An outgoing node: unaddressable (no key, no pointer) but still styled while it leaves. */
function retire(e: Element): void {
  for (const k of ["data-key", "data-active", "data-lit"]) e.removeAttribute(k);
  e.setAttribute("data-ghost", "");
}

function exit(e: Element, origin?: Box): void {
  retire(e);
  const g = geo(e);
  const done = () => e.remove();
  const o = { ...DATA, fill: "forwards" as const };
  if (g)
    run(
      e,
      [
        { transform: "none", opacity: 1 },
        { transform: tf(g, seed(e, g, origin)), opacity: 0 },
      ],
      o,
      done,
    );
  else if (e.localName === "path" && !e.matches("[data-maya=line],[data-maya=area]"))
    run(e, pop(true), o, done);
  else fade(e, true, done);
}

/** Current on-screen box of an animating mark (its animations keep running). */
function visual(m: Element, g: Box): Box {
  if (!m.getAnimations?.().length) return g;
  const t = getComputedStyle(m).transform; // user units under fill-box, origin 0 0
  if (!t || t === "none" || typeof DOMMatrix === "undefined") return g;
  const c = new DOMMatrix(t);
  return [g[0] + c.e, g[1] + c.f, g[2] * c.a, g[3] * c.d];
}

// Paths morph through CSS `d` where the engine interpolates it (Chromium, Firefox) and the
// command sequence is unchanged; otherwise the old outline crossfades out.
const MORPH = !!globalThis.CSS?.supports?.("d", 'path("M0 0")');
const cmds = (d: string) => d.replace(/[^A-Za-z]/g, "");
const morphable = (d0: string, d1: string) => MORPH && !!d0 && !!d1 && cmds(d0) === cmds(d1);
const morphs = new WeakMap<Element, Animation>();

/** The outline on screen: mid-morph, the interpolated `d`; else the attribute. Read before sync. */
const outline = (m: Element, d0: string) => {
  const c = morphs.get(m)?.playState === "running" ? getComputedStyle(m).getPropertyValue("d") : "";
  return c.startsWith("path(") ? c : `path("${d0}")`;
};

function morph(m: Element, from: string, d1: string): void {
  for (const a of m.getAnimations?.() ?? []) a.cancel();
  if (instant) return;
  const a = m.animate?.([{ d: from }, { d: `path("${d1}")` }], DATA);
  if (a) morphs.set(m, a);
}

/** Path whose shape changed: the old outline fades out over the new one. */
function crossfade(m: Element): void {
  const gh = m.cloneNode(true) as Element;
  retire(gh);
  m.before(gh);
  fade(gh, true, () => gh.remove());
}

// Numbers in text marks (kpi value): count to the new value. Digits are replaced in place, so
// the locale's separators, prefix and suffix stay exactly as the formatter wrote them.
const NUM = /\d(?:[\d.,'\u2019\s\u00a0\u202f]*\d)?/;
const counts = new WeakMap<Element, number>(); // latest count per element; older loops stop
function count(e: Element, from: string, o: KeyframeAnimationOptions): void {
  const to = e.textContent ?? "";
  const m = NUM.exec(to);
  const f = NUM.exec(from);
  if (!m || instant || typeof requestAnimationFrame === "undefined") return;
  const tok = m[0];
  const ds = tok.replace(/\D/g, "");
  if (ds.length > 15 || +ds === 0) return;
  // Count from the old number when it has the same shape (same digit count), else from zero.
  const fd = f ? f[0].replace(/\D/g, "") : "";
  const a = fd.length === ds.length ? +fd : 0;
  const b = +ds;
  if (a === b) return;
  // A last separator followed by other than 3 digits is the decimal mark, as is one after a
  // lone leading zero ("0.125").
  const ls = /^0\D/.test(tok) ? 1 : tok.search(/\D\d{1,2}$|\D\d{4,}$/);
  const head = to.slice(0, m.index),
    tail = to.slice(m.index + tok.length);
  const shape = (k: number) => {
    const s = String(k).padStart(ds.length, "0");
    let i = 0;
    const t = tok.replace(/\d/g, () => s[i++]!);
    const [int, dec] = ls < 0 ? [t, ""] : [t.slice(0, ls), t.slice(ls)];
    return head + int.replace(/^[0\D]+(?=\d)/, "") + dec + tail;
  };
  const ms = Number(o.duration) * 1.6,
    t0 = performance.now() + Number(o.delay ?? 0);
  const id = (counts.get(e) ?? 0) + 1;
  counts.set(e, id);
  let cur = shape(a);
  e.textContent = cur;
  const step = (now: number) => {
    if (counts.get(e) !== id || e.textContent !== cur) return; // a newer count or render
    const p = Math.min(1, Math.max(0, (now - t0) / ms));
    e.textContent = cur = p < 1 ? shape(Math.round(a + (b - a) * (1 - (1 - p) ** 4))) : to;
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
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
    const d0 = m.getAttribute("d") ?? "",
      d1 = e.getAttribute("d") ?? "";
    const shaped = !g0 && d0 !== d1;
    const morphed = shaped && morphable(d0, d1);
    const from = morphed ? outline(m, d0) : "";
    const was = m.textContent ?? "";
    if (instant || (shaped && !morphed)) for (const a of m.getAnimations?.() ?? []) a.cancel();
    if (shaped && !morphed && !instant) crossfade(m); // the ghost keeps the old outline
    sync(m, e);
    if (morphed) morph(m, from, d1);
    if (m.innerHTML !== e.innerHTML) m.replaceChildren(...e.childNodes);
    const g1 = geo(m);
    // Moved: restart from where it is on screen now. Unmoved: a running entrance keeps playing.
    if (
      !instant &&
      v &&
      g1 &&
      (v.some((x, i) => Math.abs(x - g1[i]!) > 0.01) || g1.some((x, i) => x !== g0[i]))
    ) {
      for (const a of m.getAnimations?.() ?? []) a.cancel();
      run(m, [{ transform: tf(g1, v) }, { transform: "none" }], { ...DATA, delay: delay(m) / 2 });
    } else if (shaped && !morphed) fade(m, false);
    if (m.localName === "text" && m.textContent !== was) count(m, was, DATA);
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

/** Crossfade the non-mark children (axes, grid, labels): changed groups fade 220 ms. */
function ui(o: Element, w: Element, om: Element, wm: Element): void {
  const id = (c: Element) => c.getAttribute("data-maya") ?? c.localName;
  const pool = new Map([...o.children].filter((c) => c !== om).map((c) => [id(c), c]));
  const out: Element[] = [];
  const fadeIn: Element[] = [];
  const ghosts: Element[] = [];
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
      if (p && fadeable(p)) (ghosts.push(p), out.push(p));
      out.push(c);
      if (p && fadeable(c)) fadeIn.push(c);
    }
  }
  for (const p of pool.values()) if (fadeable(p)) (ghosts.push(p), out.push(p));
  o.replaceChildren(...out);
  // Start every fade after the swap: animations on template children stay pending forever in
  // WebKit and Firefox, and a ghost removed synchronously would be re-inserted by the swap.
  for (const g of ghosts) ghost(g);
  for (const c of fadeIn) fade(c, false, undefined, UI);
}

/** An outgoing group: unaddressable while it fades, then removed. */
function ghost(g: Element): void {
  g.removeAttribute("data-maya");
  for (const d of g.querySelectorAll("[data-maya]")) d.removeAttribute("data-maya");
  fade(g, true, () => g.remove(), UI);
}

/** The first draw: scaffolding fades in, marks enter by `kind`, labels and numbers follow. */
function intro(svg: Element, kind: Intro): void {
  const part = (k: string) => svg.querySelector(`:scope > [data-maya=${k}]`);
  for (const k of ["grid", "axis-y", "axis-x"]) {
    const g = part(k);
    if (g) fade(g, false, undefined, { ...UI, duration: 480 });
  }
  const m = part("marks");
  if (!m) return;
  const late = { ...UI, duration: 360, delay: Number(INTRO.duration) * 0.6 + STAGGER / 2 };
  const l = part("labels");
  if (l) fade(l, false, undefined, late);
  if (kind === "wipe") {
    // Clip, not geometry: lines, areas and points are revealed together, left to right.
    const c = (r: string) => ({ clipPath: `inset(-20% ${r} -20% -1%)` });
    run(m, [c("101%"), c("-1%")], { duration: 1100, easing: SWEEP });
  } else if (kind === "bloom") {
    const p = (svg.getAttribute("data-plot") ?? "0 0 0 0").split(" ").map(Number);
    (m as SVGElement).style.transformOrigin = `${p[0]! + p[2]! / 2}px ${p[1]! + p[3]! / 2}px`;
    run(
      m,
      [
        { transform: "rotate(-24deg) scale(.82)", opacity: 0 },
        { transform: "none", opacity: 1 },
      ],
      { duration: 1000, easing: EASE },
    );
  } else for (const e of m.children) enter(e, undefined, INTRO);
  for (const t of m.querySelectorAll("text[data-maya=mark]")) count(t, "", INTRO);
}

/** ms between categories so the whole stagger spans at most STAGGER. */
const spread = (wm: Element) => {
  const cs = new Set<string>();
  for (const e of wm.children) cs.add(e.getAttribute("data-c") ?? "");
  return Math.min(40, STAGGER / Math.max(1, cs.size));
};

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
  const many = !wm || wm.childElementCount > MAX || (om?.childElementCount ?? 0) > MAX;
  if (!animate || !o || !om || !wm || many) {
    box.replaceChildren(w);
    if (animate && opts.intro && wm && !many) {
      lag = spread(wm);
      intro(box.firstElementChild!, opts.intro);
    }
  } else {
    instant = !!opts.instant;
    lag = spread(wm);
    sync(o, w);
    sync(om, wm);
    marks(om, wm, opts.origin);
    ui(o, w, om, wm);
    instant = false;
  }
  opts.after?.(box.firstElementChild!);
}
