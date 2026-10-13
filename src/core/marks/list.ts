import { formatAs } from "../format.ts";
import { moves } from "../shape.ts";
import { el, esc, key } from "../svg.ts";
import type { Mark } from "../types.ts";

/**
 * Insight list (#79). STUB written by the M4 contracts task so `type: "list"` registers and
 * renders; the chart designer owns the real draw (contract: render.ts DESIGN NOTE, M4).
 * One text mark per move, keyed `m~X`, in data order; no evidence, bars or expand yet.
 */
export const list: Mark = {
  noun: "List",
  draw(ctx) {
    const s = ctx.spec;
    const all = moves(s);
    const val = (v: number | null, f: string | null) => (v === null ? "–" : formatAs(s, s.y, f, v));
    const title = (f: string) => s.titles.get(f) ?? f;
    let marks = "";
    all.forEach((m, i) => {
      const f = val(m.value, m.format);
      marks += el(
        "text",
        {
          "data-maya": "mark",
          "data-key": key("m", m.x),
          "data-c": i,
          "data-x": ctx.fmt(s.x, m.x),
          "data-y": m.value,
          "data-f": f,
          "data-series": "",
          x: 8,
          y: 20 + i * 24,
        },
        esc(`${i + 1}. ${ctx.fmt(s.x, m.x)}  ${f}`),
      );
    });
    return {
      marks,
      hits: "",
      table: {
        head: [title(s.x), title(s.y), ...(s.body ? [title(s.body)] : [])],
        rows: all.map((m) => [
          `${all.indexOf(m) + 1}. ${m.x}`,
          val(m.value, m.format),
          ...(s.body ? [m.body ?? ""] : []),
        ]),
      },
    };
  },
};
