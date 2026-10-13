/*
 * Range, select and reset controls (Parts.controls): `params` sliders (view.params, #78), the
 * frame slider / select (view.frame, #80) and the facetScale radios' value (view.facetScale).
 * Same contract as measure.ts. Slider input is coalesced to one commit per frame; the controls
 * are patched in place (maya-chart.ts), so a focused slider is never replaced mid-drag.
 * Persistence: view.params resets when the param ids change, view.facetScale when spec.facetScale does.
 */
import type { Handlers, Host, SpecEvent, State } from "../core/types.ts";
import { t } from "../core/strings.ts";
import { listen } from "./listen.ts";

export const reduce = (s: State, e: SpecEvent): State => {
  if (!e.prev) return s;
  const { params, facetScale, ...view } = s.view;
  const j = JSON.stringify;
  const v = { ...view } as typeof s.view;
  if (params && j(e.prev.params?.map((p) => p.id)) === j(e.next.params?.map((p) => p.id)))
    v.params = params;
  if (facetScale && j(e.prev.facetScale) === j(e.next.facetScale)) v.facetScale = facetScale;
  return Object.keys(v).length === Object.keys(s.view).length ? s : { ...s, view: v };
};

export const mount = (host: Host): Handlers => {
  let raf = 0;
  let todo: (() => void) | undefined;
  const later = (f: () => void): void => {
    todo = f;
    raf ||= requestAnimationFrame(() => ((raf = 0), todo?.()));
  };
  const view = (v: object): void =>
    host.commit({ ...host.state(), view: { ...host.state().view, ...v } });

  const input = (e: Event): void => {
    const i = (e.target as Element).closest?.("input[data-maya=param],input[data-maya=frame]");
    if (!(i instanceof HTMLInputElement)) return;
    const v = +i.value;
    if (i.dataset.maya === "frame")
      later(() => {
        view({ frame: v });
        host.announce(t(host.spec() ?? {}, "frame", v + 1, +i.max + 1));
      });
    else {
      const id = i.dataset.id!;
      later(() => view({ params: { ...host.state().view.params, [id]: v } }));
    }
  };
  const change = (e: Event): void => {
    const sel = (e.target as Element).closest?.("select[data-maya=frame]");
    if (sel instanceof HTMLSelectElement) view({ frame: +sel.value });
  };
  const click = (e: Event): void => {
    if (!(e.target as Element).closest?.("[data-maya=params-reset]")) return;
    const { params, ...rest } = host.state().view;
    if (!params) return;
    host.commit({ ...host.state(), view: rest });
    host.announce(t(host.spec() ?? {}, "resetParams"));
  };

  return {
    off: (() => {
      const off = listen(host.root, ["input", input], ["change", change], ["click", click]);
      return () => (cancelAnimationFrame(raf), off());
    })(),
  };
};
