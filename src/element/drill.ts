/*
 * Drill (T10b). Same reduce/mount contract as measure.ts.
 * Click/Enter on a mark pushes its branch (a sunburst slice: every level down to it); the
 * sunburst centre, a click on empty chart space (unless `drillOut: false`), breadcrumb
 * (Parts.crumbs, `.maya-crumbs`), Back and Escape (priority 5) pop. Persistence: resets when type/x/path change, popping to the
 * deepest branch that still exists in the data.
 */
import { t } from "../core/strings.ts";
import { drillDepth } from "../core/validate.ts";
import type { ChartSpec, Handlers, Host, SpecEvent, State } from "../core/types.ts";
import { listen } from "./listen.ts";

/** `spec` is needed to gate a push (the reducer has no other access to it). */
export type DrillEvent =
  | { type: "drill" | "xdrill"; value: string; spec?: ChartSpec }
  | { type: "pop" | "xpop"; depth: number }
  | SpecEvent;

const same = (a: readonly string[] = [], b: readonly string[] = []) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

const put = (s: State, k: "drill" | "xDrill", v: readonly string[]): State =>
  same(s.view[k], v) ? s : { view: { ...s.view, [k]: v }, selected: [] };

/** Flow keys are `n~level~name` / `k~level~source~target`, level in the whole path. */
const FLOW = ["sankey", "chord"];

export const reduce = (s: State, e: DrillEvent): State => {
  const cur = s.view.drill ?? [];
  const xc = s.view.xDrill ?? [];
  if (e.type === "pop") return put(s, "drill", cur.slice(0, Math.max(0, e.depth)));
  if (e.type === "xpop") return put(s, "xDrill", xc.slice(0, Math.max(0, e.depth)));
  if (e.type === "drill")
    return e.spec && cur.length < drillDepth(e.spec) ? put(s, "drill", [...cur, e.value]) : s;
  if (e.type === "xdrill")
    return e.spec?.drill && xc.length < (e.spec.xPath?.length ?? 0) - 1
      ? put(s, "xDrill", [...xc, e.value])
      : s;
  if (e.type !== "spec") return s;
  const { prev, next } = e;
  const path = next.path ?? [];
  if (
    xc.length &&
    (!next.drill || (prev && (prev.type !== next.type || !same(prev.xPath, next.xPath))))
  )
    s = put(s, "xDrill", []);
  if (!cur.length) return s;
  const depth = drillDepth(next);
  if (
    !depth ||
    (prev &&
      (prev.type !== next.type ||
        prev.x !== next.x ||
        !same(prev.path, next.path) ||
        prev.facet !== next.facet ||
        !same(prev.seriesPath, next.seriesPath)))
  )
    return put(s, "drill", []);
  // Deepest branch that still has rows. Each level filters on its own field.
  const lv =
    next.seriesPath ??
    (next.drillTo
      ? [next.series ?? ""]
      : next.facet
        ? [next.facet]
        : next.type === "chord" && path.length === 3
          ? [path[1]!]
          : path);
  let rows = next.data;
  const keep: string[] = [];
  for (let i = 0; i < cur.length && i < depth; i++) {
    rows = rows.filter((r) => String(r[lv[i]!]) === cur[i]);
    if (!rows.length) break;
    keep.push(cur[i]!);
  }
  return put(s, "drill", keep);
};

