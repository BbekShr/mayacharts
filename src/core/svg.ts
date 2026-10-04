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
