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

/** Invisible target grown to >= 24 px around a small rect mark; "" when it is big enough. */
export function hit(d: Parameters<typeof el>[1], x: number, y: number, w: number, h: number) {
  const [gw, gh] = [Math.max(w, 24), Math.max(h, 24)];
  return w < 24 || h < 24
    ? el(
        "rect",
        Object.assign({ "data-maya": "hit" }, d, {
          "data-maya": "hit",
          x: r(x - (gw - w) / 2),
          y: r(y - (gh - h) / 2),
          width: r(gw),
          height: r(gh),
          fill: "transparent",
        }),
      )
    : "";
}

/** Keyless hit bands over `box` for categories `cs` (ascending) centred at `at(c)`, each up to the midpoints to its neighbours. */
export function bands(
  box: { x: number; y: number; w: number; h: number },
  cs: number[],
  at: (c: number) => number,
  is?: readonly number[] | null,
) {
  const xs = cs.map(at);
  return xs
    .map((x, k) => {
      const a = k ? (xs[k - 1]! + x) / 2 : box.x;
      const b = k < xs.length - 1 ? (x + xs[k + 1]!) / 2 : box.x + box.w;
      return el("rect", {
        "data-maya": "hit",
        "data-c": cs[k],
        "data-i": is?.[k],
        x: r(a),
        y: r(box.y),
        width: r(b - a),
        height: r(box.h),
        fill: "transparent",
      });
    })
    .join("");
}
