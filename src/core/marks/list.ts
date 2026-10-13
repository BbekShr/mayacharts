import { formatAs } from "../format.ts";
import { moves } from "../shape.ts";
import { clip, el, esc, key, r } from "../svg.ts";
import type { Mark } from "../types.ts";

const PAD = 8;
const IND = 28; // headline indent (the number's column)
const LH = 16; // body line height
const EV = 22; // evidence row
const MORE = 22; // the "+n more" row

/** Greedy word wrap by width estimate; the last allowed line ends in an ellipsis when text remains. */
const wrap = (text: string, n: number, lines: number): string[] => {
  const out: string[] = [];
  let cur = "";
  let cut = false;
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if (cut) break;
    if (!cur || [...cur].length + 1 + [...w].length <= n) cur = cur ? `${cur} ${w}` : w;
    else if (out.length + 1 < lines) (out.push(cur), (cur = w));
    else cut = true;
  }
  if (cur) out.push(cur);
  if (cut || out.some((l) => [...l].length > n))
    out[out.length - 1] = clip(
      out[out.length - 1]!.replace(/[\s.,;:]+$/, "") + (cut ? "…" : ""),
      n,
    );
  return out;
};

/**
 * Insight list (#79). One row per move in data order: number and bold headline, its value in its
 * own format at the right, body text under it (two lines, one on a 300 px tile), and for an open
 * move its evidence as bars on a scale local to that move. Rows that do not fit the height are
 * not drawn, a "+n more" row says how many: body lines give way first (two, one, never none).
 */
