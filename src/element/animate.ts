import { key } from "../core/svg.ts";
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
  /** Drill: zoom `in` to, or `out` of, the branch with this raw value: the marks whose key
   * ends in it (old marks going in, new ones coming out). Rect marks scale with the view. */
  zoom?: { in: string } | { out: string } | undefined;
}

let instant = false;
let lag = 0; // ms per category step of the current patch's stagger
let zoom: [number, number] | undefined; // sunburst: span of the branch the patch zooms into/out of
// Drill on rect marks: P is the branch's box, F the plot. In, the view maps P onto F: children
// start inside P, everything else is pushed out. Out is the reverse.
let moved = false; // the patch moved, morphed, entered or exited a mark: labels and axes wait for it
let plot = ""; // the outgoing svg's data-plot, read before sync copies the new one
let zm: { P: Box; F: Box; out: boolean } | undefined;
/** `r` in the frame `a` re-expressed in the frame `b`. */
const map = (r: Box, a: Box, b: Box): Box => [
  b[0] + ((r[0] - a[0]) * b[2]) / a[2],
  b[1] + ((r[1] - a[1]) * b[3]) / a[3],
  (r[2] * b[2]) / a[2],
  (r[3] * b[3]) / a[3],
];
/** Transform that carries a mark to where it enters from (or exits to) during a drill zoom:
 * rects scale with the view, circles keep their size and move their centre, lines (dumbbell
 * connectors) map their ends. Undefined when not zooming. */
const zoomed = (e: Element, g: Box | undefined, leaving: boolean): string | undefined => {
  if (!zm) return;
  const [a, b] = zm.out === leaving ? [zm.F, zm.P] : [zm.P, zm.F];
  if (e.localName === "line") {
    // Axis-aligned: scale along the line only, so the stroke keeps its width.
    const ax = (p: number, q: number, i: 0 | 1): [number, number] => {
      const k = p === q ? 1 : b[2 + i]! / a[2 + i]!;
      return [k, b[i]! + ((p - a[i]!) * b[2 + i]!) / a[2 + i]! - p * k];
    };
    const [kx, tx] = ax(n(e, "x1"), n(e, "x2"), 0);
    const [ky, ty] = ax(n(e, "y1"), n(e, "y2"), 1);
    return `matrix(${kx},0,0,${ky},${tx},${ty})`;
  }
  if (!g) return;
  const m = map(g, a, b);
  return e.localName === "circle"
    ? `translate(${m[0] + (m[2] - g[2]) / 2 - g[0]}px,${m[1] + (m[3] - g[3]) / 2 - g[1]}px)`
    : tf(g, m);
};

const EASE = "cubic-bezier(.22,1,.36,1)"; // ease-out-quint: fast start, long soft landing
const POP = "cubic-bezier(.34,1.5,.64,1)"; // slight overshoot for points
const SWEEP = "cubic-bezier(.65,0,.35,1)";
const DATA: KeyframeAnimationOptions = { duration: 520, easing: EASE };
const INTRO: KeyframeAnimationOptions = { duration: 760, easing: EASE };
const UI: KeyframeAnimationOptions = { duration: 220, easing: EASE };
const ZOOM: KeyframeAnimationOptions = { duration: 640, easing: SWEEP };
const WIPE = 1100; // ms, line and area first draw
const MAX = 1500; // ponytail: no animation above this many marks
const STAGGER = 320; // total stagger spread across categories, ms
const Z = 1e-6;
const n = (e: Element, k: string) => +(e.getAttribute(k) ?? 0);

/*
 * Sunburst slices (hierarchy.ts): stroked circles whose dash is the arc, pathLength 360, so
 * offset = 90 - start angle. They tween r, stroke-width and the dash, all CSS properties,
 * which sweeps in angle space; no geometry attribute is ever tweened.
 */
