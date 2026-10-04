/*
 * Drill (T10b). Same reduce/mount contract as measure.ts.
 * Click/Enter on a mark pushes its branch; breadcrumb (Parts.crumbs, `.maya-crumbs`), Back
 * and Escape (priority 5) pop. Persistence: resets when type/x/path change, popping to the
 * deepest branch that still exists in the data.
 */
import type { Handlers, Host, SpecEvent, State } from "../core/types.ts";

export type DrillEvent = { type: "push"; value: string } | { type: "pop"; to?: number } | SpecEvent;

export const reduce = (s: State, _e: DrillEvent): State => s;

export const mount = (_host: Host): Handlers => ({ off() {} });
