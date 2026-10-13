/*
 * Frame playback (spec.frame). Same contract as measure.ts. Markup: the `.maya-play` button the
 * core appends to the controls. The shown frame is view.frame (default the last); a timer steps
 * it (every spec.frameSpeed ms) and stops at the last or when a frame control moves it. Playing is not state: the spec changing, or the element leaving the
 * page, stops it. Persistence: view.frame resets when spec.frame changes.
 */
import type { Handlers, Host, SpecEvent, State } from "../core/types.ts";
import { listen } from "./listen.ts";
import { t } from "../core/strings.ts";

export const reduce = (s: State, e: SpecEvent): State => {
  if (s.view.frame === undefined || !e.prev || e.prev.frame === e.next.frame) return s;
  const { frame: _drop, ...view } = s.view;
  return { ...s, view };
};

// spec.frameSpeed: ms per step.
const STEP = 900;

export const mount = (host: Host): Handlers => {
  let timer: ReturnType<typeof setInterval> | undefined;

  const painted = (): void => {
    const b = host.root.querySelector(".maya-play");
    if (b) b.textContent = t(host.spec() ?? {}, timer ? "pause" : "play");
  };
  const stop = (): void => {
    clearInterval(timer);
    timer = undefined;
    painted();
  };
  const show = (i: number): void =>
    host.commit({ ...host.state(), view: { ...host.state().view, frame: i } });

  const click = (e: Event): void => {
    if (!(e.target as Element).closest?.(".maya-play")) return;
    if (timer) return stop();
    const spec = host.spec()!;
    const F = spec.frame;
    const n = new Set(spec.data.flatMap((r) => (r[F!] == null ? [] : [String(r[F!])]))).size;
    let i = Math.min(host.state().view.frame ?? n, n - 1);
    if (i >= n - 1) show((i = 0));
    timer = setInterval(() => {
      // The spec changed, or the viewer picked a frame with a control: stop.
      if (host.spec() !== spec || host.state().view.frame !== i) return stop();
      show(++i);
      if (i >= n - 1) stop();
    }, spec.frameSpeed ?? STEP);
    painted();
  };

  return {
    painted,
    off: (() => {
      const off = listen(host.root, ["click", click]);
      return () => (clearInterval(timer), off());
    })(),
  };
};
