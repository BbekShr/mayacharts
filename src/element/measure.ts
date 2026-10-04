/*
 * Measure toggle (T10a). Contract shared by measure/drill/select/zoom:
 *   reduce(state, event) => state     pure, node-tested; handles its own events and
 *                                     { type: "spec", prev, next } (persistence rules)
 *   mount(host) => Handlers           DOM wiring on host.root; calls host.commit(next)
 * Markup: Parts.controls, a `.maya-ctl` radiogroup of [role=radio][aria-checked] buttons.
 * Persistence: measure resets when spec.y changes.
 */
import type { Handlers, Host, SpecEvent, State } from "../core/types.ts";
import { t } from "../core/strings.ts";

/** `count` (number of measures) bounds the index; without it only the lower bound applies. */
export type MeasureEvent =
  { type: "measure" | "pick"; index: number; count?: number | undefined } | SpecEvent;

const RADIO = ".maya-ctl [role=radio]";

export const reduce = (s: State, e: MeasureEvent): State => {
  if (e.type === "spec") {
    const y = e.next.y;
    const same = e.prev && JSON.stringify(y) === JSON.stringify(e.prev.y);
    if (Array.isArray(y) && same) return s;
    if (s.view.measure === undefined) return s;
    const { measure: _drop, ...view } = s.view;
    return { ...s, view };
  }
  const max = e.count === undefined ? Infinity : e.count - 1;
  const index = Math.min(Math.max(0, Math.trunc(e.index) || 0), Math.max(0, max));
  return s.view.measure === index ? s : { ...s, view: { ...s.view, measure: index } };
};

export const mount = (host: Host): Handlers => {
  const radios = () => [...host.root.querySelectorAll<HTMLElement>(RADIO)];
  let kbd = false; // the last change came from the keyboard: keep focus on the active radio

  const pick = (index: number): void => {
    const spec = host.spec();
    const ys = spec && Array.isArray(spec.y) ? (spec.y as string[]) : [];
    const s = host.state();
    const next = reduce(s, { type: "measure", index, count: ys.length || undefined });
    if (next === s) return;
    host.commit(next);
    const m = next.view.measure ?? 0;
    const name = ys[m] ?? String(m);
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
    const i = b ? radios().indexOf(b as HTMLElement) : -1;
    if (i >= 0) pick(i);
  };

  const keydown = (e: Event): void => {
    const k = (e as KeyboardEvent).key;
    const all = radios();
    const i = all.indexOf((e.target as Element).closest?.(RADIO) as HTMLElement);
    if (i < 0) return;
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
    kbd = true;
    if (to === host.state().view.measure)
      painted(); // already active (e.g. Home on first)
    else pick(to);
    all[to]?.focus({ preventScroll: true });
  };

  const painted = (): void => {
    const all = radios();
    const m = host.state().view.measure ?? 0;
    all.forEach((r, i) => {
      r.setAttribute("aria-checked", String(i === m));
      r.setAttribute("tabindex", i === m ? "0" : "-1");
    });
    if (kbd) {
      kbd = false;
      all[m]?.focus({ preventScroll: true });
    }
  };

  host.root.addEventListener("click", click);
  host.root.addEventListener("keydown", keydown);
  return {
    painted,
    off() {
      host.root.removeEventListener("click", click);
      host.root.removeEventListener("keydown", keydown);
    },
  };
};
