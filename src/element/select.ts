/*
 * Selection (T10c). Same reduce/mount contract as measure.ts.
 * Click/Enter/legend toggles a Sel (raw values); `data-selected` re-applied in painted();
 * Escape (priority 3) clears. Persistence: clears when drill changes, else unmatched
 * keys are inert.
 */
import type { Handlers, Host, Sel, SpecEvent, State } from "../core/types.ts";

export type SelectEvent =
  { type: "toggle"; sel: Sel; multi: boolean } | { type: "clear" } | SpecEvent;

export const reduce = (s: State, _e: SelectEvent): State => s;

export const mount = (_host: Host): Handlers => ({ off() {} });