export const list: Mark = {
  noun: "List",
  draw(ctx) {
    const { spec: s, width: W, height: H } = ctx;
    const all = moves(s);
    const title = (f: string) => s.titles.get(f) ?? f;
    const val = (v: number | null, f: string | null) => (v === null ? "–" : formatAs(s, s.y, f, v));
    const bars = s.bars.get(s.y) === "bar";
    const chev = s.expand && all.some((m) => m.evidence.length) ? 16 : 0;
    const open = new Set(s.expanded);
    const shows = (m: (typeof all)[0]) => bars && open.has(m.x) && m.evidence.length > 0;
    const bw = W - IND - PAD; // body width in px
    const bodyN = Math.max(8, Math.floor(bw / 6.5));
    // Body lines per row: two (one on a small tile), fewer until the rows fit the height.
    const rowH = (m: (typeof all)[0], L: number) => {
      const n = m.body && L ? wrap(m.body, bodyN, L).length : 0;
      return 36 + (n ? n * LH + 12 : 8) + (shows(m) ? 14 + m.evidence.length * EV : 0);
    };
    let L = W <= 300 ? 1 : 2;
    while (L > 1 && all.reduce((a, m) => a + rowH(m, L), 0) > H) L--;
    // Rows that fit, leaving room for the "+n more" row when some are dropped.
    let fit = all.length;
    for (
      let h = 0;
      fit &&
      (h = all.slice(0, fit).reduce((a, m) => a + rowH(m, L), 0)) + (fit < all.length ? MORE : 0) >
        H;
    )
      fit--;
    let ev = all.length; // evidence bars take categories after the headlines

    let marks = "";
    let hits = "";
    let grid = "";
    let y = 0;
    all.forEach((m, i) => {
      const h = rowH(m, L);
      // ponytail: rows past the height are not drawn (no scroll for a list, a "+n more" row counts them); widths are estimates (6.5 px a body character, 8 px a headline one), so a wide script can wrap early.
      if (i >= fit) return;
      const top = y;
      y += h;
      const name = ctx.fmt(s.x, m.x);
      const f = val(m.value, m.format);
      const isOpen = shows(m);
      const vw = f.length * 8;
      const d = {
        "data-key": key("m", m.x),
        "data-c": i,
        "data-s": 0,
        "data-x": name,
        "data-y": m.value,
        "data-f": f,
        "data-series": title(s.y),
      };
      if (i) grid += el("line", { x1: 0, x2: W, y1: r(top), y2: r(top) });
      marks += el(
        "text",
        { "data-maya": "mark", ...d, x: PAD, y: top + 22, "dominant-baseline": "middle" },
        el("tspan", { "data-num": true }, String(i + 1)) +
          el(
            "tspan",
            { "data-hd": true, x: IND },
            esc(clip(name, Math.max(4, Math.floor((W - IND - PAD - vw - chev - 12) / 8)))),
          ),
      );
      marks += el(
        "text",
        {
          "data-key": key("mv", m.x),
          "data-v": true,
          x: r(W - PAD - chev),
          y: top + 22,
          "text-anchor": "end",
          "dominant-baseline": "middle",
        },
        esc(f),
      );
      if (chev && m.evidence.length)
        marks += el(
          "text",
          {
            "data-key": key("mx", m.x),
            "data-chev": true,
            x: r(W - PAD),
            y: top + 22,
            "text-anchor": "end",
            "dominant-baseline": "middle",
          },
          isOpen ? "▾" : "▸",
        );
      const lines = m.body && L ? wrap(m.body, bodyN, L) : [];
      if (lines.length)
        marks += el(
          "text",
          { "data-key": key("mb", m.x), "data-body": true, x: IND, y: top + 46 },
          lines.map((l, k) => el("tspan", { x: IND, dy: k ? LH : 0 }, esc(l))).join(""),
        );
      hits += el("rect", {
        ...d,
        "data-maya": "hit",
        "aria-expanded": s.expand && m.evidence.length ? String(isOpen) : null,
        x: 0,
        y: r(top),
        width: W,
        height: 36,
        fill: "transparent",
      });
      if (isOpen) {
        const ys = lines.length ? top + 36 + lines.length * LH + 12 + 6 : top + 36 + 8 + 6;
        const nw = Math.min(Math.max(...m.evidence.map((e) => e.name.length)) * 7, (W - IND) * 0.4);
        const fs = m.evidence.map((e) =>
          e.value === null ? "–" : formatAs(s, s.y, e.format ?? m.format, e.value),
        );
        const fw = Math.max(...fs.map((t) => t.length)) * 7.5;
        const x0 = IND + nw + 8;
        const room = Math.max(0, W - PAD - fw - 8 - x0);
        // Bars diverge from a zero line when any value is negative; a negative one takes the bad tone.
        const vs = m.evidence.map((e) => e.value ?? 0);
        const lo = Math.min(0, ...vs);
        const sc = room / (Math.max(0, ...vs) - lo || 1);
        const zx = x0 + -lo * sc;
        if (lo < 0)
          grid += el("line", {
            "data-centre": true,
            x1: r(zx),
            x2: r(zx),
            y1: r(ys),
            y2: r(ys + m.evidence.length * EV),
          });
        m.evidence.forEach((e, k) => {
          const cy = ys + k * EV + EV / 2;
          const v = e.value ?? 0;
          const len = Math.abs(v) * sc;
          const ed = {
            "data-key": key("e", m.x, e.name),
            "data-c": ev++,
            "data-s": 0,
            "data-way": lo < 0 ? (v < 0 ? "down" : "up") : null,
            "data-x": e.name,
            "data-y": e.value,
            "data-f": fs[k],
            "data-series": name,
          };
          marks += el("rect", {
            "data-maya": "mark",
            ...ed,
            x: r(v < 0 ? zx - len : zx),
            y: r(cy - 4),
            width: r(len),
            height: 8,
          });
          marks += el(
            "text",
            {
              "data-key": key("en", m.x, e.name),
              "data-ev": "name",
              x: IND,
              y: r(cy),
              "dominant-baseline": "middle",
            },
            esc(clip(e.name, Math.max(2, Math.floor(nw / 7)))),
          );
          marks += el(
            "text",
            {
              "data-key": key("ef", m.x, e.name),
              "data-ev": "value",
              x: r((v < 0 ? zx : zx + len) + 6),
              y: r(cy),
              "dominant-baseline": "middle",
            },
            esc(fs[k]!),
          );
        });
      }
    });
    if (fit < all.length)
      marks += el(
        "text",
        {
          "data-key": "more",
          "data-more": true,
          x: IND,
          y: r(y + MORE / 2),
          "dominant-baseline": "middle",
        },
        esc(ctx.t("moreMoves", all.length - fit)),
      );
    return {
      marks,
      hits,
      grid,
      table: {
        head: [title(s.x), title(s.y), ...(s.body ? [title(s.body)] : [])],
        rows: all.flatMap((m, i) => [
          [`${i + 1}. ${m.x}`, val(m.value, m.format), ...(s.body ? [m.body ?? ""] : [])],
          ...m.evidence.map((e) => [
            `${m.x}: ${e.name}`,
            e.value === null ? "–" : formatAs(s, s.y, e.format ?? m.format, e.value),
            ...(s.body ? [""] : []),
          ]),
        ]),
      },
    };
  },
};
