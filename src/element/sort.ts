/*
 * Table header sort. Same reduce/mount contract as measure.ts.
 * Markup: `[data-maya=sort][data-field]` groups from core/marks/table.ts (tabindex 0, role button).
 * Click, Enter or Space commits view.sortBy: same field toggles, a new field starts desc for a
 * measure and asc for the row label. Persistence: resets when type, x or y change.
 */
import { t } from "../core/strings.ts";
import type { Handlers, Host, SpecEvent, State } from "../core/types.ts";
import { listen } from "./listen.ts";

export type SortEvent = { type: "sort"; field: string; label?: boolean } | SpecEvent;

export const reduce = (s: State, e: SortEvent): State => {
  if (e.type === "spec") {
    const { prev, next } = e;
    if (
      !s.view.sortBy ||
      !prev ||
      (prev.type === next.type &&
        prev.x === next.x &&
        JSON.stringify(prev.y) === JSON.stringify(next.y))
    )
      return s;
    const { sortBy: _drop, ...view } = s.view;
    return { ...s, view };
  }
  const cur = s.view.sortBy;
  const dir = cur?.[0] === e.field ? (cur[1] === "asc" ? "desc" : "asc") : e.label ? "asc" : "desc";
  return { ...s, view: { ...s.view, sortBy: [e.field, dir] } };
};

const HEAD = "[data-maya=sort]";

export const mount = (host: Host): Handlers => {
  let want: string | null = null; // field to refocus after the repaint

  const pick = (h: Element): void => {
    const spec = host.spec();
    const field = h.getAttribute("data-field");
    if (!spec || spec.type !== "table" || !field) return;
    const next = reduce(host.state(), { type: "sort", field, label: field === spec.x });
    const [, dir] = next.view.sortBy!;
    want = field;
    host.commit(next);
    const titles = spec.titles as Record<string, string> | undefined;
    host.announce(
      t(
        spec,
        "sortedBy",
        titles?.[field] ?? field,
        t(spec, dir === "asc" ? "ascending" : "descending"),
      ),
    );
  };

  const click = (e: Event): void => {
    const h = (e.target as Element).closest?.(HEAD);
    if (h) pick(h);
  };
  const keydown = (e: Event): void => {
    const k = (e as KeyboardEvent).key;
    const h = (e.target as Element).closest?.(HEAD);
    if (!h || (k !== "Enter" && k !== " ")) return;
    e.preventDefault();
    e.stopPropagation(); // the chart's own Enter handler would drill/select
    pick(h);
  };
  return {
    painted() {
      if (want === null) return;
      const f = want;
      want = null;
      [...host.root.querySelectorAll<HTMLElement>(HEAD)]
        .find((h) => h.getAttribute("data-field") === f)
        ?.focus({ preventScroll: true });
    },
    off: listen(host.root, ["click", click], ["keydown", keydown, true]),
  };
};
