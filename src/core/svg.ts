const ESC: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const SPECIAL = /[&<>"']/;
export function esc(s: string | number): string {
  if (typeof s !== "string") return String(s); // a number has nothing to escape
  return SPECIAL.test(s) ? s.replace(/[&<>"']/g, (c) => ESC[c]!) : s;
}

export function r(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Estimated label width in px: 7.2 per code point plus `pad` (no text measurement in Node). */
export const tw = (s: string, pad = 4) => [...s].length * 7.2 + pad;

/** `s` cut to `n` code points, the last one an ellipsis; `n` below 2 keeps one character. */
export const clip = (s: string, n: number) => {
  const c = [...s];
  return c.length > n ? c.slice(0, Math.max(1, n - 1)).join("") + "…" : s;
};

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

/** The numeric colorBy field ("sign" and { target } are not fields), else null. */
export const cbField = ({ colorBy: c }: { colorBy: unknown }) =>
  typeof c === "string" && c !== "sign" ? c : null;

/** Unique mark id for a named point: the name, then name#2, name#3 for repeats; an id already emitted (a real name "3#2") is skipped. The row index when unnamed. */
export function nameId(seen: Map<string, number>, name: string | null, i: number) {
  if (name === null) return i;
  let n = seen.get(name) ?? 0;
  let id = name;
  if (n) while (seen.has((id = `${name}#${++n}`)));
  seen.set(name, n || 1);
  if (id !== name) seen.set(id, 1);
  return id;
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
    .map((p) =>
      typeof p === "number"
        ? p
        : encodeURIComponent(String(p).replace(/\p{Cs}/gu, "�")).replace(/~/g, "%7E"),
    )
    .join("~");

/** Invisible target grown to >= 24 px around a small rect mark; "" when it is big enough. */
export function hit(d: Parameters<typeof el>[1], x: number, y: number, w: number, h: number) {
  const [gw, gh] = [Math.max(w, 24), Math.max(h, 24)];
  return w < 24 || h < 24
    ? el("rect", {
        // data-maya leads the attributes and always wins over a caller's "mark".
        ...Object.assign({ "data-maya": "hit" }, d, { "data-maya": "hit" }),
        x: r(x - (gw - w) / 2),
        y: r(y - (gh - h) / 2),
        width: r(gw),
        height: r(gh),
        fill: "transparent",
      })
    : "";
}

/** One keyless hit over the box `b` (line, area, kpi, ridgeline): the element picks the point nearest the pointer's x, then its y. */
export const plotHit = (b: { x: number; y: number; w: number; h: number }) =>
  el("rect", {
    "data-maya": "hit",
    x: r(b.x),
    y: r(b.y),
    width: r(b.w),
    height: r(b.h),
    fill: "transparent",
  });

/** Nudge sorted label ys at least `g` apart inside [lo, hi]: a down pass, then an up pass. */
export function repel(ys: number[], lo: number, hi: number, g: number): number[] {
  ys.forEach((y, i) => (ys[i] = Math.max(y, (ys[i - 1] ?? lo - g) + g)));
  for (let i = ys.length; i--;) ys[i] = Math.min(ys[i]!, (ys[i + 1] ?? hi + g) - g);
  return ys;
}