const ring = (e: Element) => e.localName === "circle" && e.hasAttribute("pathLength");
/** A ring's shape as a keyframe: the attributes, or mid-animation what is on screen. */
const arc = (e: Element, live = false): Keyframe => {
  if (live && e.getAnimations?.().length) {
    const c = getComputedStyle(e);
    return {
      r: c.r,
      strokeWidth: c.strokeWidth,
      strokeDasharray: c.strokeDasharray,
      strokeDashoffset: c.strokeDashoffset,
    };
  }
  return {
    r: `${n(e, "r")}px`,
    strokeWidth: `${n(e, "stroke-width")}px`,
    strokeDasharray: e.getAttribute("stroke-dasharray") ?? "",
    strokeDashoffset: `${n(e, "stroke-dashoffset")}`,
  };
};
/** Start and end angle (degrees from 12 o'clock) of a ring. */
const span = (e: Element): [number, number] => {
  const a = 90 - n(e, "stroke-dashoffset");
  return [a, a + parseFloat(e.getAttribute("stroke-dasharray") ?? "0")];
};
/** Where a ring outside the zoomed branch folds to: the branch edge it lies beyond. */
const folded = (e: Element): Keyframe | undefined => {
  const [a0, a1] = span(e);
  const at = !zoom ? undefined : a0 >= zoom[1] - 0.01 ? 360 : a1 <= zoom[0] + 0.01 ? 0 : undefined;
  if (at !== undefined && e.getAttribute("data-depth") !== "0")
    return { ...arc(e), strokeDasharray: "0 360", strokeDashoffset: `${90 - at}` };
};

/** Geometry of a rect or circle (circle = its bounding square); undefined for paths etc. */
const geo = (e: Element): Box | undefined => {
  if (ring(e)) return;
  if (e.localName === "rect") return [n(e, "x"), n(e, "y"), n(e, "width"), n(e, "height")];
  if (e.localName === "circle") {
    const r = n(e, "r");
    return [n(e, "cx") - r, n(e, "cy") - r, 2 * r, 2 * r];
  }
};

/** Transform (origin 0 0 of the fill-box) that maps geometry `g` onto box `b`. */
const tf = (g: Box, b: Box) =>
  `translate(${b[0] - g[0]}px,${b[1] - g[1]}px) scale(${Math.max(b[2], Z) / Math.max(g[2], Z)},${Math.max(b[3], Z) / Math.max(g[3], Z)})`;

const run = (e: Element, k: Keyframe[], o: KeyframeAnimationOptions, then?: () => void) => {
  // A delayed animation holds its first frame while it waits (else the mark flashes in place).
  if (o.delay) o = { ...o, fill: o.fill === "forwards" ? "both" : (o.fill ?? "backwards") };
  // Scatter circles rest on a centre origin (hover scale): the box maths here starts at 0 0.
  if (e.localName === "circle") k = k.map((f) => ({ ...f, transformOrigin: "0 0" }));
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
// Only cartesian charts (svg carries data-n or data-xd): in space-filling and flow marks data-c is an index and a stagger overlaps neighbours.
const delay = (e: Element) =>
  e.hasAttribute("data-c") && e.closest("svg[data-n],svg[data-xd]") ? n(e, "data-c") * lag : 0;

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
  // The open end is implicit: it is the CSS opacity (translucent links rest at .45, not 1).
  run(
    e,
    out ? [{}, { opacity: 0 }] : [{ opacity: 0 }, {}],
    out ? { ...o, fill: "forwards" } : o,
    then,
  );
}

/** Paths (arcs, hexes, ribbons): grow from their own centre while fading in. */
const pop = (out = false) => {
  const k: Keyframe[] = [
    { transform: "scale(.6)", transformOrigin: "50% 50%", opacity: 0 },
    // No end opacity: it lands on the CSS value (links rest translucent, not at 1).
    { transform: "none", transformOrigin: "50% 50%" },
  ];
  return out ? k.reverse() : k;
};

