/*
 * Every innerHTML / insertAdjacentHTML / template.innerHTML in the element goes through
 * html(). T2 turns it into a Trusted Types policy created once:
 *   trustedTypes?.createPolicy("mayacharts", { createHTML: (s) => s })
 * which is safe because core escapes every data string. Hosts then allow it with
 * `trusted-types mayacharts`. Until T2 it is a pass-through.
 */
export const html = (s: string): string => s;
