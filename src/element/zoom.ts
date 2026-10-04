/*
 * Zoom (T10d). Same reduce/mount contract as measure.ts.
 * Drag draws `[data-maya=brush]`; release sets view.window; Reset chip (`.maya-reset`),
 * double-click and Escape restore. Escape priority: cancel() = brush in progress (2),
 * escape() = window (4). Persistence: resets when drill or x change; clamps to category count.
 */
import type { Handlers, Host, SpecEvent, State, View } from "../core/types.ts";

export type ZoomEvent =
  { type: "zoom"; window: NonNullable<View["window"]> } | { type: "reset" } | SpecEvent;

export const reduce = (s: State, _e: ZoomEvent): State => s;

export const mount = (_host: Host): Handlers => ({ off() {} });
