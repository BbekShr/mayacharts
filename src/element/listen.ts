/** Adds the listeners to `target`; returns the function that removes them again. */
export const listen = (
  target: EventTarget,
  ...ls: [type: string, fn: EventListener, opts?: AddEventListenerOptions | boolean][]
): (() => void) => {
  for (const [n, f, o] of ls) target.addEventListener(n, f, o);
  return () => ls.forEach(([n, f, o]) => target.removeEventListener(n, f, o));
};

/** Eats the click that follows a drag, so it neither clears the selection nor pops a drill. */
export const swallowClick = (root: EventTarget): void => {
  const eat = (c: Event) => c.stopPropagation();
  root.addEventListener("click", eat, { capture: true, once: true });
  setTimeout(() => root.removeEventListener("click", eat, { capture: true }), 0);
};
