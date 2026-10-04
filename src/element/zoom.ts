/*
 * Zoom (T10d). Same reduce/mount contract as measure.ts.
 * Drag draws `[data-maya=brush]`; release sets view.window; Reset chip (`.maya-reset`),
 * double-click and Escape restore. Escape priority: cancel() = brush in progress (2),
 * escape() = window (4). Persistence: resets when drill or x change; clamps to category count.
 */
import { t } from "../core/strings.ts";
import type { Handlers, Host, SpecEvent, State, View } from "../core/types.ts";

type Win = NonNullable<View["window"]>;
export type ZoomEvent = { type: "zoom"; window: Win } | { type: "reset" } | SpecEvent;

const clear = (s: State): State => {
  if (!s.view.window) return s;
  const { window: _w, ...view } = s.view;
  return { ...s, view };
};

export const reduce = (s: State, e: ZoomEvent): State => {
  if (e.type === "zoom") {
    const w = e.window;
    if (w.length === 2) {
      const i0 = Math.max(0, Math.trunc(Math.min(w[0], w[1])));
      const i1 = Math.max(i0, Math.trunc(Math.max(w[0], w[1])));
      return { ...s, view: { ...s.view, window: [i0, i1] } };
    }
    const [a, b, c, d] = w;
    return {
      ...s,
      view: { ...s.view, window: [Math.min(a, b), Math.max(a, b), Math.min(c, d), Math.max(c, d)] },
    };
  }
  if (e.type === "reset") return clear(s);
  const { prev, next } = e;
  if (
    prev &&
    (prev.type !== next.type ||
      prev.x !== next.x ||
      JSON.stringify(prev.path) !== JSON.stringify(next.path))
  )
    return clear(s);
  return s;
};

const MIN_START = 4; // px of movement before a brush starts (tooltip taps stay < 4)
const MIN_SPAN = 2; // px a brush must span to commit
const NS = "http://www.w3.org/2000/svg";
const num = (s: string | null): number[] => (s ?? "").trim().split(/\s+/).map(Number);
const fmt = (n: number) => String(+n.toPrecision(4));

