/*
 * Table and list rows (M4). Same reduce/mount contract as measure.ts.
 * expand: click or Enter on a row sets view.expanded to its raw x (the open one again: ""), one
 * open at a time; with select a click selects and a double click or Shift+Enter expands (the
 * drill split). more: the "Show n more" row adds a page. filter: the search box, debounced.
 * scroll: the header group follows the box's scrollTop through a CSSOM transform.
 */
import type { Handlers, Host, SpecEvent, State } from "../core/types.ts";
import { decode } from "./drill.ts";
import { listen } from "./listen.ts";
import { still } from "./tooltip.ts";

export type ExpandEvent =
  | { type: "expand"; value: string; open: string }
  | { type: "more" }
  | { type: "filter"; value: string }
  | SpecEvent;

export const reduce = (s: State, e: ExpandEvent): State => {
  const v = s.view;
  if (e.type === "expand")
    return { ...s, view: { ...v, expanded: e.value === e.open ? "" : e.value } };
  if (e.type === "more") return { ...s, view: { ...v, page: (v.page ?? 0) + 1 } };
  if (e.type === "filter")
    return e.value === (v.filter ?? "") ? s : { ...s, view: { ...v, filter: e.value, page: 0 } };
  const { prev, next } = e;
  if (!prev || (prev.type === next.type && prev.x === next.x)) return s;
  const { expanded: _e, page: _p, filter: _f, ...view } = v;
  return { ...s, view };
};

/** Raw x of a row mark: data-raw, else its key (`t~X`, `m~X`, `e~X~NAME`, a bar `FIELD~X`, `v~FIELD~X`, strip square `s~TITLE~ROW~LABEL`). */
const rawOf = (m: Element) => {
  const p = m.getAttribute("data-key")!.split("~");
  return m.getAttribute("data-raw") ?? decode(p[p[0] === "v" || p[0] === "s" ? 2 : 1] ?? "");
};
const CTL = "button,a,input,select,.maya-ctl,.maya-tip,.maya-table";
const INNER = "[data-maya=expand]";

export const mount = (host: Host): Handlers => {
  const { root } = host;
  let tm: ReturnType<typeof setTimeout> | undefined;
  let caret: [number | null, number | null] | undefined;
  let again = false; // refocus the "more" row after the repaint
  const svg = () => root.querySelector<SVGElement>(".maya-svg");

  const open = () => {
    const v = host.state().view.expanded;
    const spec = host.spec();
    if (v !== undefined) return v;
    const first = root.querySelector("[data-key^='m~']");
    // list: spec.expand "first" is the default; "none" and "all" start with no single row open.
    const x = spec?.expand as unknown;
    return spec?.type === "list" && (x === undefined || x === "first") && first ? rawOf(first) : "";
  };

  const toggle = (m: Element): boolean => {
    if (!svg()?.hasAttribute("data-expand") || !m.hasAttribute("data-key") || m.closest(INNER))
      return false;
    host.commit(reduce(host.state(), { type: "expand", value: rawOf(m), open: open() }));
    return true;
  };

  const more = () => {
    again = true;
    host.commit(reduce(host.state(), { type: "more" }));
  };

  const click = (e: Event) => {
    const el = e.target as Element;
    const { detail } = e as MouseEvent;
    const both = host.spec()?.select; // a click selects then; the double click expands
    if (detail > (both ? 2 : 1)) return;
    if (el.closest("[data-maya=more]")) return detail < 2 && more();
    if (both && detail === 1) return;
    const m = host.mark(e) ?? el.closest("[data-key]");
    if (m && !el.closest(CTL)) toggle(m);
  };

  const keydown = (e: Event) => {
    const k = (e as KeyboardEvent).key;
    if ((k !== "Enter" && k !== " ") || !(e.target as Element).closest?.("[data-maya=more]"))
      return;
    e.preventDefault();
    e.stopPropagation();
    more();
  };

  const input = (e: Event) => {
    const i = (e.target as Element).closest?.("[data-maya=filter]") as HTMLInputElement | null;
    if (!i) return;
    clearTimeout(tm);
    tm = setTimeout(() => {
      caret = [i.selectionStart, i.selectionEnd];
      const s = host.state();
      const next = reduce(s, { type: "filter", value: i.value });
      next === s ? (caret = undefined) : host.commit(next);
    }, 150);
  };

  // The header group rides the scroll position; the box scrolls, the svg is as tall as the rows.
  const stick = () => {
    const box = root.querySelector(".maya-box");
    const h = root.querySelector<SVGElement>("svg[data-scroll] [data-maya=thead]");
    if (h && box) h.style.transform = `translateY(${box.scrollTop}px)`;
  };

  return {
    enter: toggle,
    painted() {
      // The box holds its height while the rows grow: follow them, so the pager (or the last row) stays in view.
      if (again)
        root
          .querySelector(".maya-box")
          ?.scrollTo({ top: 1e9, behavior: still() ? "instant" : "smooth" });
      stick();
      if (again) {
        again = false;
        (root.querySelector<HTMLElement>("[data-maya=more]") ?? svg())?.focus({
          preventScroll: true,
        });
      }
      const i = root.querySelector<HTMLInputElement>("[data-maya=filter]");
      if (caret && i) {
        i.focus({ preventScroll: true }); // the repaint replaced the box the user was typing in
        i.setSelectionRange(caret[0], caret[1]);
      }
      caret = undefined;
    },
    off: (() => {
      const off = listen(
        root,
        ["click", click],
        ["keydown", keydown, true],
        ["input", input],
        ["scroll", stick, true],
      );
      return () => (clearTimeout(tm), off());
    })(),
  };
};
