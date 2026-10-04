const ESC: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function esc(s: string | number): string {
  return String(s).replace(/[&<>"']/g, (c) => ESC[c]!);
}

export function r(n: number): number {
  return Math.round(n * 100) / 100;
}

export function el(
  tag: string,
  attrs: Record<string, string | number | boolean | null | undefined>,
  children?: string,
): string {
  let a = "";
  for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    a += v === true ? ` ${k}=""` : ` ${k}="${esc(v)}"`;
  }
  return children === undefined ? `<${tag}${a}/>` : `<${tag}${a}>${children}</${tag}>`;
}

/** Sentinel category for `limit`'s rolled-up rest. Cannot collide with real data text. */
export const OTHER = "\u0000other";

/**
 * Mark identity: each part `encodeURIComponent`ed (lone surrogates replaced, `~` -> %7E),
 * joined by `~`. Grammar: band `S~C`; line/area `l~S`/`a~S`; scatter `S~name` (or index);
 * hierarchy `h~p0~p1…`; sankey node `n~depth~name`, link `k~depth~src~dst`; hexmap `g~CODE`.
 */
export const key = (...parts: unknown[]): string =>
  parts
    .map((p) => encodeURIComponent(String(p).replace(/\p{Cs}/gu, "�")).replace(/~/g, "%7E"))
    .join("~");