export const mount = (host: Host): Handlers => {
  const { root } = host;
  let down: { id: number; x: number; y: number; svg: SVGSVGElement } | undefined;
  let brush: SVGRectElement | undefined;
  let lastSaid = "";
  let lastDrill = JSON.stringify(host.state().view.drill);

  const svgOf = (e: Event) =>
    (e.target as Element | null)?.closest?.("svg.maya-svg") as SVGSVGElement | null;
  const geom = (svg: SVGSVGElement) => {
    const r = svg.getBoundingClientRect();
    const vb = num(svg.getAttribute("viewBox"));
    const k = r.width ? (vb[2] ?? r.width) / r.width : 1;
    const ky = r.height ? (vb[3] ?? r.height) / r.height : 1;
    const [px = 0, py = 0, pw = 1, ph = 1] = num(svg.getAttribute("data-plot"));
    return { r, k, ky, px, py, pw, ph, vx: vb[0] ?? 0, vy: vb[1] ?? 0 };
  };
  const clampTo = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

  const stopBrush = () => {
    brush?.remove();
    brush = undefined;
    down = undefined;
  };

  /** Pointer position in viewBox units, clamped to the plot box. */
  const at = (svg: SVGSVGElement, e: PointerEvent) => {
    const g = geom(svg);
    return {
      g,
      x: clampTo((e.clientX - g.r.left) * g.k + g.vx, g.px, g.px + g.pw),
      y: clampTo((e.clientY - g.r.top) * g.ky + g.vy, g.py, g.py + g.ph),
    };
  };
  const bandMode = (svg: SVGSVGElement) => !svg.hasAttribute("data-xd");

  const draw = (svg: SVGSVGElement, a: { x: number; y: number }, b: { x: number; y: number }) => {
    const g = geom(svg);
    if (!brush || brush.ownerSVGElement !== svg) {
      brush?.remove();
      brush = document.createElementNS(NS, "rect") as SVGRectElement;
      brush.setAttribute("data-maya", "brush");
      brush.setAttribute("width", "1");
      brush.setAttribute("height", "1");
      brush.style.pointerEvents = "none";
      brush.style.transformOrigin = "0 0";
      svg.append(brush);
    }
    const band = bandMode(svg);
    const x = Math.min(a.x, b.x),
      w = Math.abs(a.x - b.x);
    const y = band ? g.py : Math.min(a.y, b.y),
      h = band ? g.ph : Math.abs(a.y - b.y);
    brush.style.transform = `matrix(${w},0,0,${h},${x},${y})`;
  };

  let start: { x: number; y: number } | undefined;

  const onDown = (ev: Event) => {
    const e = ev as PointerEvent;
    const svg = svgOf(e);
    if (!svg || !host.spec()?.zoom) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (e.isPrimary === false) return;
    stopBrush();
    svg.style.touchAction = "pan-y";
    down = { id: e.pointerId, x: e.clientX, y: e.clientY, svg };
    start = at(svg, e);
  };

  const onMove = (ev: Event) => {
    const e = ev as PointerEvent;
    if (!down || e.pointerId !== down.id || !start) return;
    if (!brush && Math.hypot(e.clientX - down.x, e.clientY - down.y) < MIN_START) return;
    if (!brush) {
      try {
        down.svg.setPointerCapture(e.pointerId);
      } catch {
        /* capture is best-effort */
      }
    }
    draw(down.svg, start, at(down.svg, e));
  };

  const swallowClick = () => {
    const eat = (c: Event) => c.stopPropagation();
    root.addEventListener("click", eat, { capture: true, once: true });
    setTimeout(() => root.removeEventListener("click", eat, { capture: true }), 0);
  };

  const onUp = (ev: Event) => {
    const e = ev as PointerEvent;
    if (!down || e.pointerId !== down.id || !start) return;
    const { svg } = down;
    const began = !!brush;
    const a = start;
    const b = at(svg, e);
    const g = b.g;
    try {
      svg.releasePointerCapture(e.pointerId);
    } catch {
      /* not captured */
    }
    stopBrush();
    start = undefined;
    if (!began) return;
    swallowClick();
    const band = bandMode(svg);
    const spanX = Math.abs(a.x - b.x) / g.k,
      spanY = Math.abs(a.y - b.y) / g.ky;
    if (band ? spanX < MIN_SPAN : spanX < MIN_SPAN || spanY < MIN_SPAN) return;
    const s = host.state();
    if (band) {
      const n = Math.max(1, +(svg.getAttribute("data-n") ?? 1));
      const off = s.view.window?.[0] ?? 0;
      const idx = (x: number) => clampTo(Math.floor(((x - g.px) / g.pw) * n), 0, n - 1);
      const i0 = idx(Math.min(a.x, b.x)),
        i1 = idx(Math.max(a.x, b.x));
      host.commit(reduce(s, { type: "zoom", window: [off + i0, off + i1] }), null);
    } else {
      const xd = num(svg.getAttribute("data-xd")),
        yd = num(svg.getAttribute("data-yd"));
      const vx = (x: number) => xd[0]! + ((x - g.px) / g.pw) * (xd[1]! - xd[0]!);
      const vy = (y: number) => yd[1]! - ((y - g.py) / g.ph) * (yd[1]! - yd[0]!);
      host.commit(reduce(s, { type: "zoom", window: [vx(a.x), vx(b.x), vy(a.y), vy(b.y)] }), null);
    }
  };

  const reset = (): boolean => {
    const s = host.state();
    if (!s.view.window) return false;
    host.commit(reduce(s, { type: "reset" }), null);
    return true;
  };

  const onClick = (e: Event) => {
    if ((e.target as Element).closest(".maya-reset")) reset();
  };
  const onDbl = (e: Event) => {
    if (svgOf(e)) reset();
  };

  root.addEventListener("pointerdown", onDown);
  root.addEventListener("pointermove", onMove);
  root.addEventListener("pointerup", onUp);
  const onCancel = () => {
    stopBrush();
    start = undefined;
  };
  root.addEventListener("pointercancel", onCancel);
  root.addEventListener("click", onClick);
  root.addEventListener("dblclick", onDbl);

  return {
    cancel() {
      if (!brush) return false;
      stopBrush();
      start = undefined;
      return true;
    },
    escape: reset,
    painted() {
      const s = host.state();
      const spec = host.spec();
      const w = s.view.window;
      const drill = JSON.stringify(s.view.drill);
      const drilled = drill !== lastDrill;
      lastDrill = drill;
      if (w && drilled) return void reset();
      const svg = root.querySelector<SVGSVGElement>("svg.maya-svg");
      if (svg && spec?.zoom) svg.style.touchAction = "pan-y";
      const box = root.querySelector(".maya-box");
      let chip = box?.querySelector<HTMLButtonElement>(".maya-reset") ?? null;
      if (!w || !spec) {
        chip?.remove();
        lastSaid = "";
        return;
      }
      if (box && !chip) {
        chip = document.createElement("button");
        chip.type = "button";
        chip.className = "maya-reset";
        chip.setAttribute("data-focus", "reset");
        box.append(chip);
      }
      if (chip) chip.textContent = t(spec, "reset");
      const key = w.join(",");
      if (key === lastSaid) return;
      lastSaid = key;
      if (w.length === 4) host.announce(t(spec, "zoomedTo", fmt(w[0]), fmt(w[1])));
      else {
        const xs = [...root.querySelectorAll("[data-maya=mark][data-x]")].map((m) =>
          m.getAttribute("data-x")!,
        );
        if (xs.length) host.announce(t(spec, "zoomedTo", xs[0]!, xs[xs.length - 1]!));
      }
    },
    off() {
      stopBrush();
      root.removeEventListener("pointerdown", onDown);
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerup", onUp);
      root.removeEventListener("pointercancel", onCancel);
      root.removeEventListener("click", onClick);
      root.removeEventListener("dblclick", onDbl);
    },
  };
};
