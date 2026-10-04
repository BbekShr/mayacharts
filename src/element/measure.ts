/*
 * Measure toggle (T10a). Contract shared by measure/drill/select/zoom:
 *   reduce(state, event) => state     pure, node-tested; handles its own events and
 *                                     { type: "spec", prev, next } (persistence rules)
 *   mount(host) => Handlers           DOM wiring on host.root; calls host.commit(next)
 * Markup: Parts.controls, a `.maya-ctl` radiogroup of [role=radio][aria-checked] buttons.
 * Persistence: measure resets when spec.y changes.
 */
import type { Handlers, Host, SpecEvent, State } from "../core/types.ts";

export type MeasureEvent = { type: "pick"; index: number } | SpecEvent;

export const reduce = (s: State, _e: MeasureEvent): State => s;

export const mount = (_host: Host): Handlers => ({ off() {} });
