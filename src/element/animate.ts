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
  /** kpi numberMotion "roll": the headline rolls digit columns instead of counting. */
  roll?: boolean | undefined;
}

let rolling = false;

let instant = false;
let lag = 0; // ms per category step of the current patch's stagger
let zoom: [number, number] | undefined; // sunburst: span of the branch the patch zooms into/out of
let cs = [0, 0]; // sunburst: old centre minus new (a drill adds or removes the crumb row)
// Drill on rect marks: P is the branch's box, F the plot. In, the view maps P onto F: children
// start inside P, everything else is pushed out. Out is the reverse.
let moved = false; // the patch moved, morphed, entered or exited a mark: labels and axes wait for it
let plot = ""; // the outgoing svg's data-plot, read before sync copies the new one
let zm: { P: Box; F: Box; G: Box; out: boolean; d: number } | undefined; // G old plot, d its drop (axes only: tiles have none to meet)
let drill = false; // this patch is a drill (opts.zoom): no stagger, marks seed from their centre, labels wait
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
  const [a, c] = zm.out === leaving ? [leaving ? zm.G : zm.F, zm.P] : [zm.P, zm.F];
  // The box glides by the crumb row: what enters on a drill in starts where the new axes do.
  const b: Box = !zm.out && !leaving ? [c[0], c[1] + zm.d, c[2], c[3]] : c;
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
export const ZOOM: KeyframeAnimationOptions = { duration: 640, easing: SWEEP };
const SWEEP_MS = 1500; // orbit entrance
const WIPE = 1100; // ms, line and area first draw
const MAX = 1500; // ponytail: no animation above this many marks
const STAGGER = 320; // total stagger spread across categories, ms
const Z = 1e-6;
/** The gauge arc and a text count-up share one clock: 1.6 x the entrance, ease-out quart. */
const tally = (o: KeyframeAnimationOptions): KeyframeAnimationOptions => ({
  duration: Number(o.duration) * 1.6,
  easing: "cubic-bezier(.25,1,.5,1)",
});
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

/** A ring's offset from the new centre, `k` = 1: where it starts; -1: where an exiting one ends. */
const sh = (k: number) => `translate(${k * cs[0]!}px,${k * cs[1]!}px)`;

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
export function mend(o: Element, w: Element): void {
  const [a, b] = [[...o.children], [...w.children]];
  if (a.length && a.length === b.length && a.every((c, i) => c.localName === b[i]!.localName))
    a.forEach((c, i) => (sync(c, b[i]!), mend(c, b[i]!)));
  else o.replaceChildren(...w.childNodes);
}

