/*
 * Measure toggle (T10a). Contract shared by measure/drill/select/zoom:
 *   reduce(state, event) => state     pure, node-tested; handles its own events and
 *                                     { type: "spec", prev, next } (persistence rules)
 *   mount(host) => Handlers           DOM wiring on host.root; calls host.commit(next)
 * Markup: Parts.controls, a `.maya-ctl` radiogroup of [role=radio][aria-checked] buttons.
 * Persistence: measure resets when spec.y changes.
 */
import type { Handlers, Host, SpecEvent, State } from "../core/types.ts";
import { listen } from "./listen.ts";
import { t } from "../core/strings.ts";

/** `count` (number of measures) bounds the index; without it only the lower bound applies. */
export type MeasureEvent =
  { type: "measure" | "pick" | "form"; index: number; count?: number | undefined } | SpecEvent;

const RADIO = ".maya-ctl [role=radio]";
const FORM = "[data-maya=form]"; // units' form control: the same radiogroup, writes view.form

export const reduce = (s: State, e: MeasureEvent): State => {
  if (e.type === "spec") {
    if (!e.prev) return s;
    const y = e.next.y;
    const same = JSON.stringify(y) === JSON.stringify(e.prev.y);
    if (Array.isArray(y) && same) return s;
    if (s.view.measure === undefined) return s;
    const { measure: _drop, ...view } = s.view;
    return { ...s, view };
  }
  const max = e.count === undefined ? Infinity : e.count - 1;
  const index = Math.min(Math.max(0, Math.trunc(e.index) || 0), Math.max(0, max));
  const k = e.type === "form" ? "form" : "measure";
  return s.view[k] === index ? s : { ...s, view: { ...s.view, [k]: index } };
};

export const mount = (host: Host): Handlers => {
  const group = (r: Element | null | undefined) => r?.closest<HTMLElement>(".maya-ctl");
  const radios = (g: Element | null | undefined) => [
    ...(g?.querySelectorAll<HTMLElement>("[role=radio]") ?? []),
  ];
  const kind = (g: Element) => (g.matches(FORM) ? "form" : "measure");
  let kbd: "form" | "measure" | undefined; // the last change came from the keyboard: keep focus on that group's active radio

  const pick = (g: HTMLElement, index: number): void => {
    const form = kind(g) === "form";
    const spec = host.spec();
    const ys = spec && Array.isArray(spec.y) ? (spec.y as string[]) : [];
    const s = host.state();
    const next = reduce(s, {
      type: kind(g),
      index,
      count: form ? radios(g).length : ys.length || undefined,
    });
    if (next === s) return;
    host.commit(next);
    const m = next.view.measure ?? 0;
    const name = form ? (radios(g)[index]?.textContent ?? "") : (ys[m] ?? String(m));
    host.announce(
      t(
        spec ?? {},
        "showing",
        (spec?.titles as Record<string, string> | undefined)?.[name] ?? name,
      ),
    );
  };

  const click = (e: Event): void => {
    const b = (e.target as Element).closest?.(RADIO);
    const g = group(b);
    if (b && g) pick(g, radios(g).indexOf(b as HTMLElement));
  };

  const keydown = (e: Event): void => {
    const k = (e as KeyboardEvent).key;
    const b = (e.target as Element).closest?.(RADIO);
    const g = group(b);
    const all = radios(g);
    const i = all.indexOf(b as HTMLElement);
    if (i < 0 || !g) return;
    const to =
      k === "ArrowRight" || k === "ArrowDown"
        ? (i + 1) % all.length
        : k === "ArrowLeft" || k === "ArrowUp"
          ? (i - 1 + all.length) % all.length
          : k === "Home"
            ? 0
            : k === "End"
              ? all.length - 1
              : -1;
    if (to < 0) return;
    e.preventDefault();
    kbd = kind(g);
    if (to === (host.state().view[kind(g)] ?? 0))
      painted(); // already active (e.g. Home on first)
    else pick(g, to);
    all[to]?.focus({ preventScroll: true });
  };

  const painted = (): void => {
    for (const g of host.root.querySelectorAll<HTMLElement>(".maya-ctl")) {
      const m = host.state().view[kind(g)] ?? 0;
      const all = radios(g);
      all.forEach((r, i) => {
        r.setAttribute("aria-checked", String(i === m));
        r.setAttribute("tabindex", i === m ? "0" : "-1");
      });
      if (kbd === kind(g)) {
        kbd = undefined;
        all[m]?.focus({ preventScroll: true });
      }
    }
  };

  return { painted, off: listen(host.root, ["click", click], ["keydown", keydown]) };
};
