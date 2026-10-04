const a = (e: Element, k: string) => e.getAttribute(k) ?? "";
const h = (t: string, txt = "", at: Record<string, string> = {}) => {
  const e = document.createElement(t);
  e.textContent = txt;
  for (const k in at) e.setAttribute(k, at[k]!);
  return e;
};
const SEL = "[data-maya=hit],[data-maya=mark]";

export function tooltip(root: ShadowRoot, on: () => boolean): [off: () => void, hide: () => void] {
  const q = (s: string) => root.querySelector<HTMLElement>(s)!;
  const box = q(".maya-box"),
    tip = q(".maya-tip"),
    probe = q(".maya-probe"),
    host = root.host;
  const anchored = !!globalThis.CSS?.supports?.("anchor-name: --x");
  const marks = () => [...box.querySelectorAll("[data-maya=mark][data-key]")];
  let cur: Element | undefined,
    open = false,
    pin = false,
    kb = false;

  const hide = () => {
    cur?.removeAttribute("data-active");
    cur = undefined;
    pin = false;
    if (open) (tip.hidePopover(), (open = false));
  };

  const markOf = (t: EventTarget | null | undefined) => {
    const e = (t as Element | null)?.closest?.(SEL);
    return e && a(e, "data-maya") === "hit"
      ? marks().find((m) => a(m, "data-key") === a(e, "data-key"))
      : e;
  };

  const show = (m: Element) => {
    cur?.removeAttribute("data-active");
    cur = m;
    m.setAttribute("data-active", "");
    const c = a(m, "data-c");
    tip.replaceChildren(
      h("b", a(m, "data-x")),
      ...marks()
        .filter((k) => a(k, "data-c") === c)
        .map((k) => {
          const row = h("div", "", k === m ? { "data-on": "" } : {});
          const s = a(k, "data-series");
          if (s) row.append(h("i", "", { "data-s": a(k, "data-s") }), h("span", s));
          row.append(h("span", a(k, "data-f")));
          return row;
        }),
    );
    // The probe's containing block is the host's padding box (:host is position:relative).
    const r = m.getBoundingClientRect(),
      p = host.getBoundingClientRect();
    Object.assign(probe.style, {
      left: r.left - p.left - host.clientLeft + "px",
      top: r.top - p.top - host.clientTop + "px",
      width: r.width + "px",
      height: r.height + "px",
    });
    if (!open) (tip.showPopover(), (open = true));
    if (!anchored) {
      const t = tip.getBoundingClientRect(),
        w = globalThis.visualViewport?.width ?? innerWidth;
      let y = r.top - t.height - 8;
      if (y < 8) y = r.bottom + 8;
      const x = Math.min(Math.max(r.left + r.width / 2 - t.width / 2, 8), w - t.width - 8);
      Object.assign(tip.style, { position: "fixed", left: x + "px", top: y + "px" });
    }
  };

  const move = (e: Event) => {
    kb = false;
    if (!on() || (e as PointerEvent).pointerType !== "mouse") return;
    const m = markOf(e.target);
    if (!m) hide();
    else if (m !== cur) show(m);
  };
  const down = (e: Event) => {
    kb = false;
    const m = on() && (e as PointerEvent).pointerType !== "mouse" && markOf(e.target);
    if (m) show(m);
  };
  const outside = (e: Event) => {
    const p = e.composedPath();
    if (!p.includes(box) || !markOf(p[0])) hide();
  };
  const leave = (e: Event) => (e as PointerEvent).pointerType === "mouse" && hide();
  const key = (e: Event) => {
    const k = (e as KeyboardEvent).key;
    if (!on()) return;
    kb = true;
    if (k === "Escape") return hide();
    const ms = marks();
    const i = cur ? ms.indexOf(cur) : -1;
    let next: Element | undefined;
    if (k === "Enter" || k === " ") {
      next = cur ?? ms[0];
      if (!next) return;
      pin = !pin;
      if (pin) show(next);
    } else if (k.startsWith("Arrow")) {
      const d = k === "ArrowRight" || k === "ArrowDown" ? 1 : -1;
      if (i < 0) next = ms[0];
      else if (k === "ArrowUp" || k === "ArrowDown") {
        const c = a(ms[i]!, "data-c");
        next = ms.filter((m) => a(m, "data-c") === c)[
          ms.filter((m) => a(m, "data-c") === c).indexOf(ms[i]!) + d
        ];
      } else {
        const cs = [...new Set(ms.map((m) => a(m, "data-c")))];
        const c = cs[cs.indexOf(a(ms[i]!, "data-c")) + d];
        const g = ms.filter((m) => a(m, "data-c") === c);
        next = g.find((m) => a(m, "data-s") === a(ms[i]!, "data-s")) ?? g[0];
      }
      if (next) show(next);
    } else return;
    (e as KeyboardEvent).preventDefault();
  };
  const blur = () => pin || hide();

  const on_: [EventTarget, string, EventListener, AddEventListenerOptions?][] = [
    [box, "pointerover", move],
    [box, "pointermove", move],
    [box, "pointerdown", down],
    [box, "pointerleave", leave],
    [box, "keydown", key],
    [box, "focusout", blur],
    [document, "pointerdown", outside, { capture: true }],
    // Focusing the chart can scroll it into view; that must not close a keyboard tooltip.
    [window, "scroll", () => kb || hide(), { capture: true, passive: true }],
  ];
  for (const [t, n, f, o] of on_) t.addEventListener(n, f, o);
  return [() => (hide(), on_.forEach(([t, n, f, o]) => t.removeEventListener(n, f, o))), hide];
}