function enter(e: Element, origin?: Box, o = DATA): void {
  const g = geo(e);
  // Funnel connectors wait for their stages to pop.
  const at = { ...o, delay: e.hasAttribute("data-total") ? Number(o.duration) * 0.6 : delay(e) };
  const f = ring(e) && folded(e);
  const z = zoomed(e, g, false);
  if (f) run(e, [f, arc(e)], ZOOM);
  else if (z) run(e, [{ transform: z, opacity: 0 }, { transform: "none" }], ZOOM);
  else if (g) {
    const c = e.localName === "circle";
    run(
      e,
      [{ transform: tf(g, seed(e, g, origin)), opacity: 0 }, { transform: "none" }],
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

const gk = new WeakMap<Element, string>(); // exiting node -> the key it had

function exit(e: Element, origin?: Box): void {
  gk.set(e, e.getAttribute("data-key")!);
  retire(e);
  const g = geo(e);
  const done = () => e.hasAttribute("data-ghost") && e.remove(); // revived by marks(): stays
  const o = { ...DATA, fill: "forwards" as const };
  const f = ring(e) && folded(e);
  const z = zoomed(e, g, true);
  if (f) run(e, [arc(e, true), f], { ...ZOOM, fill: "forwards" }, done);
  else if (z) run(e, [{}, { transform: z, opacity: 0 }], { ...ZOOM, fill: "forwards" }, done);
  else if (g)
    run(e, [{ transform: "none" }, { transform: tf(g, seed(e, g, origin)), opacity: 0 }], o, done);
  else if (e.localName === "path" && !e.matches("[data-maya=line],[data-maya=area]"))
    run(e, pop(true), o, done);
  // The old sunburst hub stays until the clicked slice has nearly reached the centre.
  else fade(e, true, done, ring(e) && zoom ? { ...UI, delay: Number(ZOOM.duration) / 2 } : DATA);
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
  const a = m.animate?.([{ d: from }, { d: `path("${d1}")` }], {
    ...DATA,
    delay: delay(m) / 2,
    fill: "backwards",
  });
  if (a) morphs.set(m, a);
}

/** Path whose shape changed: the old outline fades out over the new one. */
function crossfade(m: Element, o = { ...DATA, delay: delay(m) / 2 }): void {
  const gh = m.cloneNode(true) as Element;
  retire(gh);
  m.before(gh);
  fade(gh, true, () => gh.remove(), o);
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
  // A key that comes back while its old node still leaves revives that node (drill out right after in).
  const gh = new Map<string, Element>();
  for (const e of o.children) if (gk.has(e) && e.hasAttribute("data-ghost")) gh.set(gk.get(e)!, e);
  const at = (k: string) => old.get(k) ?? gh.get(k);
  // Sunburst drill: the branch whose slice becomes the centre disk, or the disk that becomes a
  // slice again. Its slice's span is the zoom window the rest folds out of or in from.
  const hub = (g: Element) => g.querySelector(':scope > circle[data-depth="0"]');
  const [ho, hw] = [hub(o), hub(w)];
  const ko = ho?.getAttribute("data-key"),
    kw = hw?.getAttribute("data-key");
  const slice =
    ko === kw
      ? undefined
      : ((kw && at(kw)) ?? [...w.children].find((e) => ko && e.getAttribute("data-key") === ko));
  zoom = slice && ring(slice) ? span(slice) : undefined;
  const order: Element[] = [];
  moved = false;
  for (const e of [...w.children]) {
    const k = e.getAttribute("data-key")!;
    const m = at(k);
    if (!m || m.localName !== e.localName) {
      // Unknown key, or same key with another tag: replace (old one exits).
      order.push(e);
      continue;
    }
    old.delete(k);
    if (ring(m)) {
      const from = arc(m, true);
      for (const a of m.getAnimations?.() ?? []) a.cancel();
      sync(m, e);
      if (!instant) run(m, [from, arc(m)], ZOOM);
      order.push(m);
      continue;
    }
    const g0 = geo(m);
    const v = g0 && visual(m, g0);
    if (m.hasAttribute("data-ghost")) for (const a of m.getAnimations?.() ?? []) a.cancel();
    const d0 = m.getAttribute("d") ?? "",
      d1 = e.getAttribute("d") ?? "";
    const shaped = !g0 && d0 !== d1;
    const morphed = shaped && !zm && morphable(d0, d1); // a drill swaps the category set: crossfade
    const from = morphed ? outline(m, d0) : "";
    const was = m.textContent ?? "";
    if (instant || (shaped && !morphed)) for (const a of m.getAnimations?.() ?? []) a.cancel();
    if (shaped && !instant) moved = true;
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
      moved = true;
      for (const a of m.getAnimations?.() ?? []) a.cancel();
      run(m, [{ transform: tf(g1, v) }, { transform: "none" }], { ...DATA, delay: delay(m) / 2 });
    } else if (shaped && !morphed) fade(m, false, undefined, { ...DATA, delay: delay(m) / 2 });
    if (m.localName === "text" && m.textContent !== was) count(m, was, DATA);
    order.push(m);
  }
  for (const m of old.values()) (exit(m, origin), (moved = true));
  let ref = o.firstElementChild;
  for (const m of order) {
    while (ref && ref !== m && !ref.hasAttribute("data-key")) ref = ref.nextElementSibling;
    if (ref === m) ref = ref.nextElementSibling;
    else {
      const fresh = !m.isConnected;
      o.insertBefore(m, ref);
      if (fresh) (enter(m, origin), (moved = true));
    }
  }
}

/** Crossfade the non-mark children (axes, grid, labels): changed groups fade 220 ms. */
function ui(o: Element, w: Element, om: Element, wm: Element): void {
  const id = (c: Element) => c.getAttribute("data-maya") ?? c.localName;
  // Groups already fading out keep fading; they are neither pooled nor ghosted again.
  const out = [...o.children].filter((c) => c.hasAttribute("data-ghost"));
  const pool = new Map(
    [...o.children].filter((c) => c !== om && !out.includes(c)).map((c) => [id(c), c]),
  );
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
  // Value labels wait for the marks to land; axes swap at once (on a drill, after the marks are under way).
  const z = !!(zoom || zm || moved);
  const late = { ...UI, delay: Number((zoom || zm ? ZOOM : DATA).duration) * 0.75 };
  for (const c of fadeIn)
    fade(c, false, undefined, z ? (id(c) === "labels" ? late : { ...UI, delay: 160 }) : UI);
}

/** An outgoing group: unaddressable while it fades, then removed. */
function ghost(g: Element): void {
  const op = getComputedStyle(g).opacity; // mid-fade-in (or still waiting): leave from there
  // Sunburst drill: ring names go at once, the centre text stays until the new labels arrive.
  const hold = zoom && g.getAttribute("data-maya") === "labels";
  if (hold) {
    // The centre text sits on the plot centre (no centre label: nothing is held).
    const p = plot.split(" ").map(Number);
    for (const t of g.children)
      if (
        Math.abs(n(t, "x") - p[0]! - p[2]! / 2) > 1 ||
        Math.abs(n(t, "y") - p[1]! - p[3]! / 2) > 9
      )
        run(t, [{ opacity: 1 }, { opacity: 0 }], { ...UI, fill: "forwards" });
  }
  g.removeAttribute("data-maya");
  for (const d of g.querySelectorAll("[data-maya]")) d.removeAttribute("data-maya");
  g.setAttribute("data-ghost", "");
  for (const a of g.getAnimations?.() ?? []) a.cancel();
  const d = hold ? Number(ZOOM.duration) * 0.75 : 0;
  run(g, [{ opacity: op }, { opacity: 0 }], { ...UI, delay: d, fill: "forwards" }, () =>
    g.remove(),
  );
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
  // A wipe reveals left to right: labels wait for it to land rather than run ahead of the line.
  const late = {
    ...UI,
    duration: 360,
    delay: kind === "wipe" ? WIPE : Number(INTRO.duration) * 0.6 + STAGGER / 2,
  };
  const l = part("labels");
  if (l) fade(l, false, undefined, late);
  if (kind === "wipe") {
    // Clip, not geometry: lines, areas and points are revealed together, left to right.
    const c = (r: string) => ({ clipPath: `inset(-20% ${r} -20% -1%)` });
    run(m, [c("101%"), c("-1%")], { duration: WIPE, easing: SWEEP });
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
    zm = undefined;
    const z = opts.zoom;
    if (z) {
      const F = (w.getAttribute("data-plot") ?? "").split(" ").map(Number) as Box;
      const [v, from] = "in" in z ? [z.in, om] : [z.out, wm];
      // Union of the branch's marks (stacked segments, dumbbell ends).
      let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
      for (const e of from.children) {
        const g = e.getAttribute("data-key")?.endsWith("~" + key(v)) && geo(e);
        if (!g) continue;
        [x0, y0] = [Math.min(x0, g[0]), Math.min(y0, g[1])];
        [x1, y1] = [Math.max(x1, g[0] + g[2]), Math.max(y1, g[1] + g[3])];
      }
      const P: Box = [x0, y0, x1 - x0, y1 - y0];
      if (P[2] > 1 && P[3] > 1 && F.length === 4 && F[2]! > 0 && F[3]! > 0) {
        zm = { P, F, out: !("in" in z) };
        // Zoomed marks may grow past the plot; keep them inside it while they move.
        const [vw, vh] = (w.getAttribute("viewBox") ?? "").split(" ").slice(2).map(Number);
        const clip = `inset(${F[1]}px ${vw! - F[0] - F[2]}px ${vh! - F[1] - F[3]}px ${F[0]}px) view-box`;
        run(om, [{ clipPath: clip }, { clipPath: clip }], ZOOM);
      }
    }
    plot = o.getAttribute("data-plot") ?? "";
    sync(o, w);
    sync(om, wm);
    marks(om, wm, opts.origin);
    ui(o, w, om, wm);
    instant = false;
    zm = undefined;
  }
  opts.after?.(box.firstElementChild!);
}
