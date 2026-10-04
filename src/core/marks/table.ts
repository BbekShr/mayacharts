import { el, esc, hit, key, r } from "../svg.ts";
import type { Mark } from "../types.ts";

const HEAD = 30;
const ROW = 26;
const PAD = 8;
const num = (v: unknown) => (typeof v === "number" ? v : null);

/**
 * Rows = x categories, one column per measure (every `spec.y` entry), value text plus a thin bar
 * scaled to the column max. Header cells are `data-maya="sort"` groups (element/sort.ts).
 */
export const table: Mark = {
  noun: "Table",
  draw(ctx) {
    const { spec, width: W, height: H } = ctx;
    const ms = spec.measures;
    const title = (f: string) => spec.titles.get(f) ?? f;
    const agg = ctx.agg(spec.aggregate);

    const groups = new Map<string, (number | null)[][]>();
    for (const row of spec.data) {
      const k = String(row[spec.x]);
      const g =
        groups.get(k) ??
        groups
          .set(
            k,
            ms.map(() => []),
          )
          .get(k)!;
      ms.forEach((m, i) => g[i]!.push(num(row[m])));
    }
    let rows = [...groups].map(([name, g]) => ({ name, vals: g.map((v) => agg(v)) }));

    const nulls = (v: number | null, d: number) => (v === null ? Infinity : v * d);
    const byValue = (i: number, d: number) => (a: (typeof rows)[0], b: (typeof rows)[0]) =>
      nulls(a.vals[i]!, d) - nulls(b.vals[i]!, d) || 0;
    // ponytail: limit is a plain cut to the top N of the first measure (no Other roll-up).
    if (spec.limit !== null && rows.length > spec.limit)
      rows = rows.sort(byValue(0, -1)).slice(0, spec.limit);
    const by =
      spec.sortBy && (spec.sortBy[0] === spec.x || ms.includes(spec.sortBy[0]))
        ? spec.sortBy
        : null;
    if (by) {
      const d = by[1] === "asc" ? 1 : -1;
      const i = ms.indexOf(by[0]);
      if (i < 0) {
        const c = new Intl.Collator(spec.locale, { numeric: true });
        rows.sort((a, b) => d * c.compare(a.name, b.name));
      } else
        rows.sort((a, b) => {
          const [x, y] = [a.vals[i]!, b.vals[i]!];
          return x === null || y === null
            ? (x === null ? 1 : 0) - (y === null ? 1 : 0)
            : d * (x - y);
        });
    } else if (spec.sort) {
      rows.sort(byValue(0, spec.sort === "asc" ? 1 : -1));
    }

    const lw = Math.max(80, Math.min(W * 0.34, 180));
    const cw = (W - lw) / ms.length;
    const colX = (i: number) => lw + i * cw; // left edge of measure column i
    const max = ms.map((_, i) => Math.max(0, ...rows.map((rw) => Math.abs(rw.vals[i] ?? 0))));
    const cut = (s: string, w: number) => {
      const n = Math.max(1, Math.floor((w - PAD) / 7));
      return s.length > n ? s.slice(0, n - 1) + "…" : s;
    };

    let labels = "";
    let grid = "";
    let hits = "";
    const heads = [spec.x, ...ms];
    heads.forEach((f, i) => {
      const x0 = i ? colX(i - 1) : 0;
      const w = i ? cw : lw;
      const on = by?.[0] === f ? by[1] : null;
      const text = cut(title(f), w - (on ? 14 : 0)) + (on ? (on === "asc" ? " ▲" : " ▼") : "");
      // Headers go in the hits group: the labels group ignores the pointer.
      hits += el(
        "g",
        {
          "data-maya": "sort",
          "data-field": f,
          "data-sort": on,
          role: "button",
          tabindex: 0,
          "aria-label": on
            ? ctx.t("sortedBy", title(f), ctx.t(on === "asc" ? "ascending" : "descending"))
            : title(f),
        },
        el("rect", { x: r(x0), y: 0, width: r(w), height: HEAD, fill: "transparent" }) +
          el(
            "text",
            {
              "data-th": true,
              x: r(i ? x0 + w - PAD : PAD),
              y: HEAD / 2,
              "text-anchor": i ? "end" : "start",
              "dominant-baseline": "middle",
            },
            esc(text),
          ),
      );
    });
    grid += el("line", { x1: 0, x2: W, y1: HEAD, y2: HEAD });

    // ponytail: rows that do not fit the height are not drawn (the tile shows the top rows); no scroll.
    const fit = Math.max(0, Math.floor((H - HEAD) / ROW));
    let marks = "";
    rows.slice(0, fit).forEach((rw, ri) => {
      const top = HEAD + ri * ROW;
      const name = ctx.fmt(spec.x, rw.name);
      // Row texts sit in the marks group, keyed by row, so a re-sort slides them with their bars.
      marks += el(
        "text",
        {
          "data-key": key("t", rw.name),
          x: PAD,
          y: top + ROW / 2 - 2,
          "dominant-baseline": "middle",
          "data-td": "label",
        },
        esc(cut(name, lw)),
      );
      ms.forEach((m, mi) => {
        const v = rw.vals[mi]!;
        const right = colX(mi) + cw - PAD;
        const text = v === null ? "–" : ctx.fmt(m, v);
        marks += el(
          "text",
          {
            "data-key": key("v", m, rw.name),
            x: r(right),
            y: top + ROW / 2 - 2,
            "text-anchor": "end",
            "dominant-baseline": "middle",
          },
          esc(text),
        );
        if (v === null) return;
        const bw = max[mi] ? ((cw - 2 * PAD) * Math.abs(v)) / max[mi]! : 0;
        const d = {
          "data-key": key(m, rw.name),
          "data-c": ri,
          "data-s": ms.length > 1 ? mi % 8 : 0,
          "data-x": name,
          "data-series": title(m),
          "data-f": text,
          "data-y": v,
          "data-neg": v < 0,
        };
        const y = top + ROW - 7;
        marks += el("rect", {
          "data-maya": "mark",
          ...d,
          x: r(colX(mi) + PAD),
          y,
          width: r(bw),
          height: 4,
        });
        hits += hit(d, colX(mi) + PAD, y, bw, 4);
      });
    });
    return { marks, hits, labels, grid };
  },
};
