const OPTS: KeyframeAnimationOptions = { duration: 280, easing: "cubic-bezier(.2,.6,.2,1)" };
const n = (e: Element, k: string) => +(e.getAttribute(k) ?? 0);
const Z = 1e-6;

function sync(o: Element, w: Element): void {
  for (const a of [...o.attributes]) if (!w.hasAttribute(a.name)) o.removeAttribute(a.name);
  for (const a of [...w.attributes]) o.setAttribute(a.name, a.value);
}

function enter(e: Element, out: boolean, fill?: FillMode): Animation {
  const from = e.hasAttribute("data-neg")
    ? "scale(1,0)"
    : `translate(0,${n(e, "height")}px) scale(1,0)`;
  const k = [
    { transform: from, opacity: 0 },
    { transform: "none", opacity: 1 },
  ];
  return e.animate(out ? k.reverse() : k, fill ? { ...OPTS, fill } : OPTS);
}

function marks(o: Element, w: Element): void {
  const old = new Map<string, Element>();
  for (const e of o.querySelectorAll("[data-key]")) old.set(e.getAttribute("data-key")!, e);
  const order: Element[] = [];
  for (const e of [...w.children]) {
    const k = e.getAttribute("data-key")!;
    const m = old.get(k);
    if (!m) {
      order.push(e);
      continue;
    }
    old.delete(k);
    const [x, y, W, H] = ["x", "y", "width", "height"].map((a) => n(m, a)) as [
      number,
      number,
      number,
      number,
    ];
    sync(m, e);
    const dx = x - n(m, "x"),
      dy = y - n(m, "y");
    const sx = Math.max(W, Z) / Math.max(n(m, "width"), Z),
      sy = Math.max(H, Z) / Math.max(n(m, "height"), Z);
    m.animate(
      [{ transform: `translate(${dx}px,${dy}px) scale(${sx},${sy})` }, { transform: "none" }],
      OPTS,
    );
    order.push(m);
  }
  for (const m of old.values()) {
    m.removeAttribute("data-key");
    enter(m, true, "forwards").addEventListener("finish", () => m.remove());
  }
  let ref = o.firstElementChild;
  for (const m of order) {
    while (ref && ref !== m && !ref.hasAttribute("data-key")) ref = ref.nextElementSibling;
    if (ref === m) ref = ref.nextElementSibling;
    else {
      const fresh = !m.isConnected;
      o.insertBefore(m, ref);
      if (fresh) enter(m, false);
    }
  }
}

export function patch(box: Element, html: string, animate: boolean): void {
  const t = document.createElement("template");
  t.innerHTML = html;
  const w = t.content.firstElementChild!;
  const o = box.firstElementChild;
  const om = o?.querySelector(":scope > [data-maya=marks]");
  const wm = w.querySelector(":scope > [data-maya=marks]");
  if (!animate || !o || !om || !wm) return box.replaceChildren(w);
  sync(o, w);
  marks(om, wm);
  o.replaceChildren(...[...w.children].map((c) => (c === wm ? om : c)));
}
