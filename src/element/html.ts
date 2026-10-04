/*
 * Every innerHTML / insertAdjacentHTML / template.innerHTML in the element goes through
 * html(): a Trusted Types policy created once. Safe because core escapes every data string.
 * Hosts allow it with `trusted-types mayacharts`.
 */
type Policy = { createHTML(s: string): string };
type TT = { createPolicy(n: string, o: Policy): Policy; getPolicy?(n: string): Policy | null };
let cache: [TT, Policy | null] | undefined;

export const html = (s: string): string => {
  const tt = (globalThis as { trustedTypes?: TT }).trustedTypes;
  if (!tt) return s;
  if (cache?.[0] !== tt) {
    let p: Policy | null = null;
    try {
      p = tt.createPolicy("mayacharts", { createHTML: (x) => x });
    } catch {
      p = tt.getPolicy?.("mayacharts") ?? null; // duplicate names may be refused by the page's CSP
    }
    cache = [tt, p];
  }
  return cache[1] ? cache[1].createHTML(s) : s;
};
