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
const SWEEP = "cubic-bezier(.65,0,.35,1)";
const DATA: KeyframeAnimationOptions = { duration: 520, easing: EASE };
const INTRO: KeyframeAnimationOptions = { duration: 760, easing: EASE };
const UI: KeyframeAnimationOptions = { duration: 220, easing: EASE };
const ZOOM: KeyframeAnimationOptions = { duration: 640, easing: SWEEP };
const SWEEP_MS = 1500; // orbit entrance
const WIPE = 1100; // ms, line and area first draw
const MAX = 1500; // ponytail: no animation above this many marks
const STAGGER = 320; // total stagger spread across categories, ms
const Z = 1e-6;
/** Put an orbit rotation at angle fraction `f` (its direction decides which end of the clock that is). */
const seek = (a: Animation, f: number) => {
  const c = a.effect!.getComputedTiming();
  a.currentTime = (c.direction === "reverse" ? 1 - f : f) * Number(c.duration);
};
const orbiting = (a: Animation) => (a as CSSAnimation).animationName === "maya-orbit";
const mid = (b: Box) => [b[0] + b[2] / 2, b[1] + b[3] / 2] as const;
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
  if (e.localName === "line") {
    const [x, y] = [n(e, "x1"), n(e, "y1")];
    return [
      Math.min(x, n(e, "x2")),
      Math.min(y, n(e, "y2")),
      Math.abs(x - n(e, "x2")),
      Math.abs(y - n(e, "y2")),
    ];
  }
  if (e.localName === "rect") return [n(e, "x"), n(e, "y"), n(e, "width"), n(e, "height")];
  if (e.localName === "circle") {
    const r = n(e, "r");
    return [n(e, "cx") - r, n(e, "cy") - r, 2 * r, 2 * r];
  }
};

/** Transform (origin 0 0 of the fill-box) that maps geometry `g` onto box `b`. */
const tf = (g: Box, b: Box) =>
  `translate(${b[0] - g[0]}px,${b[1] - g[1]}px) scale(${Math.max(b[2], Z) / Math.max(g[2], Z)},${Math.max(b[3], Z) / Math.max(g[3], Z)})`;

