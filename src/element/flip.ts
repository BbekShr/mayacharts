/*
 * Card turn (kpi spec.back). Same contract as measure.ts. Markup: the `.maya-flip` button the core
 * appends to the controls. view.face is "back" while the second face shows; Escape returns to the
 * front. Persistence: view.face resets when the spec has no `back` any more. The element animates
 * the turn (animate.ts turn) and hands the back's options to the other modules (host.spec()).
 */
import type { Handlers, Host, SpecEvent, State } from "../core/types.ts";
import { listen } from "./listen.ts";

export type FlipEvent = { type: "flip"; to?: "front" | "back" | undefined } | SpecEvent;

export const reduce = (s: State, e: FlipEvent): State => {
  const face = s.view.face;
  if (e.type === "spec") {
    if (face === undefined || e.next.back) return s;
    const { face: _, ...view } = s.view;
    return { ...s, view };
  }
  const to = e.to ?? (face === "back" ? "front" : "back");
  if (to === (face ?? "front")) return s;
  const { face: _, ...view } = s.view;
  return { ...s, view: to === "back" ? { ...view, face: to } : view };
};

export const mount = (host: Host): Handlers => {
  const go = (to?: "front") => host.commit(reduce(host.state(), { type: "flip", to }));
  return {
    escape: () => host.state().view.face === "back" && (go("front"), true),
    off: listen(host.root, [
      "click",
      (e) => void ((e.target as Element).closest?.(".maya-flip") && go()),
    ]),
  };
};
