/** Adds the listeners to `target`; returns the function that removes them again. */
export const listen = (
  target: EventTarget,
  ...ls: [type: string, fn: EventListener, opts?: AddEventListenerOptions | boolean][]
): (() => void) => {
  for (const [n, f, o] of ls) target.addEventListener(n, f, o);
  return () => ls.forEach(([n, f, o]) => target.removeEventListener(n, f, o));
};
