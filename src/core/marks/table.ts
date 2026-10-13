import { agg, feed, strips } from "../shape.ts";
import { clip, el, esc, hit, key, memo, r, tw } from "../svg.ts";
import type { Mark } from "../types.ts";

const HEAD = 30;
const ROW = 26;
const PAD = 8;
const SQ = 10; // strip square
const GAP = 3;
const EXH = 180; // a row's sub-chart

/**
 * Rows = x categories, then spec.columns (each row's first value), one column per measure (value
 * text plus a bar scaled to the column max, or diverging from a centre line, or none) and spec.cells
 * strips. Header cells are `data-maya="sort"` groups inside `data-maya="thead"` (element/sort.ts).
 * Paged tables end in a `data-maya="more"` button; an open row (spec.expanded) leaves a box for its sub-chart.
 */
export const table: Mark = {
  noun: "Table",
  draw(ctx) {
    const { spec, width: W, height: H } = ctx;
    const ms = spec.measures;
    const dims = spec.columns;
    const title = (f: string) => spec.titles.get(f) ?? f;
    // One reducer per (category, measure), once per data array: a resize or re-sort reuses it.
    const all = memo(
      spec.data,
      `t${JSON.stringify([spec.x, ms, dims, spec.aggregate, spec.ratio])}`,
      () => {
        const groups = new Map<string, [ReturnType<typeof agg>[], string[]]>();
        for (const row of spec.data) {
          const k = String(row[spec.x]);
          let g = groups.get(k);
          if (!g)
            groups.set(
              k,
              (g = [ms.map(() => agg(spec.aggregate, !!spec.ratio)), dims.map(() => "")]),
            );
          ms.forEach((m, i) => feed(g![0][i]!, row, m, spec.ratio));
          dims.forEach((f, i) => {
            if (!g![1][i] && row[f] != null) g![1][i] = String(row[f]);
          });
        }
        return [...groups].map(([name, [g, txt]]) => ({
          name,
          vals: g.map((a) => a.value()),
          txt,
        }));
      },
    );
    type Row = (typeof all)[0];

    const nulls = (v: number | null, d: number) => (v === null ? Infinity : v * d);
    const byValue = (i: number, d: number) => (a: Row, b: Row) =>
      nulls(a.vals[i]!, d) - nulls(b.vals[i]!, d) || 0;
    const by =
      spec.sortBy &&
      (spec.sortBy[0] === spec.x || ms.includes(spec.sortBy[0]) || dims.includes(spec.sortBy[0]))
        ? spec.sortBy
        : null;
    // ponytail: a sorted table sorts every category on each render (a million take about a second).
    let rows = all.slice();
    {
      // limit is a plain cut to the top N of the first measure (no Other roll-up).
      if (spec.limit !== null && rows.length > spec.limit)
        rows = rows.sort(byValue(0, -1)).slice(0, spec.limit);
      if (by) {
        const d = by[1] === "asc" ? 1 : -1;
        const i = ms.indexOf(by[0]);
        if (i < 0) {
          const c = new Intl.Collator(spec.locale, { numeric: true });
          const j = dims.indexOf(by[0]);
          rows.sort(
            (a, b) => d * (j < 0 ? c.compare(a.name, b.name) : c.compare(a.txt[j]!, b.txt[j]!)),
          );
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
    }

    // Row positions. A paged or scrolling table draws `spec.shown` rows and grows; otherwise the rows that fit the height.
    const open = spec.expand ? spec.expanded[0] : undefined;
    const drawn: { rw: Row; top: number }[] = [];
    let y = HEAD;
    let exBox: { x: number; y: number; w: number; h: number } | undefined;
    for (const rw of rows) {
      if (spec.shown === null ? y + ROW > H : drawn.length >= spec.shown) break;
      drawn.push({ rw, top: y });
      y += ROW;
      if (rw.name === open) {
        const h = spec.scroll ? EXH : Math.max(70, Math.min(EXH, H - y));
        exBox = { x: 0, y, w: W, h };
        y += h + 4;
      }
    }
    const left = rows.length - drawn.length;
    const cellDefs = [...strips(spec)];

    const lw = Math.max(80, Math.min(W * 0.34, 180)) + (spec.expand ? 12 : 0);
    // ponytail: a narrow table drops its rightmost columns (no horizontal scroll); a column needs its widest value plus 2 * PAD.
    type Col = { k: "t" | "m" | "s"; f: string; i: number; min: number };
    const cols: Col[] = [
      ...dims.map((f, i) => ({
        k: "t" as const,
        f,
        i,
        min: Math.min(
          Math.max(...drawn.map(({ rw }) => tw(rw.txt[i]!, 2 * PAD)), tw(title(f), 2 * PAD)),
          W * 0.3,
        ),
      })),
      ...ms.map((f, i) => ({
        k: "m" as const,
        f,
        i,
        min: Math.max(
          ...drawn.map(({ rw }) =>
            tw(rw.vals[i] === null ? "–" : ctx.fmt(f, rw.vals[i]!), 2 * PAD),
          ),
          2 * PAD,
        ),
      })),
      ...cellDefs.map(([f, c], i) => ({
        k: "s" as const,
        f,
        i,
        min: c.labels.length * (SQ + GAP) - GAP + 2 * PAD,
      })),
    ];
    const fit = (W2: number) => {
      let nc = 0;
      for (let room = W2 - lw; nc < cols.length; nc++) {
        room -= cols[nc]!.min;
        if (room < 0 && nc) break;
      }
      return nc;
    };
    // Columns that did not fit leave a strip at the right edge holding "+n" (their count; a title lists them).
    let nc = fit(W);
    const spare = nc < cols.length ? tw(`+${cols.length - nc}`, 6) : 0;
    if (spare) nc = fit(W - spare);
    const kept = cols.slice(0, nc);
    const nm = kept.filter((c) => c.k === "m").length;
    const fixed = kept.reduce((a, c) => a + (c.k === "m" ? 0 : c.min), 0);
    const mw = Math.max(0, W - spare - lw - fixed) / (nm || 1);
    const wd = kept.map((c) => (c.k === "m" ? mw : c.min));
    const at = wd.map((_, i) => lw + wd.slice(0, i).reduce((a, w) => a + w, 0));
    const max = ms.map((_, i) => {
      let m = 0; // a loop: Math.max(...rows) overflows the stack on a long table
      for (const rw of rows) m = Math.max(m, Math.abs(rw.vals[i] ?? 0));
      return m;
    });
    const cut = (s: string, w: number) => clip(s, Math.max(1, Math.floor((w - PAD) / 7)));
    const more = left > 0;
    const end = y + (more ? ROW + 6 : 0);

    let grid = "";
    let hits = "";
    const thead: string[] = [];
    const th = (x: number, anchor: string, body: string) =>
      el(
        "text",
        {
          "data-th": true,
          x: r(x),
          y: HEAD / 2,
          "text-anchor": anchor,
          "dominant-baseline": "middle",
        },
        body,
      );
    [{ k: "t", f: spec.x, i: -1, min: lw }, ...kept].forEach((c, i) => {
      const x0 = i ? at[i - 1]! : 0;
      const w = i ? wd[i - 1]! : lw;
      const right = c.k === "m";
      const on = by?.[0] === c.f ? by[1] : null;
      const label = cut(title(c.f), w - (on ? 14 : 0)) + (on ? (on === "asc" ? " ▲" : " ▼") : "");
      const text = th(right ? x0 + w - PAD : x0 + PAD, right ? "end" : "start", esc(label));
      // Headers go in the hits group: the labels group ignores the pointer. A strip column is not sortable.
      thead.push(
        c.k === "s"
          ? text
          : el(
              "g",
              {
                "data-maya": "sort",
                "data-field": c.f,
                "data-sort": on,
                role: "button",
                tabindex: 0,
                "aria-label": on
                  ? ctx.t("sortedBy", title(c.f), ctx.t(on === "asc" ? "ascending" : "descending"))
                  : title(c.f),
              },
              el("rect", { x: r(x0), y: 0, width: r(w), height: HEAD, fill: "transparent" }) + text,
            ),
      );
    });
    if (spare)
      thead.push(
        th(
          W - PAD,
          "end",
          `+${cols.length - nc}` +
            el(
              "title",
              {},
              esc(
                cols
                  .slice(nc)
                  .map((c) => title(c.f))
                  .join(", "),
              ),
            ),
        ),
      );
    // The header holds its own rule and page-coloured ground: the element can pin it over scrolled rows.
    const rule = el("line", { x1: 0, x2: W, y1: HEAD, y2: HEAD });
    hits += el(
      "g",
      { "data-maya": "thead" },
      el("rect", { "data-bg": true, x: 0, y: 0, width: W, height: HEAD }) + rule + thead.join(""),
    );

    let marks = "";
    drawn.forEach(({ rw, top }, ri) => {
      const name = ctx.fmt(spec.x, rw.name);
      const isOpen = rw.name === open;
      const mid = top + ROW / 2 - 2;
      // Row texts sit in the marks group, keyed by row, so a re-sort slides them with their bars.
      if (spec.expand)
        marks += el(
          "text",
          {
            "data-key": key("x", rw.name),
            "data-chev": true,
            x: PAD,
            y: mid,
            "dominant-baseline": "middle",
          },
          isOpen ? "▾" : "▸",
        );
      marks += el(
        "text",
        {
          "data-key": key("t", rw.name),
          x: spec.expand ? PAD + 12 : PAD,
          y: mid,
          "dominant-baseline": "middle",
          "data-td": "label",
        },
        esc(cut(name, lw - (spec.expand ? 12 : 0))),
      );
      // One hit over the row label carries the first measure's data (tooltip, drill, a click that opens the row).
      const d0 = {
        "data-key": key(ms[0], rw.name),
        "data-c": ri,
        "data-s": 0,
        "data-x": name,
        "data-series": title(ms[0]!),
        "data-f": rw.vals[0] === null ? "–" : ctx.fmt(ms[0]!, rw.vals[0]!),
        "data-y": rw.vals[0],
      };
      hits += el("rect", {
        ...d0,
        "data-maya": "hit",
        "aria-expanded": spec.expand ? String(isOpen) : null,
        x: 0,
        y: top,
        width: r(lw),
        height: ROW,
        fill: "transparent",
      });
      kept.forEach((c, ci) => {
        const x0 = at[ci]!;
        const w = wd[ci]!;
        if (c.k === "t") {
          marks += el(
            "text",
            {
              "data-key": key("d", c.f, rw.name),
              x: r(x0 + PAD),
              y: mid,
              "dominant-baseline": "middle",
            },
            esc(cut(rw.txt[c.i]!, w)),
          );
          return;
        }
        if (c.k === "s") {
          const st = cellDefs[c.i]![1];
          const vs = st.values.get(rw.name) ?? [];
          st.labels.forEach((lb, li) => {
            const v = vs[li] ?? null;
            const f =
              v === null ? "–" : (v > 0 ? "+" : "") + ctx.fmt(spec.cells.get(c.f)!.field, v);
            const sq = {
              "data-key": key("s", c.f, rw.name, lb),
              "data-c": ri,
              "data-x": name,
              "data-series": `${c.f}: ${ctx.fmt(spec.cells.get(c.f)!.by, lb)}`,
              "data-f": f,
              "data-y": v,
              "data-way": v === null || v === 0 ? "zero" : v > 0 ? "up" : "down",
              x: r(x0 + PAD + li * (SQ + GAP)),
              y: top + ROW / 2 - SQ / 2 - 2,
              width: SQ,
              height: SQ,
            };
            marks += el("rect", {
              "data-maya": v === null ? null : "mark",
              ...sq,
              "data-nil": v === null,
            });
          });
          return;
        }
        const m = c.f;
        const v = rw.vals[c.i] ?? null;
        const text = v === null ? "–" : ctx.fmt(m, v);
        marks += el(
          "text",
          {
            "data-key": key("v", m, rw.name),
            x: r(x0 + w - PAD),
            y: mid,
            "text-anchor": "end",
            "dominant-baseline": "middle",
          },
          esc(text),
        );
        const kind = spec.bars.get(m) ?? "bar";
        if (v === null || kind === "none") return;
        const d = {
          ...d0,
          "data-key": key(m, rw.name),
          "data-series": title(m),
          "data-f": text,
          "data-y": v,
          "data-neg": v < 0,
        };
        const span = Math.max(0, w - 2 * PAD);
        const len = max[c.i]
          ? ((kind === "diverging" ? span / 2 : span) * Math.abs(v)) / max[c.i]!
          : 0;
        const bx = kind === "diverging" ? x0 + w / 2 - (v < 0 ? len : 0) : x0 + PAD;
        const by0 = top + ROW - 7;
        marks += el("rect", {
          "data-maya": "mark",
          ...d,
          "data-s": kind === "diverging" ? null : 0, // one accent: colour never encodes the column
          "data-way": kind === "diverging" ? (v < 0 ? "down" : "up") : null,
          x: r(bx),
          y: by0,
          width: r(len),
          height: 4,
        });
        hits += hit(d, bx, by0, len, 4);
      });
    });
    // A diverging column's centre line.
    kept.forEach((c, ci) => {
      if (c.k === "m" && spec.bars.get(c.f) === "diverging")
        grid += el("line", {
          x1: r(at[ci]! + wd[ci]! / 2),
          x2: r(at[ci]! + wd[ci]! / 2),
          y1: HEAD,
          y2: r(y),
          "data-centre": true,
        });
    });
    // The open row's rule above its sub-chart (the nested svg cannot draw its own border); like the header rule.
    if (exBox) grid += el("line", { x1: 0, x2: W, y1: exBox.y, y2: exBox.y, "data-rule": true });
    if (more) {
      const step = Math.min(left, spec.page ?? left);
      hits += el(
        "g",
        { "data-maya": "more", role: "button", tabindex: 0 },
        el("rect", { x: 0, y: r(y), width: W, height: ROW + 6, fill: "transparent" }) +
          el(
            "text",
            { x: PAD, y: r(y + (ROW + 6) / 2), "dominant-baseline": "middle" },
            esc(`${ctx.t("showMore", step)} · ${ctx.t("rowsOf", drawn.length, rows.length)}`),
          ),
      );
    }
    // The data table gains the text and strip columns (a strip's squares read as "label: +value").
    const sr = dims.length || cellDefs.length;
    const table = sr
      ? {
          head: [spec.x, ...dims, ...ms, ...cellDefs.map(([t]) => t)].map(title),
          rows: rows.slice(0, 1000).map((rw) => [
            ctx.fmt(spec.x, rw.name),
            ...rw.txt,
            ...rw.vals.map((v, i) => (v === null ? "" : ctx.fmt(ms[i]!, v))),
            ...cellDefs.map(([t, c]) =>
              c.labels
                .map((lb, i) => {
                  const v = c.values.get(rw.name)?.[i] ?? null;
                  return v === null
                    ? ""
                    : `${ctx.fmt(spec.cells.get(t)!.by, lb)} ${v > 0 ? "+" : ""}${ctx.fmt(spec.cells.get(t)!.field, v)}`;
                })
                .filter(Boolean)
                .join(", "),
            ),
          ]),
        }
      : undefined;
    return {
      marks,
      hits,
      grid,
      ...(table && { table }),
      ...(spec.scroll && { height: Math.max(end, HEAD + ROW) }),
      ...(exBox && { expand: exBox }),
    };
  },
};
