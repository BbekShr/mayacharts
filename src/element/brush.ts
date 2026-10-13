/*
 * Parallel brush. Same reduce/mount contract as zoom.ts.
 * Drag on an axis rect `[data-maya=axis][data-field][data-yd="lo hi"]` (top = hi) sets that axis'
 * range in view.brush; a click without a drag clears it; Escape clears all (priority after
 * selection, before the zoom window). Ranges on several axes combine (AND) in core.
 * Without dragging (WCAG 2.5.7): click once on an unbrushed axis to mark one end, click again
 * for the other; Escape drops the first end. Keyboard (2.1.1): axis strips are sliders set after
 * paint; Up/Down move the range a tenth of the axis, Shift+Up/Down grow/shrink it, Delete clears.
 */
import { t } from "../core/strings.ts";
import type { Handlers, Host, SpecEvent, State } from "../core/types.ts";
import { listen } from "./listen.ts";

export type BrushEvent =
  | { type: "brush"; field: string; lo: number; hi: number }
  | { type: "clear"; field?: string }
  | { type: "nudge"; field: string; dom: [number, number]; dir: 1 | -1; grow: boolean }
  | SpecEvent;

export const reduce = (s: State, e: BrushEvent): State => {
  const cur = s.view.brush ?? [];
  let next = cur;
  if (e.type === "brush")
    next = [
      ...cur.filter((b) => b[0] !== e.field),
      [e.field, Math.min(e.lo, e.hi), Math.max(e.lo, e.hi)],
    ];
  else if (e.type === "nudge") {
    const [d0, d1] = e.dom,
      st = (d1 - d0) / 10,
      c = cur.find((b) => b[0] === e.field);
    let [a, b] = c ? [c[1], c[2]] : e.dir > 0 ? [d1 - 2 * st, d1] : [d0, d0 + 2 * st];
    if (c && e.grow) {
      [a, b] = [a - e.dir * st, b + e.dir * st];
      if (b - a < st) [a, b] = [(a + b - st) / 2, (a + b + st) / 2];
    } else if (c) [a, b] = [a + e.dir * st, b + e.dir * st];
    const w = Math.min(b - a, d1 - d0);
    a = Math.min(Math.max(a, d0), d1 - w);
    return reduce(s, {
      type: "brush",
      field: e.field,
      lo: +a.toPrecision(12),
      hi: +(a + w).toPrecision(12),
    });
  } else if (e.type === "clear") next = e.field ? cur.filter((b) => b[0] !== e.field) : [];
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
  let pend: { f: number; field: string; el: SVGRectElement } | undefined;
  const unpend = () => (pend?.el.remove(), (pend = undefined));
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
      unpend();
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
    if (!dragged) {
      const f = frac(d, e),
        was = pend?.el.isConnected && pend.field === field ? pend.f : undefined;
      const [lo = 0, hi = 1] = num(d.ax.getAttribute("data-yd"));
      const v = (g: number) => hi - g * (hi - lo);
      const had = s.view.brush?.some((b) => b[0] === field);
      unpend();
      if (had || was !== undefined)
        return void host.commit(
          reduce(
            s,
            had ? { type: "clear", field } : { type: "brush", field, lo: v(f), hi: v(was!) },
          ),
          null,
        );
      // First end of a click-click range: the same rect as a drag, hairline thin.
      const [x, y, w, h] = ["x", "y", "width", "height"].map((k) => d.ax.getAttribute(k)!) as [
        string,
        string,
        string,
        string,
      ];
      const el = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      el.setAttribute("data-maya", "brush");
      el.setAttribute("x", x);
      el.setAttribute("width", w);
      el.setAttribute("y", String(+y + f * +h));
      el.setAttribute("height", "1");
      d.svg.append(el);
      return void (pend = { f, field, el });
    }
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
  const key = (ev: Event) => {
    const e = ev as KeyboardEvent,
      ax = (e.target as Element).closest?.("[data-maya=axis][data-field]");
    if (!ax || e.altKey || e.ctrlKey || e.metaKey) return;
    const field = ax.getAttribute("data-field")!,
      up = e.key === "ArrowUp";
    if (up || e.key === "ArrowDown") {
      const [d0 = 0, d1 = 1] = num(ax.getAttribute("data-yd"));
      host.commit(
        reduce(host.state(), {
          type: "nudge",
          field,
          dom: [d0, d1],
          dir: up ? 1 : -1,
          grow: e.shiftKey,
        }),
        null,
      );
    } else if (e.key === "Delete" || e.key === "Backspace")
      host.commit(reduce(host.state(), { type: "clear", field }), null);
    else return;
    e.preventDefault();
    e.stopPropagation(); // the tooltip's arrows walk the marks
  };
  const off = listen(
    root,
    ["keydown", key, { capture: true }],
    ["pointerdown", onDown],
    ["pointermove", onMove],
    ["pointerup", onUp],
    ["pointercancel", stop],
  );
  return {
    cancel() {
      if (!band && !pend) return false;
      stop();
      unpend();
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
      if (!pend?.el.isConnected) pend = undefined;
      if (spec?.brush)
        for (const ax of root.querySelectorAll("[data-maya=axis][data-field]")) {
          const f = ax.getAttribute("data-field")!,
            [d0, d1] = num(ax.getAttribute("data-yd")),
            [, a = d0!, b = d1!] = host.state().view.brush?.find((r) => r[0] === f) ?? [];
          ax.setAttribute("tabindex", "0");
          ax.setAttribute("role", "slider");
          ax.setAttribute("aria-orientation", "vertical");
          ax.setAttribute(
            "aria-label",
            spec.titles && Object.hasOwn(spec.titles, f) ? spec.titles[f]! : f,
          );
          ax.setAttribute("aria-valuemin", String(d0));
          ax.setAttribute("aria-valuemax", String(d1));
          ax.setAttribute("aria-valuenow", String(b));
          ax.setAttribute("aria-valuetext", `${+a.toPrecision(4)} \u2013 ${+b.toPrecision(4)}`);
        }
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
