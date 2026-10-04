/*
 * Drill (T10b). Same reduce/mount contract as measure.ts.
 * Click/Enter on a mark pushes its branch; breadcrumb (Parts.crumbs, `.maya-crumbs`), Back
 * and Escape (priority 5) pop. Persistence: resets when type/x/path change, popping to the
 * deepest branch that still exists in the data.
 */
import { t } from "../core/strings.ts";
import type { ChartSpec, Handlers, Host, SpecEvent, State } from "../core/types.ts";

/** `spec` is needed to gate a push (the reducer has no other access to it). */
export type DrillEvent =
  { type: "drill"; value: string; spec?: ChartSpec } | { type: "pop"; depth: number } | SpecEvent;

const same = (a: readonly string[] = [], b: readonly string[] = []) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

const withDrill = (s: State, drill: readonly string[]): State =>
  same(s.view.drill, drill) ? s : { view: { ...s.view, drill }, selected: [] };

export const reduce = (s: State, e: DrillEvent): State => {
  const cur = s.view.drill ?? [];
  if (e.type === "pop") return withDrill(s, cur.slice(0, Math.max(0, e.depth)));
  if (e.type === "drill") {
    const n = e.spec?.path?.length ?? 0;
    return e.spec?.drill && cur.length < n - 1 ? withDrill(s, [...cur, e.value]) : s;
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

/** Raw category the mark stands for, decoded from its data-key (grammar: core/svg.ts). */
const branchOf = (key: string, depth: number): string | undefined => {
  const p = key.split("~");
  const raw = p[0] === "h" ? (p[1 + depth] ?? p[p.length - 1]) : p[1];
  if (raw === undefined) return;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

export const mount = (host: Host): Handlers => {
  /** After the next paint: focus the first mark (push) or the parent mark (pop). */
  let want: { first: true } | { value: string } | undefined;

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
    want = { value: cur[depth]! };
    host.commit(next);
    say(next);
    return true;
  };

  const push = (mark: Element): boolean => {
    const spec = host.spec();
    const key = mark.getAttribute("data-key");
    if (!spec?.drill || !key || mark.hasAttribute("data-other")) return false;
    const s = host.state();
    const value = branchOf(key, (s.view.drill ?? []).length);
    if (value === undefined) return false;
    const next = reduce(s, { type: "drill", value, spec });
    if (next === s) return false;
    want = { first: true };
    host.commit(next);
    say(next);
    return true;
  };

  const click = (e: Event) => {
    const el = e.target as Element | null;
    const crumb = el?.closest(".maya-crumbs [data-depth]");
    if (crumb) return void pop(Number(crumb.getAttribute("data-depth")));
    const m = el?.closest("[data-maya=mark],[data-maya=hit]");
    if (m) push(m);
  };
  host.root.addEventListener("click", click);

  return {
    escape: () => pop((host.state().view.drill ?? []).length - 1),
    enter: (mark) => push(mark),
    painted() {
      if (!want) return;
      const all = marks();
      const m =
        "first" in want
          ? all[0]
          : all.find(
              (x) =>
                branchOf(x.getAttribute("data-key")!, host.state().view.drill?.length ?? 0) ===
                (want as { value: string }).value,
            );
      want = undefined;
      if (!m) return;
      if (!m.hasAttribute("tabindex")) m.setAttribute("tabindex", "-1");
      (m as unknown as HTMLElement).focus?.({ preventScroll: true });
    },
    off: () => host.root.removeEventListener("click", click),
  };
};
