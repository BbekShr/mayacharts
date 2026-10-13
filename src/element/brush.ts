/*
 * Parallel brush. Same reduce/mount contract as zoom.ts.
 * Drag on an axis rect `[data-maya=axis][data-field][data-yd="lo hi"]` (top = hi) sets that axis'
 * range in view.brush; a click without a drag clears it; Escape clears all (priority after
 * selection, before the zoom window). Ranges on several axes combine (AND) in core.
 */
import { t } from "../core/strings.ts";
import type { Handlers, Host, SpecEvent, State } from "../core/types.ts";
import { listen } from "./listen.ts";

export type BrushEvent =
  | { type: "brush"; field: string; lo: number; hi: number }
  | { type: "clear"; field?: string }
  | SpecEvent;

export const reduce = (s: State, e: BrushEvent): State => {
  const cur = s.view.brush ?? [];
  let next = cur;
  if (e.type === "brush")
    next = [
      ...cur.filter((b) => b[0] !== e.field),
      [e.field, Math.min(e.lo, e.hi), Math.max(e.lo, e.hi)],
    ];
  else if (e.type === "clear") next = e.field ? cur.filter((b) => b[0] !== e.field) : [];
  else if (!e.next.brush || (e.prev && (e.prev.type !== e.next.type || e.prev.x !== e.next.x)))
    next = [];
  if (next === cur || (!next.length && !cur.length)) return s;
  const { brush: _, ...view } = s.view;
  return { ...s, view: next.length ? { ...view, brush: next } : view };
};

const MIN = 4; // px of movement before a press is a drag
const num = (s: string | null) => (s ?? "").trim().split(/\s+/).map(Number);
const clamp = (v: number) => Math.min(1, Math.max(0, v));

export const mount = (host: Host): Handlers => {
  const { root } = host;
  let down: { id: number; x: number; y: number; svg: SVGSVGElement; ax: Element } | undefined;
  let band: SVGRectElement | undefined;
  let said = JSON.stringify(host.state().view.brush ?? []);

  const stop = () => {
    band?.remove();
    band = down = undefined;
  };
  /** Pointer height on the axis rect: 0 at its top, 1 at its bottom. */
  const frac = (d: NonNullable<typeof down>, e: PointerEvent) => {
    const r = d.svg.getBoundingClientRect();
    const [, vy = 0, , vh = r.height] = num(d.svg.getAttribute("viewBox"));
    const [y, h] = ["y", "height"].map((k) => +d.ax.getAttribute(k)!) as [number, number];
    return clamp(((e.clientY - r.top) * (r.height ? vh / r.height : 1) + vy - y) / h);
  };
  const onDown = (ev: Event) => {
    const e = ev as PointerEvent;
    const ax = (e.target as Element).closest?.("[data-maya=axis][data-field]");
    const svg = ax?.closest("svg");
    if (!ax || !svg || !host.spec()?.brush || e.isPrimary === false) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    stop();
    down = { id: e.pointerId, x: e.clientX, y: e.clientY, svg, ax };
  };
  const onMove = (ev: Event) => {
    const e = ev as PointerEvent;
    if (!down || e.pointerId !== down.id) return;
    if (!band && Math.hypot(e.clientX - down.x, e.clientY - down.y) < MIN) return;
    const { svg, ax } = down;
    if (!band) {
      try {
        svg.setPointerCapture(e.pointerId);
      } catch {
        /* capture is best-effort */
      }
      band = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      band.setAttribute("data-maya", "brush");
      svg.append(band);
    }
    const y = +ax.getAttribute("y")!,
      h = +ax.getAttribute("height")!;
    const a = frac(down, { clientY: down.y } as PointerEvent),
      b = frac(down, e);
    band.setAttribute("x", ax.getAttribute("x")!);
    band.setAttribute("width", ax.getAttribute("width")!);
    band.setAttribute("y", String(y + Math.min(a, b) * h));
    band.setAttribute("height", String(Math.abs(a - b) * h));
  };
  const onUp = (ev: Event) => {
    const e = ev as PointerEvent;
    if (!down || e.pointerId !== down.id) return;
    const d = down;
    const dragged = !!band;
    try {
      d.svg.releasePointerCapture(e.pointerId);
    } catch {
      /* not captured */
    }
    stop();
    const field = d.ax.getAttribute("data-field")!;
    const s = host.state();
    if (!dragged) return void host.commit(reduce(s, { type: "clear", field }), null);
    // The click that follows a drag would clear the selection: eat it.
    const eat = (c: Event) => c.stopPropagation();
    root.addEventListener("click", eat, { capture: true, once: true });
    setTimeout(() => root.removeEventListener("click", eat, { capture: true }), 0);
    const [lo = 0, hi = 1] = num(d.ax.getAttribute("data-yd"));
    const v = (f: number) => hi - f * (hi - lo);
    host.commit(
      reduce(s, {
        type: "brush",
        field,
        lo: v(frac(d, e)),
        hi: v(frac(d, { clientY: d.y } as PointerEvent)),
      }),
      null,
    );
  };
  const off = listen(
    root,
    ["pointerdown", onDown],
    ["pointermove", onMove],
    ["pointerup", onUp],
    ["pointercancel", stop],
  );
  return {
    cancel() {
      if (!band) return false;
      stop();
      return true;
    },
    escape() {
      const s = host.state();
      if (!s.view.brush) return false;
      host.commit(reduce(s, { type: "clear" }), null);
      return true;
    },
    painted() {
      const spec = host.spec();
      const key = JSON.stringify(host.state().view.brush ?? []);
      if (!spec || key === said) return;
      const was = said;
      said = key;
      if (key === "[]") return was !== "[]" ? host.announce(t(spec, "brushCleared")) : undefined;
      const lines = root.querySelectorAll("[data-maya=line]");
      host.announce(
        t(
          spec,
          "brushed",
          lines.length - root.querySelectorAll("[data-maya=line][data-off]").length,
          lines.length,
        ),
      );
    },
    off() {
      stop();
      off();
    },
  };
};
