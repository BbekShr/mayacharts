/*
 * Selection (T10c). Same reduce/mount contract as measure.ts.
 * Click/Enter/legend toggles a Sel (raw values); `data-selected` re-applied in painted();
 * Escape (priority 3) clears. Persistence: clears when type/x/path change (or drill changes),
 * else unmatched keys are inert. In select mode maya-chart's own legend handler stands down.
 */
import { t } from "../core/strings.ts";
import type { Handlers, Host, Sel, SpecEvent, State } from "../core/types.ts";

export type SelectEvent =
  { type: "toggle"; sel: Sel; multi: boolean } | { type: "clear" } | SpecEvent;

const same = (a: Sel, b: Sel) => JSON.stringify(a) === JSON.stringify(b);
const FIELDS = ["x", "series", "name"] as const;
const dec = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

export function reduce(s: State, e: SelectEvent): State {
  if (e.type === "clear") return s.selected.length ? { ...s, selected: [] } : s;
  if (e.type === "spec") {
    const p = e.prev;
    if (!p || !s.selected.length) return s;
    const n = e.next;
    const moved =
      p.type !== n.type || p.x !== n.x || JSON.stringify(p.path) !== JSON.stringify(n.path);
    return moved ? { ...s, selected: [] } : s;
  }
  if (e.type !== "toggle") return s;
  const had = s.selected.some((q) => same(q, e.sel));
  const selected = e.multi
    ? had
      ? s.selected.filter((q) => !same(q, e.sel))
      : [...s.selected, e.sel]
    : had && s.selected.length === 1
      ? []
      : [e.sel];
  return { ...s, selected };
}

/** Raw-value Sel of a mark, decoded from its data-key (`S~C`, scatter `S~name`, `h~…`). */
export function selOf(mark: Element, type?: string): Sel | undefined {
  const key = mark.getAttribute("data-key");
  if (!key) return;
  const p = key.split("~").map(dec);
  if (p[0] === "h") return { name: p[p.length - 1] };
  if (p.length !== 2) return; // line/area paths, sankey, hexmap: not selectable
  const sel: Sel = {};
  if (p[0]) sel.series = p[0];
  if (type === "scatter") sel.name = p[1];
  else sel.x = p[1];
  return sel;
}

/** A Sel matches a mark when every field it names equals the mark's (compared as text). */
export function matches(sel: Sel, mark: Element, type?: string): boolean {
  const m = selOf(mark, type);
  if (!m) return false;
  return FIELDS.every((f) => sel[f] === undefined || String(sel[f]) === String(m[f]));
}

export function mount(host: Host): Handlers {
  const { root } = host;
  const type = () => host.spec()?.type;
  const pick = (sel: Sel, target: Element | null) => {
    const spec = host.spec();
    if (!spec?.select) return;
    const next = reduce(host.state(), { type: "toggle", sel, multi: spec.select === "multi" });
    const y = target?.getAttribute("data-y") ?? "";
    host.commit(next, target ? { ...sel, value: y !== "" && !isNaN(+y) ? +y : y } : null);
    const n = next.selected.length;
    host.announce(n ? t(spec, "selected", n) : t(spec, "selectionCleared"));
  };
  const onClick = (e: Event) => {
    const spec = host.spec();
    if (!spec?.select) return;
    const el = e.target as Element;
    const b = el.closest("[data-maya=legend] button");
    if (b) {
      const k = b.getAttribute("data-key");
      if (k) pick({ series: k }, null);
      return;
    }
    let m = el.closest("[data-maya=mark],[data-maya=hit]");
    // Scatter and beeswarm have no hit shapes: the tooltip's nearest-point pick (within 12 px) is the target.
    if (!m && /^(scatter|beeswarm)$/.test(type() ?? ""))
      m = root.querySelector("[data-maya=mark][data-active]");
    if (m && !m.getAttribute("data-key")) {
      // keyless band hit (line/area): the category's first keyed mark
      const c = m.getAttribute("data-c");
      m = c === null ? null : root.querySelector(`[data-maya=mark][data-key][data-c="${c}"]`);
    }
    const sel = m && selOf(m, type());
    if (m && sel) pick(sel, m);
  };
  root.addEventListener("click", onClick);
  return {
    escape() {
      if (!host.state().selected.length) return false;
      host.commit(reduce(host.state(), { type: "clear" }));
      host.announce(t(host.spec() ?? {}, "selectionCleared"));
      return true;
    },
    enter(mark) {
      const sel = selOf(mark, type());
      if (!host.spec()?.select || !sel) return false;
      pick(sel, mark);
      return true;
    },
    painted() {
      const sel = host.state().selected;
      for (const m of root.querySelectorAll("[data-maya=mark][data-key]"))
        if (sel.some((q) => matches(q, m, type()))) m.setAttribute("data-selected", "");
        else m.removeAttribute("data-selected");
    },
    off: () => root.removeEventListener("click", onClick),
  };
}