const stop = (l: Animation[] = []) => l.forEach((a) => a.cancel());
const run = (e: Element, k: Keyframe[], o: KeyframeAnimationOptions, then?: () => void) => {
  // A delayed animation holds its first frame while it waits (else the mark flashes in place).
  if (o.delay) o = { ...o, fill: o.fill === "forwards" ? "both" : (o.fill ?? "backwards") };
  // Scatter circles rest on a centre origin (hover scale): the box maths here starts at 0 0.
  // Connectors scale about their own box too (the drill zoom's matrix is in view-box units, so not that one).
  const ln = e.localName === "line" && k.some((f) => `${f.transform}`.startsWith("t"));
  if (e.localName === "circle" || ln)
    k = k.map((f) => ({ ...f, transformOrigin: "0 0", ...(ln && { transformBox: "fill-box" }) }));
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

/** Make `o`'s subtree match `w`'s in place where the shapes agree, so nested nodes (and the CSS
 * animations on them, an orbit's rotation) survive an update; else replace the children. */
function mend(o: Element, w: Element): void {
  const [a, b] = [[...o.children], [...w.children]];
  if (a.length && a.length === b.length && a.every((c, i) => c.localName === b[i]!.localName))
    a.forEach((c, i) => (sync(c, b[i]!), mend(c, b[i]!)));
  else o.replaceChildren(...w.childNodes);
}

function sync(o: Element, w: Element): void {
  // `style` holds element-owned CSSOM writes (bloom origin), never markup: keep it.
  for (const a of [...o.attributes])
    if (!w.hasAttribute(a.name) && !/^(style|data-active|tabindex)$/.test(a.name))
      o.removeAttribute(a.name);
  for (const a of [...w.attributes]) o.setAttribute(a.name, a.value);
}

/** Where an entering mark starts (and an exiting one ends): `origin`, else its own baseline/centre. */
function seed(e: Element, g: Box, origin?: Box): Box {
  if (origin) return origin;
  const [x, y, w, h] = g;
  if (e.localName === "circle") return [x + w / 2, y + h / 2, 0, 0];
  const neg = e.hasAttribute("data-neg");
  // A stack grows as one column: every segment starts at the baseline (the outer edge of its
  // column's non-negative segments), not at its own edge.
  const hz = !!e.closest("[data-dir=h]");
  let b = hz ? (neg ? x + w : x) : neg ? y : y + h;
  if (!neg && (e.hasAttribute("data-mm") || e.closest("svg[data-stack]")))
    for (const s of e.parentNode!.querySelectorAll(
      `rect[data-c="${e.getAttribute("data-c")}"]:not([data-neg])`,
    )) {
      const q = geo(s)!;
      b = hz ? Math.min(b, q[0]) : Math.max(b, q[1] + q[3]);
    }
  return hz ? [b, y, 0, h] : [x, b, w, 0];
}

function fade(e: Element, out: boolean, then?: () => void, o = DATA): void {
  // The open end is implicit: it is the CSS opacity (translucent links rest at .45, not 1).
  const k = [{}, { opacity: 0 }];
  run(e, out ? k : k.reverse(), out ? { ...o, fill: "forwards" } : o, then);
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
  moved = true;
  const g = geo(e);
  // Funnel connectors wait for their stages to pop.
  const at = { ...o, delay: e.matches("path[data-total]") ? Number(o.duration) * 0.6 : delay(e) };
  const f = ring(e) && folded(e);
  const z = zoomed(e, g, false);
  if (f) run(e, [f, arc(e)], ZOOM);
  else if (z) run(e, [{ transform: z, opacity: 0 }, { transform: "none" }], ZOOM);
  else if (g) {
    run(e, [{ transform: tf(g, seed(e, g, origin)), opacity: 0 }, { transform: "none" }], at);
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
  moved = true;
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
  stop(m.getAnimations?.());
  if (instant) return;
  const a = m.animate?.([{ d: from }, { d: `path("${d1}")` }], {
    ...DATA,
    delay: delay(m) / 2,
    fill: "backwards",
  });
  if (a) morphs.set(m, a);
}

/** Path whose shape changed: the old outline fades out over the new one. */
function crossfade(
  m: Element,
  o: KeyframeAnimationOptions = { ...DATA, delay: delay(m) / 2 },
): void {
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
  // A mark's geometry lives on the mark, or on the planet nested in an orbit's `g`.
  const nest = (m: Element) => m.querySelector("[data-maya=mark]") ?? m;
  // Read pass: every animation list and on-screen box before the first write, so the writes below
  // never force a style flush per mark (1500 dots: 3000 flushes otherwise).
  const live = new Map<Element | null, Animation[]>();
  // Orbit rotations (CSS animations): their angle as a fraction, kept across the reorder below.
  const phase = new Map<Element, number>();
  for (const a of o.getAnimations?.({ subtree: true }) ?? []) {
    const k = (a.effect as KeyframeEffect).target;
    live.get(k)?.push(a) ?? live.set(k, [a]);
    const f = orbiting(a) && a.effect!.getComputedTiming();
    if (f && f.progress != null) phase.set(k!, f.progress);
  }
  const jump = !MORPH && !!w.querySelector("[data-w]"); // weave without CSS `d`: threads crossfade, so dots do

  const pre = new Map<Element, Box | undefined>();
  const arcs = new Map<Element, Keyframe>();
  for (const e of w.children) {
    const m = at(e.getAttribute("data-key")!);
    if (!m || m.localName !== e.localName) continue;
    const t = nest(m);
    const g = geo(t);
    // The on-screen box of an animating mark: its transform is in user units, origin 0 0 (fill-box).
    const c = g && live.get(t) && new DOMMatrix(getComputedStyle(t).transform);
    if (ring(m)) arcs.set(m, arc(m, true));
    // An orbit planet's transform rotates about the sun: carry its centre through it.
    const q = c && t !== m && c.transformPoint({ x: g[0] + g[2] / 2, y: g[1] + g[3] / 2 });
    pre.set(
      e,
      q && g
        ? [q.x - g[2] / 2, q.y - g[3] / 2, g[2], g[3]]
        : c && g
          ? [g[0] + c.e, g[1] + c.f, g[2] * c.a, g[3] * c.d]
          : g,
    );
  }
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
    const v = pre.get(e);
    const t = nest(m);
    const [as, ta] = [live.get(m) ?? [], live.get(t) ?? []];
    if (ring(m)) {
      const from = arcs.get(m)!;
      stop(as);
      sync(m, e);
      if (!instant) run(m, [from, arc(m)], ZOOM);
      order.push(m);
      continue;
    }
    const g0 = geo(t);
    const d0 = m.getAttribute("d") ?? "",
      d1 = e.getAttribute("d") ?? "";
    const shaped = !g0 && d0 !== d1;
    const morphed = shaped && !zm && morphable(d0, d1); // a drill swaps the category set: crossfade
    const from = morphed ? outline(m, d0) : "";
    const was = m.textContent ?? "";
    const g = jump && m.localName === "circle" && v && geo(e);
    const sw = g && v!.some((x, i) => Math.abs(x - g[i]!) > 0.01);
    if (sw && !instant) crossfade(m);
    let glided = false;
    // Orbit: a planet's trail and a name sit at their new place at once; they wait for the planet.
    const pick = () =>
      t !== m
        ? m.querySelector("[data-trail]")
        : m.localName === "g" && m.hasAttribute("data-a")
          ? m
          : null;
    const sig = (e: Element | null) => e?.getAttribute("d") ?? e?.outerHTML;
    const s0 = sig(pick());
    // A name whose place or words change: the old one fades out where it stood.
    if (
      m.localName === "g" &&
      t === m &&
      m.hasAttribute("data-a") &&
      !instant &&
      m.outerHTML !== e.outerHTML
    )
      crossfade(m, UI);
    if (m.hasAttribute("data-ghost") || instant || (shaped && !morphed)) stop(as);
    if (shaped && !instant) moved = true;
    if (shaped && !morphed && !instant) crossfade(m); // the ghost keeps the old outline
    sync(m, e);
    if (morphed) morph(m, from, d1);
    mend(m, e);
    const t1 = nest(m);
    const g1 = geo(t1);
    // Moved: restart from where it is on screen now. Unmoved: a running entrance keeps playing.
    if (
      !instant &&
      v &&
      g1 &&
      (v.some((x, i) => Math.abs(x - g1[i]!) > 0.01) || g1.some((x, i) => x !== g0?.[i]))
    ) {
      moved = glided = true;
      stop(ta);
      if (sw) fade(m, false, undefined, DATA);
      else if (t !== m) {
        // Orbit planet: glide in polar terms about the sun (the group origin), not a chord through it.
        const [[x0, y0], [x1, y1]] = [mid(v), mid(g1)];
        const f = (a: number, p: number, q: number) =>
          `rotate(${a}rad) scale(${p}) translate(${x1}px,${y1}px) scale(${q}) translate(${-x1}px,${-y1}px)`;
        const [r0, r1] = [Math.hypot(x0, y0), Math.hypot(x1, y1)];
        const o = { transformBox: "view-box" };
        run(
          t1,
          [
            {
              ...o,
              transform: f(
                Math.atan2(x1 * y0 - y1 * x0, x1 * x0 + y1 * y0),
                r0 / r1,
                v[2] / g1[2] / (r0 / r1),
              ),
            },
            { ...o, transform: f(0, 1, 1) },
          ],
          DATA,
        );
      } else
        run(t1, [{ transform: tf(g1, v) }, { transform: "none" }], {
          ...DATA,
          delay: delay(m) / 2,
        });
    } else if (shaped && !morphed && !m.matches("[data-maya=area]"))
      fade(m, false, undefined, { ...DATA, delay: delay(m) / 2 });
    if (m.localName === "text" && m.textContent !== was) count(m, was, DATA);
    const tg = pick();
    if (tg && !instant && sig(tg) !== s0)
      fade(tg, false, undefined, { ...UI, delay: glided || tg === m ? 120 : 0 });
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
  // Re-inserting a node restarts its CSS animations and a new period or direction rescales them:
  // put every orbit rotation back at the angle it had.
  for (const [t, f] of phase)
    for (const a of t.getAnimations?.() ?? []) if (orbiting(a)) seek(a, f);
}

const mold = (t: string) => t.replace(/\d/g, "0"); // same label and digit count: safe to count from the old number
const at = (e: Element) => [n(e, "x") || n(e, "x1"), n(e, "y") || n(e, "y1")] as const;
/** Labels and axes of a data update: kept nodes (matched by data-key, else by index among unkeyed ones;
 * same tag, no rotation) slide with the marks and, for value labels, count to the new number or, when the
 * digits change shape, swap as the marks land; extras fade in late; leftovers fade out. Never a dropout. */
function follow(p: Element, c: Element, late: KeyframeAnimationOptions, num: boolean): void {
  const old = [...p.children].filter((e) => !e.hasAttribute("data-ghost"));
  const key = (e: Element) => e.getAttribute("data-key");
  const byKey = new Map(old.flatMap((e) => (key(e) ? [[key(e), e] as const] : [])));
  const plain = old.filter((e) => !key(e));
  const used = new Set<Element>();
  // Interrupted: a label still sliding starts from where it is drawn, not from its old attributes.
  const shift = new Map(
    old.map((e) => [
      e,
      e.getAnimations?.().length ? new DOMMatrix(getComputedStyle(e).transform) : null,
    ]),
  );
  sync(p, c);
  for (const e of [...c.children]) {
    const k = key(e);
    const i = plain.findIndex((x) => x.textContent === e.textContent); // equal ticks glide, the rest fade
    const m = k ? byKey.get(k) : plain.splice(i, i < 0 ? 0 : 1)[0];
    if (
      !m ||
      m.localName !== e.localName ||
      m.hasAttribute("transform") ||
      e.hasAttribute("transform")
    ) {
      p.append(e);
      fade(e, false, undefined, late);
      continue; // the unmatched old node leaves below
    }
    used.add(m);
    const [x, y] = at(m);
    const kids = [...m.childNodes];
    const was = (m.querySelector("[data-v]") ?? m).textContent!;
    sync(m, e);
    m.replaceChildren(...e.childNodes);
    const t = m.querySelector("[data-v]") ?? m;
    const s = shift.get(m);
    const [dx, dy] = [x + (s?.e ?? 0) - at(m)[0], y + (s?.f ?? 0) - at(m)[1]];
    if (dx || dy)
      run(m, [{ transform: `translate(${dx}px,${dy}px)` }, { transform: "none" }], DATA);
    if (!num) continue;
    if (mold(was) === mold(t.textContent!)) count(t, was, DATA);
    else if (k && !instant) {
      // Another digit count would contradict the sort mid-flight: keep the old text until the move ends.
      const to = [...m.childNodes];
      m.replaceChildren(...kids);
      setTimeout(() => m.firstChild === kids[0] && m.replaceChildren(...to), Number(DATA.duration));
    }
  }
  for (const m of old) {
    if (used.has(m)) continue;
    retire(m);
    fade(m, true, () => m.remove(), UI);
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
  const z = !!(zoom || zm || moved);
  const late = { ...UI, delay: Number((zoom || zm ? ZOOM : DATA).duration) * 0.75 };
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
    else if (p && !zoom && !zm && /^(labels|axis-[xy])$/.test(id(c))) {
      follow(p, c, id(c) === "labels" ? late : { ...UI, delay: 160 }, id(c) === "labels");
      out.push(p);
    } else {
      if (p && fadeable(p)) (ghosts.push(p), out.push(p));
      out.push(c);
      if (p && fadeable(c)) fadeIn.push(c);
    }
  }
  for (const p of pool.values()) if (fadeable(p)) (ghosts.push(p), out.push(p));
  // Reconcile in place: re-inserting the marks group would restart every CSS animation in it (the orbit).
  for (const c of [...o.children]) out.includes(c) || c.remove();
  let ref = o.firstChild;
  for (const c of out) c === ref ? (ref = ref.nextSibling) : o.insertBefore(c, ref);
  // Start every fade after the swap: animations on template children stay pending forever in
  // WebKit and Firefox, and a ghost removed synchronously would be re-inserted by the swap.
  for (const g of ghosts) ghost(g);
  // Value labels wait for the marks to land; axes swap at once (on a drill, after the marks are under way).
  for (const c of fadeIn)
    fade(
      c,
      false,
      undefined,
      // An axisless grid (a constellation's web) crosses the old one at once: a wait would leave a gap.
      z && !(id(c) === "grid" && !w.querySelector("[data-maya^=axis]>*"))
        ? id(c) === "labels"
          ? late
          : { ...UI, delay: 160 }
        : UI,
    );
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
  stop(g.getAnimations?.());
  const d = hold ? Number(ZOOM.duration) * 0.75 : 0;
  run(g, [{ opacity: op }, { opacity: 0 }], { ...UI, delay: d, fill: "forwards" }, () =>
    g.remove(),
  );
}

/** The first draw: scaffolding fades in, marks enter by `kind`, labels and numbers follow. */
function intro(svg: Element, kind: Intro): void {
  const part = (k: string) => svg.querySelector(`:scope > [data-maya=${k}]`);
  for (const k of ["grid", "axis-y", "axis-x", "rules"]) {
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
  // Memory (spec.was): each bar grows from its ghost's box (key "%00was~" + the bar's), its label with the bar's end.
  const past = new Map<string, Box>(),
    bars = new Map<string, Element>();
  for (const e of m.children) {
    const k = e.getAttribute("data-key")!;
    if (!e.hasAttribute("data-past")) bars.set(k, e);
    else if (geo(e)) past.set(k.slice(7), geo(e)!);
  }
  const hz = svg.getAttribute("data-dir") === "h";
  for (const t of l?.children ?? []) {
    const k = t.getAttribute("data-key") ?? "",
      [p, bar] = [past.get(k), bars.get(k)],
      b = bar && geo(bar),
      i = +!hz;
    if (!p || !b) {
      fade(t, false, undefined, late);
      continue;
    }
    const d =
      hz !== bar!.hasAttribute("data-neg") ? p[i]! + p[i + 2]! - b[i]! - b[i + 2]! : p[i]! - b[i]!;
    run(
      t,
      [{ transform: `translate${hz ? "X" : "Y"}(${d}px)`, opacity: 0 }, { transform: "none" }],
      {
        ...INTRO,
        delay: delay(bar!),
      },
    );
  }
  if (l && !past.size) fade(l, false, undefined, late);
  if (kind === "wipe") {
    // Clip, not geometry: lines, areas and points are revealed together, left to right.
    const c = (r: string) => ({ clipPath: `inset(-20% ${r} -20% -1%)` });
    run(m, [c("101%"), c("-1%")], { duration: WIPE, easing: SWEEP });
  } else if (kind === "bloom") {
    const p = (svg.getAttribute("data-plot") ?? "0 0 0 0").split(" ").map(Number);
    (m as SVGElement).style.transformOrigin = `${p[0]! + p[2]! / 2}px ${p[1]! + p[3]! / 2}px`;
    run(m, [{ transform: "rotate(-24deg) scale(.82)", opacity: 0 }, { transform: "none" }], {
      duration: 1000,
      easing: EASE,
    });
  } else
    for (const e of m.children) {
      const [k, g] = [e.getAttribute("data-key")!, geo(e)];
      const p = past.get(k);
      if (e.hasAttribute("data-past")) continue; // ghosts rest
      if (e.matches("g[data-a]")) {
        fade(e, false, undefined, { ...UI, delay: SWEEP_MS - 100 }); // names wait for the planets to settle
        continue;
      }
      if (g && p)
        run(e, [{ transform: tf(g, p) }, { transform: "none" }], { ...INTRO, delay: delay(e) });
      else enter(e, undefined, INTRO);
    }
  for (const t of m.querySelectorAll("text[data-maya=mark]")) count(t, "", INTRO);
  // WebKit starts each clock at animate(), and a page of charts draws in one task: begin every
  // entrance at its first painted frame instead (the orbit's CSS rotation keeps its clock).
  requestAnimationFrame(() =>
    svg.getAnimations?.({ subtree: true }).forEach((a) => orbiting(a) || (a.currentTime = 0)),
  );
  // Orbit: each planet sweeps in its own direction, further the faster it is, and settles at rest.
  for (const g of m.querySelectorAll("g[data-v]")) {
    const a = (70 + 50 * +g.getAttribute("data-v")!) * (g.hasAttribute("data-neg") ? 1 : -1);
    run(g, [{ transform: `rotate(${a}deg)` }, { transform: "none" }], {
      duration: SWEEP_MS,
      easing: EASE,
    });
  }
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
    // A wipe or bloom animates one clip on the group, whatever the mark count.
    if (animate && opts.intro && wm && (!many || opts.intro !== "marks")) {
      lag = spread(wm);
      intro(box.firstElementChild!, opts.intro);
    }
  } else {
    instant = !!opts.instant;
    lag = wm.querySelector("[data-w]") ? 0 : spread(wm); // weave threads must meet their dots
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

/** Orbit motion on demand: the planets turn while the pointer is over the chart (theme rule on
 * `data-spin`); when it leaves they glide home the short way and the names return. */
let home = 0;
export function spin(maya: Element, on: boolean): void {
  const gs = [...maya.querySelectorAll("g[data-v]")];
  if (!gs.length || maya.hasAttribute("data-still")) return;
  const was = new Map(gs.map((g) => [g, new DOMMatrix(getComputedStyle(g).transform)]));
  const th = (g: Element) => Math.atan2(was.get(g)!.b, was.get(g)!.a); // where it is drawn, radians
  const mine = gs.flatMap((g) => g.getAnimations().filter((a) => !orbiting(a)));
  mine.forEach((a) => a.cancel()); // a sweep or a glide home in progress
  const id = ++home;
  if (on) {
    maya.setAttribute("data-spin", "");
    for (const g of gs)
      for (const a of g.getAnimations()) if (orbiting(a)) seek(a, (th(g) / (2 * Math.PI) + 1) % 1);
    return;
  }
  const land = Promise.all(
    gs.map((g) => {
      const t = th(g);
      const d = -Math.atan2(Math.sin(t), Math.cos(t));
      return g.animate?.([{ transform: `rotate(${t}rad)` }, { transform: `rotate(${t + d}rad)` }], {
        duration: 450 + 250 * Math.abs(d),
        easing: EASE,
        fill: "forwards",
      })?.finished;
    }),
  );
  land.then(
    () => {
      if (id !== home) return;
      maya.removeAttribute("data-spin");
      for (const g of gs) {
        for (const a of g.getAnimations()) if (orbiting(a)) seek(a, 0);
        g.getAnimations()
          .filter((a) => !orbiting(a))
          .forEach((a) => a.cancel());
      }
    },
    () => {},
  );
}
