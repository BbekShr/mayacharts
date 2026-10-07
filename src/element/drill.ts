/*
 * Drill (T10b). Same reduce/mount contract as measure.ts.
 * Click/Enter on a mark pushes its branch (a sunburst slice: every level down to it); the
 * sunburst centre, a click on empty chart space (unless `drillOut: false`), breadcrumb
 * (Parts.crumbs, `.maya-crumbs`), Back and Escape (priority 5) pop. Persistence: resets when type/x/path change, popping to the
 * deepest branch that still exists in the data.
 */
import { t } from "../core/strings.ts";
import type { ChartSpec, Handlers, Host, SpecEvent, State } from "../core/types.ts";
import { listen } from "./listen.ts";

/** `spec` is needed to gate a push (the reducer has no other access to it). */
export type DrillEvent =
  { type: "drill"; value: string; spec?: ChartSpec } | { type: "pop"; depth: number } | SpecEvent;

const same = (a: readonly string[] = [], b: readonly string[] = []) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

const withDrill = (s: State, drill: readonly string[]): State =>
  same(s.view.drill, drill) ? s : { view: { ...s.view, drill }, selected: [] };

/** A sankey needs two levels left to draw; everything else one. (chord has no drill.) */
const FLOW = ["sankey"];

export const reduce = (s: State, e: DrillEvent): State => {
  const cur = s.view.drill ?? [];
  if (e.type === "pop") return withDrill(s, cur.slice(0, Math.max(0, e.depth)));
  if (e.type === "drill") {
    const n = (e.spec?.path?.length ?? 0) - (FLOW.includes(e.spec?.type ?? "") ? 2 : 1);
    return e.spec?.drill && cur.length < n ? withDrill(s, [...cur, e.value]) : s;
  }
  if (e.type !== "spec" || !cur.length) return s;
  const { prev, next } = e;
  const path = next.path ?? [];
  if (
    !next.drill ||
    (prev && (prev.type !== next.type || prev.x !== next.x || !same(prev.path, next.path)))
  )
    return withDrill(s, []);
  // Deepest branch that still has rows.
  let rows = next.data;
  const keep: string[] = [];
  for (let i = 0; i < cur.length && i < path.length - 1; i++) {
    rows = rows.filter((r) => String(r[path[i]!]) === cur[i]);
    if (!rows.length) break;
    keep.push(cur[i]!);
  }
  return withDrill(s, keep);
};

const decode = (raw: string) => {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

/**
 * Raw category the mark stands for, decoded from its data-key (grammar: core/svg.ts).
 * Flow keys are `n~level~name` and `k~level~source~target` (level in the whole path); only
 * the outermost level on screen drills.
 */
const branchOf = (key: string, depth: number, type = ""): string | undefined => {
  const p = key.split("~");
  const raw = FLOW.includes(type)
    ? p[1] === String(depth) && (p[0] === "n" || p[0] === "k")
      ? p[2]
      : undefined
    : p[0] === "h"
      ? (p[1 + depth] ?? p[p.length - 1])
      : p[1];
  return raw === undefined ? undefined : decode(raw);
};

/** Not a target of its own: a click here means "go back up" (drillOut). */
const BUSY =
  "[data-maya=mark],[data-maya=hit],[data-maya=link],[data-maya=legend],button,a,input,select,.maya-ctl,.maya-tip,.maya-table";

export const mount = (host: Host): Handlers => {
  /** After the next paint: focus the first mark (push) or the parent mark (pop); after a
   * pointer drill only the chart, so Escape works without a focus ring jumping onto a mark. */
  let want: { first: true } | { value: string } | { svg: true } | undefined;
  let ptr = false;

  const marks = () =>
    [...host.root.querySelectorAll<SVGElement>("[data-maya=mark][data-key]")].filter(
      (m) => !m.hasAttribute("data-other"),
    );

  const say = (next: State) => {
    const spec = host.spec();
    const d = next.view.drill ?? [];
    if (spec) host.announce(t(spec, d.length ? "drilledInto" : "back", d.join(" / ")));
  };

  const pop = (depth: number): boolean => {
    const s = host.state();
    const cur = s.view.drill ?? [];
    if (depth >= cur.length) return false;
    const next = reduce(s, { type: "pop", depth });
    if (next === s) return false;
    want = ptr ? { svg: true } : { value: cur[depth]! };
    host.commit(next);
    say(next);
    return true;
  };

  const push = (m: Element): boolean => {
    const spec = host.spec();
    const key = m.getAttribute("data-key");
    if (!spec?.drill || !key || m.hasAttribute("data-other")) return false;
    const s = host.state();
    const depth = (s.view.drill ?? []).length;
    // Sunburst centre: the current branch; activating it goes back up.
    if (spec.type === "sunburst" && m.getAttribute("data-depth") === "0") return pop(depth - 1);
    // A hierarchy key holds the whole branch: push every level down to the mark.
    const p = key.split("~");
    const values = p[0] === "h" ? p.slice(1 + depth).map(decode) : [];
    const first = branchOf(key, depth, spec.type);
    if (first === undefined) return false;
    let next = s;
    for (const value of values.length ? values : [first])
      next = reduce(next, { type: "drill", value, spec });
    if (next === s) return false;
    want = ptr ? { svg: true } : { first: true };
    host.commit(next);
    say(next);
    return true;
  };

  const click = (e: Event) => {
    const el = e.target as Element | null;
    const crumb = el?.closest(".maya-crumbs [data-depth]");
    ptr = (e as MouseEvent).detail > 0; // 0: a keyboard-activated crumb button
    if (crumb) pop(Number(crumb.getAttribute("data-depth")));
    else {
      const m = host.mark(e); // a link never drills (sankey and chord links are not keyboard-reachable)
      if (m && m.getAttribute("data-maya") !== "link") push(m);
      else if (el && !el.closest(BUSY) && host.spec()?.drillOut !== false)
        pop((host.state().view.drill ?? []).length - 1);
    }
    ptr = false;
  };

  return {
    escape: () => pop((host.state().view.drill ?? []).length - 1),
    enter: (mark) => push(mark),
    painted() {
      if (!want) return;
      const all = marks();
      const m =
        "svg" in want
          ? undefined
          : "first" in want
            ? all[0]
            : all.find(
                (x) =>
                  branchOf(
                    x.getAttribute("data-key")!,
                    host.state().view.drill?.length ?? 0,
                    host.spec()?.type,
                  ) === (want as { value: string }).value,
              );
      want = undefined;
      // The chart takes focus at once so keys keep working; the mark follows the landing, if
      // focus is still on the chart (a mark focused mid-zoom draws its outline scaled over the plot).
      const svg = host.root.querySelector<HTMLElement>(".maya-svg");
      svg?.focus({ preventScroll: true });
      const go = () => {
        if (!m || host.root.activeElement !== svg || host.root.querySelector("[data-active]"))
          return;
        if (!m.hasAttribute("tabindex")) m.setAttribute("tabindex", "-1");
        (m as unknown as HTMLElement).focus?.({ preventScroll: true });
      };
      const zoom = host.root.querySelector("[data-maya=marks]")?.getAnimations?.() ?? [];
      if (m && zoom.length) Promise.allSettled(zoom.map((a) => a.finished)).then(go);
      else go();
    },
    off: listen(host.root, ["click", click]),
  };
};