export function sync(o: Element, w: Element): void {
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
  if (e.localName === "circle" || drill) return [x + w / 2, y + h / 2, 0, 0];
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
  const hub = ring(e) && (cs[0] || cs[1]);
  if (hub && out) stop(e.getAnimations?.()); // an entrance still shifting it would add to the exit
  run(e, out ? k : k.reverse(), out ? { ...o, fill: "forwards" } : o, then);
  // The hub's shift to the common centre rides the rings' clock, not its own fade's.
  if (hub) {
    const t = [{}, { transform: sh(out ? -1 : 1) }];
    run(e, out ? t : t.reverse(), { ...ZOOM, fill: "both" });
  }
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
  if (f) run(e, [{ ...f, transform: sh(1) }, arc(e)], ZOOM);
  else if (ring(e) && e.getAttribute("data-key") === "v" && o === INTRO)
    // The gauge arc sweeps from empty in step with the centre count-up.
    run(
      e,
      [
        { strokeDasharray: "0 360", opacity: 0 },
        { strokeDasharray: e.getAttribute("stroke-dasharray") ?? "" },
      ],
      tally(o),
    );
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

function exit(e: Element, origin?: Box, from?: Keyframe): void {
  moved = true;
  gk.set(e, e.getAttribute("data-key")!);
  retire(e);
  const g = geo(e);
  const done = () => e.hasAttribute("data-ghost") && e.remove(); // revived by marks(): stays
  const o = { ...DATA, fill: "forwards" as const };
  const f = ring(e) && folded(e);
  const z = zoomed(e, g, true);
  if (f) run(e, [from!, { ...f, transform: sh(-1) }], { ...ZOOM, fill: "forwards" }, done);
  else if (z)
    // Leaving, it starts level with the new axes too (a zero d is the identity).
    run(
      e,
      [{ transform: `matrix(1,0,0,1,0,${zm!.d})` }, { transform: z, opacity: 0 }],
      { ...ZOOM, fill: "forwards" },
      done,
    );
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

function morph(m: Element, from: string, d1: string, dl = delay(m) / 2): void {
  stop(m.getAnimations?.());
  if (instant) return;
  const a = m.animate?.([{ d: from }, { d: `path("${d1}")` }], {
    ...DATA,
    delay: dl,
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
const busy = new WeakMap<Node, number>(); // per chart: performance.now() when its last count-up or text swap ends
const hold = (e: Element, t: number, r = e.getRootNode()) =>
  busy.set(r, Math.max(busy.get(r) ?? 0, t));
function count(e: Element, from: string, o: KeyframeAnimationOptions): void {
  const to = e.textContent ?? "";
  const m = NUM.exec(to);
  const f = NUM.exec(from);
  if (!m || instant || typeof requestAnimationFrame === "undefined") return;
  const num = m[0];
  // A last separator followed by other than 3 digits is the decimal mark, as is one after a
  // lone leading zero ("0.125").
  const sep = (t: string) => (/^0\D/.test(t) ? 1 : t.search(/\D\d{1,2}$|\D\d{4,}$/));
  const dp = (t: string) => (sep(t) < 0 ? 0 : t.length - sep(t) - 1);
  const dg = (t: string) => t.replace(/\D/g, "");
  // Count from the old number, rescaled to the new decimals; never from zero except on entrance.
  // A wider old number (1234 to 999) lends its template, so the count has the digits to start there.
  const fd = f ? dg(f[0]) : "";
  const nd = dg(num);
  const tok = f && fd.length > nd.length && dp(f[0]) === dp(num) ? f[0] : num;
  const ds = dg(tok);
  if (ds.length > 15) return;
  const ls = sep(tok);
  const [head, tail] = [to.slice(0, m.index), to.slice(m.index + num.length)];
  const fh = f ? from.slice(0, f.index) : "";
  // The sign ends the head and counts as part of the number, so -5 to 3 passes through 0.
  const SG = /[-−+]\s*$/;
  const neg = (h: string) => /[-−]\s*$/.test(h);
  const base = head.replace(SG, "");
  const a = Math.min(10 ** ds.length - 1, Math.round(+fd * 10 ** (dp(num) - (f ? dp(f[0]) : 0))));
  const [A, B] = [neg(fh) ? -a : a, neg(head) ? -nd : +nd];
  if (A === B) return;
  if (f && (fh.replace(SG, "") !== base || from.slice(f.index + f[0].length) !== tail)) {
    // Another unit (K to M) would contradict the number: swap once the mark has landed.
    e.textContent = from;
    hold(e, performance.now() + Number(o.duration));
    setTimeout(() => e.textContent === from && (e.textContent = to), Number(o.duration));
    return;
  }
  const shape = (k: number) => {
    const s = String(Math.abs(k)).padStart(ds.length, "0");
    let i = 0;
    const t = tok.replace(/\d/g, () => s[i++]!);
    const [int, dec] = ls < 0 ? [t, ""] : [t.slice(0, ls), t.slice(ls)];
    return (
      (k ? (k < 0 === neg(head) ? head : fh) : base) + int.replace(/^[0\D]+(?=\d)/, "") + dec + tail
    );
  };
  const ms = Number(o.duration) * 1.6,
    t0 = performance.now() + Number(o.delay ?? 0);
  const id = (counts.get(e) ?? 0) + 1;
  counts.set(e, id);
  hold(e, t0 + ms);
  let cur = shape(A);
  e.textContent = cur;
  const step = (now: number) => {
    if (counts.get(e) !== id || e.textContent !== cur) return; // a newer count or render
    const p = Math.min(1, Math.max(0, (now - t0) / ms));
    e.textContent = cur = p < 1 ? shape(Math.round(A + (B - A) * (1 - (1 - p) ** 4))) : to;
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

const rolls = new WeakMap<Element, Element>(); // the live digit columns of a headline
/*
 * numberMotion "roll" (kpi headline, key v): the text is hidden and a nested <svg data-roll> window of
 * per-character <text> stands in. A changed digit is a column: the old one and the new one a
 * line apart, translateY by one line, the units digit first. Transform and opacity only.
 */
function roll(e: Element, from: string, o: KeyframeAnimationOptions): void {
  const to = e.textContent ?? "";
  if (instant || to === from || !to || !(e as SVGTextElement).getStartPositionOfChar)
    return count(e, from, o);
  const bb = (e as SVGGraphicsElement).getBBox();
  // A nested <svg> is the window (overflow hidden, theme.ts); its viewBox keeps absolute coordinates. 2 px of air.
  const g = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  g.setAttribute("data-roll", "");
  const win = [bb.x - 2, bb.y - 2, bb.width + 4, bb.height + 4];
  for (const [k, v] of Object.entries({ x: win[0], y: win[1], width: win[2], height: win[3] }))
    g.setAttribute(k, String(v));
  g.setAttribute("viewBox", win.join(" "));
  const y = n(e, "y");
  const put = (p: Element, c: string, x: number, dy = 0) => {
    const t = e.cloneNode(false) as Element;
    for (const k of ["data-key", "data-maya", "id", "transform"]) t.removeAttribute(k);
    t.setAttribute("x", String(x));
    t.setAttribute("text-anchor", "start");
    if (dy) t.setAttribute("y", String(y + dy));
    t.textContent = c;
    p.append(t);
  };
  // Digits pair right-aligned, whatever sits between them; a column the old number lacks rolls in from blank.
  // Different decimals or suffix (1.5 to 12.25, K to M) would pair the wrong places: count instead.
  const fd = [...from].filter((c) => /\d/.test(c));
  const nd = [...to].filter((c) => /\d/.test(c)).length;
  const tail = (t: string) => {
    const m = /(\d*)(\D*)$/.exec(t)!; // digits after the last separator, then the suffix
    return m[1]!.length + m[2]!;
  };
  if (from && tail(from) !== tail(to)) return count(e, from, o);
  const cols: Element[] = [];
  let r = nd;
  [...to].forEach((c, j) => {
    const x = (e as SVGTextElement).getStartPositionOfChar(j).x;
    const old = /\d/.test(c) ? (fd[fd.length - r--] ?? "") : c;
    if (c === old) return put(g, c, x);
    const col = document.createElementNS("http://www.w3.org/2000/svg", "g");
    put(col, old, x);
    put(col, c, x, bb.height);
    g.append(col);
    cols.push(col);
  });
  // Units first, 50 ms a column, the whole cascade capped at 150 ms.
  const lag = Math.min(50, 150 / Math.max(1, cols.length - 1));
  cols.forEach((col, i) =>
    run(col, [{ transform: "none" }, { transform: `translateY(${-bb.height}px)` }], {
      ...o,
      delay: Number(o.delay ?? 0) + (cols.length - 1 - i) * lag,
      fill: "forwards",
    }),
  );
  if (!from) run(g, [{ opacity: 0 }, { opacity: 1 }], { ...o, duration: 240 });
  rolls.get(e)?.remove();
  rolls.set(e, g);
  e.setAttribute("visibility", "hidden");
  e.after(g);
  const ms = Number(o.duration) + Number(o.delay ?? 0) + 150;
  hold(e, performance.now() + ms);
  setTimeout(() => {
    if (rolls.get(e) !== g) return;
    rolls.delete(e);
    g.remove();
    e.removeAttribute("visibility");
  }, ms);
}
/** Headline numbers: count up, or roll when the patch asks for it. */
const numeric = (e: Element, from: string, o: KeyframeAnimationOptions) =>
  !e.childElementCount && // a text with tspans (a list headline) is not a bare number: writing its text would drop them
  (rolling && /^v(~|$)/.test(e.getAttribute("data-key") ?? "") ? roll : count)(e, from, o);

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
  cs = zoom && ho && hw ? [n(ho, "cx") - n(hw, "cx"), n(ho, "cy") - n(hw, "cy")] : [0, 0];
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
  for (const e of o.children) if (ring(e)) arcs.set(e, arc(e, true));
  for (const e of w.children) {
    const m = at(e.getAttribute("data-key")!);
    if (!m || m.localName !== e.localName) continue;
    const t = nest(m);
    const g = geo(t);
    // The on-screen box of an animating mark: its transform is in user units, origin 0 0 (fill-box).
    const c = g && live.get(t) && new DOMMatrix(getComputedStyle(t).transform);
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
    // Interrupting a running animation (a scrubbed slider) starts at once: no stagger.
    const dl = as.length || ta.length ? 0 : delay(m) / 2;
    if (ring(m)) {
      const from = arcs.get(m)!;
      stop(as);
      sync(m, e);
      if (!instant)
        run(
          m,
          [{ ...from, transform: sh(1) }, arc(m)],
          m.getAttribute("data-key") === "v" ? tally(DATA) : ZOOM,
        );
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
    const [x0, y0] = [n(m, "x"), n(m, "y")];
    rolls.get(m)?.remove(); // sync drops the hidden text's visibility: a stale roll window would double it
    rolls.delete(m);
    sync(m, e);
    // Keyed text (table cells on a re-sort) glides from where it stood.
    const [dx, dy] = [x0 - n(m, "x"), y0 - n(m, "y")];
    if (m.localName === "text" && (dx || dy))
      // The pager would glide through the rows entering where it stood: it fades in after them.
      m.matches("[data-maya=more]")
        ? fade(m, false, undefined, { ...DATA, delay: 120 })
        : run(m, [{ transform: `translate(${dx}px,${dy}px)` }, { transform: "none" }], DATA);
    if (morphed) morph(m, from, d1, dl);
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
          delay: dl,
        });
    } else if (shaped && !morphed && !m.matches("[data-maya=area]"))
      fade(m, false, undefined, { ...DATA, delay: dl });
    if (m.localName === "text" && m.textContent !== was) numeric(m, was, DATA);
    const tg = pick();
    if (tg && !instant && sig(tg) !== s0)
      fade(tg, false, undefined, { ...UI, delay: glided || tg === m ? 120 : 0 });
    order.push(m);
  }
  for (const m of old.values()) exit(m, origin, arcs.get(m));
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
    // Cross in place with the new text, never a gap; a keyed one (its mark left) goes with the mark.
    // A changed unkeyed label (a comparison line) leaves before its successor arrives: no two texts in one place.
    fade(
      m,
      true,
      () => m.remove(),
      key(m) ? UI : num ? { ...late, delay: Number(late.delay) - 220 } : late,
    );
    retire(m);
  }
}

/** Crossfade the non-mark children (axes, grid, labels): changed groups fade 220 ms. */
function ui(o: Element, w: Element, om: Element, wm: Element): void {
  const id = (c: Element) => c.getAttribute("data-maya") ?? c.localName;
  // Groups already fading out keep fading; they are neither pooled nor ghosted again.
  const out = [...o.children].filter((c) => c.hasAttribute("data-ghost"));
  // Facet panels (nested svgs) are diffed one by one, by their value.
  const isP = (c: Element) => c.matches("svg[data-maya=panel],svg[data-maya=expand]");
  const pid = (c: Element) =>
    c.getAttribute("data-maya")! +
    (c.getAttribute("data-facet") ?? c.getAttribute("data-row") ?? "");
  const pool = new Map(
    [...o.children].filter((c) => c !== om && !out.includes(c) && !isP(c)).map((c) => [id(c), c]),
  );
  const panels = new Map(
    [...o.children].filter((c) => isP(c) && !out.includes(c)).map((c) => [pid(c), c]),
  );
  const fadeIn: Element[] = [];
  // Sunburst: labels ghost and fade in late (as on a drill), never follow rings that sweep in angle.
  const sun = !!w.querySelector('circle[data-depth="0"]');
  const z = !!(zoom || zm || moved || sun);
  const late = { ...UI, delay: Number((zoom || drill ? ZOOM : DATA).duration) * 0.75 };
  const ghosts: Element[] = [];
  // A table row's sub-chart (svg[data-maya=expand]) sits outside the marks group, so the key diff
  // never sees it: it crossfades whole, while the rows below slide by their own keys.
  const fadeable = (c: Element) =>
    (c.localName === "g" && !/^(cross|hits)$/.test(id(c))) || id(c) === "expand";
  for (const c of [...w.children]) {
    if (c === wm) {
      out.push(om);
      continue;
    }
    if (isP(c)) {
      const q = panels.get(pid(c));
      panels.delete(pid(c));
      if (q) (panel(q, c), out.push(q));
      else (out.push(c), fadeIn.push(c));
      continue;
    }
    const p = pool.get(id(c));
    pool.delete(id(c));
    if (p && p.outerHTML === c.outerHTML) out.push(p);
    else if (p && !zoom && !drill && !sun && /^(labels|axis-[xy]|rules)$/.test(id(c))) {
      follow(
        p,
        c,
        id(c) === "labels" ? late : id(c) === "rules" ? UI : { ...UI, delay: 160 },
        id(c) === "labels",
      );
      out.push(p);
    } else {
      if (p && fadeable(p)) (ghosts.push(p), out.push(p));
      out.push(c);
      if (p && fadeable(c)) fadeIn.push(c);
    }
  }
  for (const p of pool.values()) if (fadeable(p)) (ghosts.push(p), out.push(p));
  for (const p of panels.values()) (ghosts.push(p), out.push(p));
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

/** A facet panel that stays: its marks diff by their (prefixed) keys, the rest crossfades. */
function panel(o: Element, w: Element): void {
  const [om, wm] = [o, w].map((e) => e.querySelector(":scope > [data-maya=marks]"));
  lag = !wm || drill ? 0 : spread(wm);
  const [x, y] = [n(o, "x"), n(o, "y")];
  sync(o, w);
  // The panel set changed: a panel slides from its old cell (transform on a nested svg).
  const [dx, dy] = [x - n(o, "x"), y - n(o, "y")];
  if ((dx || dy) && !instant)
    run(o, [{ transform: `translate(${dx}px,${dy}px)` }, { transform: "none" }], DATA);
  if (!om || !wm) return mend(o, w);
  sync(om, wm);
  marks(om, wm);
  ui(o, w, om, wm);
}

const FREEZE = [
  "fill",
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "opacity",
  "fill-opacity",
  "stroke-opacity",
  "font-size",
  "font-weight",
  "text-anchor",
];

/** An outgoing group: unaddressable while it fades, then removed. */
function ghost(g: Element): void {
  g.querySelector("defs")?.remove(); // a ghost never carries ids: WebKit drops the gradient while two defs share one
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
  // Unaddressable, but still painted as before: the theme rules key on data-maya, so freeze
  // what they gave (a capped read pass, then the writes).
  const ds = [...g.querySelectorAll("*")].slice(0, 600);
  const frozen = ds.map((d) => {
    const c = getComputedStyle(d);
    return FREEZE.map((k) => c.getPropertyValue(k));
  });
  g.removeAttribute("data-maya");
  for (const d of g.querySelectorAll("[data-maya]")) d.removeAttribute("data-maya");
  ds.forEach((d, i) =>
    FREEZE.forEach((k, j) => (d as SVGElement).style?.setProperty(k, frozen[i]![j]!)),
  );
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
    bars = new Map<string, Element>(),
    ticks = new Set<string>();
  for (const e of m.children) {
    const k = e.getAttribute("data-key")!;
    if (!e.hasAttribute("data-past")) bars.set(k, e);
    else if (geo(e)) {
      past.set(k.slice(7), geo(e)!);
      if (e.hasAttribute("data-tick")) ticks.add(k.slice(7));
    }
  }
  const hz = svg.getAttribute("data-dir") === "h";
  // A grouped bar's ghost is a tick: grow the bar from its baseline to the tick, not from a 2 px sliver floating off the axis.
  for (const k of ticks) {
    const [p, b] = [past.get(k)!, bars.get(k)],
      g = b && geo(b),
      i = +!hz;
    if (!g) continue;
    const [c, base] = [p[i]! + 1, hz !== b!.hasAttribute("data-neg") ? g[i]! : g[i]! + g[i + 2]!];
    past.set(
      k,
      hz
        ? [Math.min(c, base), p[1], Math.abs(c - base), p[3]]
        : [p[0], Math.min(c, base), p[2], Math.abs(c - base)],
    );
  }
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
  for (const t of m.querySelectorAll("text[data-maya=mark]")) numeric(t, "", INTRO);
  // WebKit starts each clock at animate(), and a page of charts draws in one task: begin every
  // entrance at its first painted frame instead (the orbit's CSS rotation keeps its clock).
  requestAnimationFrame(() =>
    svg.getAnimations?.({ subtree: true }).forEach((a) => orbiting(a) || (a.currentTime = 0)),
  );
  // Orbit: each planet sweeps in its own direction, further the faster it is, added on top of its
  // turn; its name sweeps back by the same angle about its own centre, so it stays upright.
  for (const g of m.querySelectorAll("g[data-v]")) {
    const a = (70 + 50 * +g.getAttribute("data-v")!) * (g.hasAttribute("data-neg") ? 1 : -1);
    const o = { duration: SWEEP_MS, easing: EASE, composite: "add" } as const;
    run(g, [{ transform: `rotate(${a}deg)` }, { transform: "rotate(0deg)" }], o);
    for (const u of g.querySelectorAll("g[data-up]"))
      run(u, [{ transform: `rotate(${-a}deg)` }, { transform: "rotate(0deg)" }], o);
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
  rolling = !!opts.roll;
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
      for (const p of box.querySelectorAll("svg[data-maya=panel]")) {
        lag = spread(p.querySelector(":scope > [data-maya=marks]") ?? p);
        intro(p, opts.intro);
      }
    }
  } else {
    instant = !!opts.instant;
    drill = !!opts.zoom; // a drill does not stagger; weave threads must meet their dots
    lag = drill || wm.querySelector("[data-w]") ? 0 : spread(wm);
    zm = undefined;
    const z = opts.zoom;
    if (z) {
      const F = (w.getAttribute("data-plot") ?? "").split(" ").map(Number) as Box;
      const [v, from] = "in" in z ? [z.in, om] : [z.out, wm];
      // Union of the branch's marks (stacked segments, dumbbell ends).
      let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
      for (const e of from.children) {
        const g = e.getAttribute("data-key")?.split("~").includes(key(v)) && geo(e);
        if (!g) continue;
        [x0, y0] = [Math.min(x0, g[0]), Math.min(y0, g[1])];
        [x1, y1] = [Math.max(x1, g[0] + g[2]), Math.max(y1, g[1] + g[3])];
      }
      // Facet: the branch is a panel, its plot box in root units.
      const pn = ("in" in z ? o : w).querySelector(
        `svg[data-maya=panel][data-facet="${CSS.escape(v)}"]`,
      );
      const pp = pn?.getAttribute("data-plot")?.split(" ").map(Number);
      if (pn && pp)
        [x0, y0, x1, y1] = [
          n(pn, "x") + pp[0]!,
          n(pn, "y") + pp[1]!,
          n(pn, "x") + pp[0]! + pp[2]!,
          n(pn, "y") + pp[1]! + pp[3]!,
        ];
      const P: Box = [x0, y0, x1 - x0, y1 - y0];
      if (P[2] > 1 && P[3] > 1 && F.length === 4 && F[2]! > 0 && F[3]! > 0) {
        // The old plot too: ghosts keep their old frame while the crumb row moves it.
        const G = (o.getAttribute("data-plot")?.split(" ").map(Number) ?? F) as Box;
        zm = { P, F, G, out: !("in" in z), d: w.querySelector("[data-maya^=axis]") ? F[1] + F[3] - G[1] - G[3] : 0 };
        // Zoomed marks may grow past the plot; keep them inside it while they move.
        const [vw, vh] = (w.getAttribute("viewBox") ?? "").split(" ").slice(2).map(Number);
        const [l, t, r, b] = [
          Math.min(F[0], G[0]),
          Math.min(F[1], G[1]),
          Math.max(F[0] + F[2], G[0] + G[2]),
          Math.max(F[1] + F[3], G[1] + G[3]),
        ];
        const clip = `inset(${t}px ${vw! - r}px ${vh! - b}px ${l}px) view-box`;
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
    drill = false;
  }
  opts.after?.(box.firstElementChild!);
}

/**
 * The card turn (kpi back): the old face rotates edge-on (0 to 90deg, 160 ms ease-in), `swap`
 * replaces it, the new one comes round (-90 to 0deg, 280 ms ease-out). Transform only. Holds
 * `settled` for the whole 440 ms. Returns a canceller; `undo` (turned back before the swap) plays
 * the first half in reverse instead of snapping flat.
 */
export function turn(box: Element, swap: () => void): (undo?: boolean) => void {
  const face = (a: number, b: number) => [
    { transform: `perspective(900px) rotateY(${a}deg)` },
    { transform: `perspective(900px) rotateY(${b}deg)` },
  ];
  hold(box, performance.now() + 440);
  const out = box.firstElementChild?.animate?.(face(0, 90), {
    duration: 160,
    easing: "ease-in",
    fill: "forwards",
  });
  let back: Animation | undefined;
  let swapped = false;
  const go = () => {
    swapped = true;
    swap();
    back = box.firstElementChild?.animate?.(face(-90, 0), { duration: 280, easing: EASE });
  };
  if (out) out.onfinish = go;
  else go();
  return (undo) => {
    if (out) out.onfinish = null;
    if (undo && out && !swapped) ((out.onfinish = () => out.cancel()), out.reverse());
    else (out?.cancel(), back?.cancel());
  };
}

const live = (root: ShadowRoot) =>
  root
    .getAnimations?.()
    .filter(
      (a) => a.playState !== "finished" && a.effect?.getComputedTiming().iterations !== Infinity,
    ) ?? []; // the orbit's endless rotation is not motion to wait for
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const wait = (root: ShadowRoot): Promise<unknown> | undefined => {
  const l = live(root),
    t = (busy.get(root) ?? 0) - performance.now();
  if (l.length || t > 0)
    return Promise.allSettled([...l.map((a) => a.finished), sleep(t)]).then(() => wait(root));
};

/** Undefined when nothing animates; else resolves when every finite animation and count-up has ended (5 s cap). */
export const idle = (root: ShadowRoot) => {
  const w = wait(root);
  return w && Promise.race([w, sleep(5000)]);
};
