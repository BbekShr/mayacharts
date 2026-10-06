import { el, esc, key, OTHER, r } from "../svg.ts";
import { niceTicks } from "../ticks.ts";
import type { Mark, Row } from "../types.ts";

const TOP = 26;
const BOTTOM = 12;
const LEFT = 48;
const RIGHT = 14;

/**
 * One polyline per x category across one vertical axis per measure (`spec.measures`), each with its
 * own linear scale. No Mark.axes: axes, ticks and titles are drawn here (grid + labels).
 */
export const parallel: Mark = {
  noun: "Parallel coordinates",
  draw(ctx) {
    const { spec, shaped, width: W, height: H } = ctx;
    const ms = spec.measures;
    const rows = new Map<string, Row[]>();
    for (const row of spec.data) {
      const c = String(row[spec.x]);
      (rows.get(c) ?? rows.set(c, []).get(c)!).push(row);
    }
    const reduce = ctx.agg(spec.aggregate);
    const lines = shaped.categories.flatMap((cat, ci) => {
      const rs = rows.get(cat);
      if (!rs || cat === OTHER) return []; // ponytail: the limit roll-up has no single line, it is skipped.
      const vals = ms.map((m) => reduce(rs.map((row) => row[m] as number | null)));
      const si =
        spec.series === null ? 0 : Math.max(0, shaped.series.indexOf(String(rs[0]![spec.series])));
      return shaped.visible.includes(si) ? [{ cat, ci, vals, si }] : [];
    });

    const x0 = LEFT;
    // Room right of the last axis for each line's category name (end labels).
    const room = Math.min(
      lines.reduce((m, l) => Math.max(m, ctx.fmt(spec.x, l.cat).length * 7.2 + 12), 0),
      W * 0.3,
    );
    const x1 = Math.max(x0 + 1, W - Math.max(RIGHT, room));
    const [y0, y1] = [TOP, Math.max(TOP + 1, H - BOTTOM)];
    const at = (i: number) => r(ms.length < 2 ? x0 : x0 + ((x1 - x0) * i) / (ms.length - 1));
    let grid = "";
    let labels = "";
    const scales = ms.map((m, i) => {
      const all = lines.map((l) => l.vals[i]).filter((v): v is number => v !== null);
      const t = niceTicks(Math.min(0, ...all), Math.max(0, ...all), 4);
      const [lo, hi] = t.domain;
      const of = (v: number) => r(y1 - ((v - lo) / (hi - lo || 1)) * (y1 - y0));
      const x = at(i);
      grid += el("line", { x1: x, x2: x, y1: r(y0), y2: r(y1) });
      for (const v of t.values) {
        const y = of(v);
        grid += el("line", { x1: x - 3, x2: x, y1: y, y2: y });
        labels += el(
          "text",
          {
            x: x - 6,
            y,
            "text-anchor": "end",
            "dominant-baseline": "middle",
            "data-ax": true,
            "data-h": true,
          },
          esc(ctx.fmt(m, v, t.step)),
        );
      }
      labels += el(
        "text",
        {
          x,
          y: 12,
          "text-anchor": i === 0 ? "start" : i === ms.length - 1 ? "end" : "middle",
          "font-weight": 600,
          "data-in": true,
        },
        esc(spec.titles.get(m) ?? m),
      );
      return of;
    });

    let dots = "";
    let paths = "";
    let hits = "";
    const ends: { y: number; ey: number; x: string; si: number }[] = [];
    for (const { cat, ci, vals, si } of lines) {
      const x = ctx.fmt(spec.x, cat);
      let d = "";
      let gap = true;
      let end = [0, 0];
      vals.forEach((v, i) => {
        if (v === null) {
          gap = true;
          return;
        }
        const [cx, cy] = [at(i), scales[i]!(v)];
        end = [cx, cy];
        d += `${gap ? "M" : "L"}${cx} ${cy}`;
        gap = false;
        dots += el("circle", {
          "data-maya": "mark",
          "data-key": key(cat, ms[i]),
          "data-c": ci,
          "data-s": si % 8,
          "data-x": x,
          "data-series": spec.titles.get(ms[i]!) ?? ms[i],
          "data-y": v,
          "data-f": ctx.fmt(ms[i]!, v),
          "data-neg": v < 0,
          r: 3.5,
          cx,
          cy,
        });
      });
      if (!d) continue;
      // End labels are repelled below, never dropped; a line that stops early has none.
      if (vals.at(-1) !== null) ends.push({ y: end[1]!, ey: end[1]!, x, si });
      paths += el("path", {
        "data-maya": "line",
        "data-key": key("l", cat),
        "data-c": ci,
        "data-s": si % 8,
        pathLength: 1,
        d,
      });
      hits += el("path", {
        "data-maya": "hit",
        "data-c": ci,
        d,
      });
    }
    // Repel: sorted by y, at least GAP apart (down pass, then up pass from the bottom edge); a moved label gets a leader.
    const GAP = 13;
    ends.sort((a, b) => a.y - b.y);
    ends.forEach((e, i) => (e.y = Math.max(e.y, i ? ends[i - 1]!.y + GAP : 0)));
    for (let i = ends.length; i--;)
      ends[i]!.y = Math.min(ends[i]!.y, (ends[i + 1]?.y ?? H - 4) - GAP);
    const ex = at(ms.length - 1);
    for (const e of ends) {
      if (Math.abs(e.y - e.ey) > 2)
        grid += el("line", { "data-s": e.si % 8, x1: ex + 2, x2: ex + 7, y1: e.ey, y2: r(e.y) });
      labels += el(
        "text",
        { x: ex + 8, y: r(e.y), "text-anchor": "start", "dominant-baseline": "middle" },
        esc(e.x),
      );
    }
    // Points first: the line~circle CSS rule (hide points until active) only matches circles after a line.
    // The hit paths share their stroke: set once on a group instead of on every row.
    return {
      marks: dots + paths,
      hits: `<g fill="none" stroke="transparent" stroke-width="16" stroke-linejoin="round">${hits}</g>`,
      grid,
      labels,
    };
  },
};