export const decode = (raw: string) => {
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
export const branchOf = (key: string, depth: number, type = "", levels = 0): string | undefined => {
  const p = key.split("~");
  // A 3-level chord drills its targets (key level 1), not its sources.
  const lv = type === "chord" && levels === 3 ? 1 : depth;
  const raw = FLOW.includes(type)
    ? p[1] === String(lv) && (p[0] === "n" || p[0] === "k")
      ? p[2]
      : undefined
    : p[0] === "h"
      ? (p[1 + depth] ?? p[p.length - 1])
      : p[type === "heatmap" ? 0 : 1]; // a heatmap cell is `ROW~COLUMN`, and the path walks the rows
  return raw === undefined ? undefined : decode(raw);
};

/** Not a target of its own: a click here means "go back up" (drillOut). */
export const BUSY =
  "[data-maya=mark],[data-maya=hit],[data-maya=link],[data-maya=legend],button,a,input,select,.maya-ctl,.maya-tip,.maya-table";

const PANEL = "svg[data-maya=panel]";
const TICK = "[data-maya=axis-x] text[data-key]";

export const mount = (host: Host): Handlers => {
  /** After the next paint: focus the first mark (push) or the parent mark (pop); after a
   * pointer drill only the chart, so Escape works without a focus ring jumping onto a mark. */
  let want: { first: true } | { value: string } | { svg: true } | undefined;
  let seq = 0;
  let ptr = false;

  const marks = () =>
    [...host.root.querySelectorAll<SVGElement>("[data-maya=mark][data-key]")].filter(
      (m) => !m.hasAttribute("data-other"),
    );
  /** Column headers drill (svg[data-xdrill]) or, at the last level, report the leaf. */
  const ticks = () => {
    const spec = host.spec();
    return !!(spec?.drill && spec.xPath);
  };
  /** What a gesture pushes: the svg says ("" the category, "series"); at the last level it is
   * absent and the spec still reports the leaf. null: nothing drills. */
  const mode = () => {
    const d = host.root.querySelector(".maya-svg")?.getAttribute("data-drill");
    const spec = host.spec();
    return d ?? (spec?.drill ? (spec.seriesPath ? "series" : "") : null);
  };
  const valOf = (m: Element, depth: number) =>
    mode() === "series"
      ? (m.getAttribute("data-series") ?? undefined)
      : mode() === "facet"
        ? (m.closest(PANEL)?.getAttribute("data-facet") ?? undefined)
        : (m.getAttribute("data-raw") ??
          branchOf(
            m.getAttribute("data-key")!,
            depth,
            host.spec()?.type,
            host.spec()?.path?.length,
          ));

  const say = (next: State, x?: boolean) => {
    const spec = host.spec();
    const d = (x ? next.view.xDrill : next.view.drill) ?? [];
    if (spec) host.announce(t(spec, d.length ? "drilledInto" : "back", d.join(" / ")));
  };

  const pop = (depth: number, x?: boolean): boolean => {
    const s = host.state();
    const cur = (x ? s.view.xDrill : s.view.drill) ?? [];
    if (depth >= cur.length) return false;
    const next = reduce(s, { type: x ? "xpop" : "pop", depth });
    if (next === s) return false;
    want = ptr || x ? { svg: true } : { value: cur[depth]! };
    host.commit(next);
    say(next, x);
    return true;
  };

  const leaf = (path: string[], axis?: "x") =>
    !host.el.dispatchEvent(
      new CustomEvent("maya-drill-leaf", {
        detail: axis ? { path, axis } : { path },
        bubbles: true,
        composed: true,
      }),
    );

  /** A heatmap column header: push the column branch. */
  const pushX = (t: Element): boolean => {
    const spec = host.spec();
    const key = t.getAttribute("data-key");
    if (!spec || key === null) return false;
    const s = host.state();
    const value = decode(key);
    if (value.startsWith("\0")) return false; // the Total band never drills
    const next = reduce(s, { type: "xdrill", value, spec });
    if (next === s) return leaf([...(s.view.xDrill ?? []), value], "x");
    want = { svg: true };
    host.commit(next);
    say(next, true);
    return true;
  };

  const push = (m: Element): boolean => {
    const spec = host.spec();
    const key = m.getAttribute("data-key");
    if (
      !spec ||
      mode() === null ||
      !key ||
      m.hasAttribute("data-other") ||
      m.getAttribute("data-way") === "total"
    )
      return false;
    const s = host.state();
    const depth = (s.view.drill ?? []).length;
    // Sunburst centre: the current branch; activating it goes back up.
    if (spec.type === "sunburst" && m.getAttribute("data-depth") === "0") return pop(depth - 1);
    // A hierarchy key holds the whole branch: push every level down to the mark.
    const p = key.split("~");
    // data-to: a nested treemap child drills only its parent (that many values).
    const to = +m.getAttribute("data-to")! || 99;
    const first = valOf(m, depth);
    if (first === undefined || first.startsWith("\0")) return false; // the Total band never drills
    const values = p[0] === "h" ? p.slice(1 + depth, 1 + depth + to).map(decode) : [first];
    let next = s;
    for (const value of values) next = reduce(next, { type: "drill", value, spec });
    // Nowhere deeper to go: the drill gesture reports the leaf (root to leaf).
    if (next === s) return leaf([...(s.view.drill ?? []), ...values]);
    want = ptr ? { svg: true } : { first: true };
    host.commit(next);
    say(next);
    return true;
  };

  /** Facet: a panel (or its title) opens full size. */
  const pushF = (value: string): boolean => {
    const spec = host.spec();
    const s = host.state();
    const next = reduce(s, { type: "drill", value, ...(spec && { spec }) });
    if (next === s) return false;
    want = ptr ? { svg: true } : { first: true };
    host.commit(next);
    say(next);
    return true;
  };

  const click = (e: Event) => {
    const el = e.target as Element | null;
    const crumb = el?.closest(".maya-crumbs [data-depth]");
    const { detail } = e as MouseEvent; // 0: a keyboard-activated button; a double click acts once
    const both = host.spec()?.select; // a click selects then, the second click of a pair drills
    if (detail > (both ? 2 : 1) || (detail > 1 && !host.mark(e))) return;
    ptr = detail > 0;
    // The tooltip's drill button (select and drill together) names its mark.
    const tk = el?.closest(".maya-tip [data-drill]")?.getAttribute("data-drill");
    const m = tk ? marks().find((x) => x.getAttribute("data-key") === tk) : host.mark(e);
    const tick = ticks() && el?.closest(TICK);
    // An empty panel area is not a hit target (nested svgs only hit their painted content): the click lands on the root svg, so find the panel by its box.
    const { clientX: cx, clientY: cy } = e as MouseEvent;
    const fc =
      mode() === "facet" &&
      !el?.closest(BUSY) &&
      (el?.closest("[data-facet]") ??
        [...host.root.querySelectorAll(PANEL)].find((p) => {
          const r = p.getBoundingClientRect();
          return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
        }));
    if (crumb)
      pop(Number(crumb.getAttribute("data-depth")), crumb.parentElement?.dataset.axis === "x");
    else if (tick) detail < 2 && pushX(tick);
    // A link never drills (sankey and chord links are not keyboard-reachable).
    else if (m && m.getAttribute("data-maya") !== "link") (tk || !both || detail > 1) && push(m);
    else if (fc) (!both || detail > 1) && pushF(fc.getAttribute("data-facet")!);
    else if (el && !el.closest(BUSY) && host.spec()?.drillOut !== false)
      pop((host.state().view.drill ?? []).length - 1);
    ptr = false;
  };

  // Column headers are buttons for the keyboard (sort.ts does the same for table headers).
  const key = (e: Event) => {
    const k = (e as KeyboardEvent).key;
    const tick = ticks() && (e.target as Element).closest?.(TICK);
    const pn = k === "Enter" && mode() === "facet" && (e.target as Element).matches?.(PANEL);
    if (pn && (e.target as Element).hasAttribute("data-facet")) {
      e.preventDefault();
      e.stopPropagation();
      ptr = false;
      pushF((e.target as Element).getAttribute("data-facet")!);
      return;
    }
    if (!tick || (k !== "Enter" && k !== " ")) return;
    e.preventDefault();
    e.stopPropagation();
    pushX(tick);
  };

  return {
    escape: () =>
      pop((host.state().view.xDrill ?? []).length - 1, true) ||
      pop((host.state().view.drill ?? []).length - 1),
    enter: (mark) => push(mark),
    painted() {
      if (ticks())
        for (const t of host.root.querySelectorAll(TICK)) {
          t.setAttribute("tabindex", "0");
          t.setAttribute("role", "button");
        }
      if (!want) return;
      const all = marks();
      const depth = host.state().view.drill?.length ?? 0;
      const m =
        "svg" in want
          ? undefined
          : "first" in want
            ? all[0]
            : all.find((x) => valOf(x, depth) === (want as { value: string }).value);
      want = undefined;
      // The chart takes focus at once so keys keep working; the mark follows the landing, if
      // focus is still on the chart (a mark focused mid-zoom draws its outline scaled over the plot).
      const svg = host.root.querySelector<HTMLElement>(".maya-svg");
      svg?.focus({ preventScroll: true });
      const id = ++seq; // only the latest drill may move focus when its zoom settles
      const go = () => {
        if (
          id !== seq ||
          !m?.isConnected ||
          !m.hasAttribute("data-key") ||
          host.root.activeElement !== svg ||
          host.root.querySelector("[data-active]")
        )
          return;
        if (!m.hasAttribute("tabindex")) m.setAttribute("tabindex", "-1");
        (m as unknown as HTMLElement).focus?.({ preventScroll: true });
      };
      const zoom =
        host.root.querySelector("[data-maya=marks]")?.getAnimations?.({ subtree: true }) ?? [];
      if (m && zoom.length) Promise.allSettled(zoom.map((a) => a.finished)).then(go);
      else go();
    },
    off: listen(host.root, ["click", click], ["keydown", key, true]),
  };
};
