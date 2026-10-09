// treemap + sunburst. Importing this file registers both types.
import { register } from "./core/registry.ts";
import { DEG } from "./core/scale.ts";
import { OTHER, cbField, clip, el, esc, hit, key, memo, r } from "./core/svg.ts";
import type { Aggregate, Mark, MarkCtx, MarkOut, Row } from "./core/types.ts";

interface Node {
  name: string;
  value: number;
  children: Node[];
  depth: number;
  /** Names from the first path level down to this node. */
  parts: string[];
  /** colorBy field value (leaves only). */
  cv: number | null;
}

type Reduce = ReturnType<MarkCtx["agg"]>;

/** Rows -> nested tree in first-appearance order. Map-keyed, so any name is safe. */
export function tree(
  rows: readonly Row[],
  path: readonly string[],
  y: string,
  agg: Reduce,
  cb: string | null = null,
): Node {
  // Leaves dominate row counts, so a node allocates its Map and colour list only when used.
  type Raw = { kids: Map<string, Raw> | null; ys: number[]; cs: number[] | null };
  const mk = (): Raw => ({ kids: null, ys: [], cs: null });
  const top = mk();
  for (const row of rows) {
    const v = row[y];
    if (typeof v !== "number") continue;
    let n = top;
    for (const f of path) {
      const k = String(row[f]);
      const m = (n.kids ??= new Map());
      n = m.get(k) ?? m.set(k, mk()).get(k)!;
    }
    n.ys.push(v);
    const c = cb === null ? null : row[cb];
    if (typeof c === "number") (n.cs ??= []).push(c);
  }
  const build = (raw: Raw, name: string, depth: number, parts: string[]): Node => {
    const children = [...(raw.kids ?? [])].map(([k, c]) => build(c, k, depth + 1, [...parts, k]));
    return {
      name,
      children,
      depth,
      parts,
      cv: raw.cs ? agg(raw.cs) : null,
      value: children.length ? children.reduce((s, c) => s + c.value, 0) : (agg(raw.ys) ?? 0),
    };
  };
  return build(top, "", 0, []);
}

/** Largest first; Array.sort is stable, so ties keep first-appearance order. */
const big = (a: Node, b: Node) => b.value - a.value;

/** Bruls squarify: [node, x, y, w, h] for `nodes` filling the box. */
function squarify(nodes: Node[], x: number, y: number, w: number, h: number) {
  const out: [Node, number, number, number, number][] = [];
  const items = nodes.filter((n) => n.value > 0).sort(big);
  let rest = items.reduce((s, n) => s + n.value, 0);
  let i = 0;
  while (i < items.length) {
    const side = Math.min(w, h);
    const scale = (w * h) / rest;
    const worst = (a: number, mn: number, mx: number) =>
      Math.max((side * side * mx) / (a * a), (a * a) / (side * side * mn));
    let j = i;
    let sum = 0;
    let best = Infinity;
    for (; j < items.length; j++) {
      const v = items[j]!.value * scale;
      const s = sum + v;
      const wst = worst(s, v, items[i]!.value * scale);
      if (j > i && wst > best) break;
      best = wst;
      sum = s;
    }
    const row = items.slice(i, j);
    const thick = side ? sum / side : 0;
    let p = 0;
    for (const n of row) {
      const len = sum ? (n.value * scale * side) / sum : 0;
      out.push(w >= h ? [n, x, y + p, thick, len] : [n, x + p, y, len, thick]);
      p += len;
    }
    if (w >= h) ((x += thick), (w -= thick));
    else ((y += thick), (h -= thick));
    rest -= row.reduce((s, n) => s + n.value, 0);
    i = j;
  }
  return out;
}

/** Validate values, build the tree, and compute attributes shared by both marks. */
function setup(ctx: MarkCtx, flat = !!ctx.spec.drill, hue: number | null = null) {
  const { spec } = ctx;
  const cb = cbField(spec);
  // The validation pass and the tree are kept per data array: a re-render of the same rows (resize, hover, drill) skips them.
  const whole = memo(spec.data, `tree|${spec.path}|${spec.y}|${cb}|${spec.aggregate}`, () => {
    spec.data.forEach((row, i) => {
      const v = row[spec.y];
      if (typeof v === "number" && !(v > 0))
        ctx.fail(
          "non-positive-value",
          `data[${i}].${spec.y}`,
          `Value ${v} is not positive.`,
          "Treemaps and sunbursts size shapes by value, so every value must be above zero.",
          'To show negative values use a bar chart with colorBy: "sign".',
        );
    });
    return tree(spec.data, spec.path, spec.y, ctx.agg(spec.aggregate as Aggregate), cb);
  });
  // The tree is shared between renders: drilling flattens a copy.
  const root = flat
    ? { ...whole, children: whole.children.map((n) => ({ ...n, children: [] })) }
    : whole;
  // Drilling: draw only the next level; a click pushes it, so each click goes one level deeper.
  let c = 0;
  // Colour slots follow size (the drawn order), so neighbours differ until the palette wraps.
  const tops = [...root.children].sort(big);
  const attrs = (n: Node, other = false) => {
    const parts = [...spec.drilled, ...n.parts];
    const s = hue ?? tops.findIndex((t) => t.name === n.parts[0]);
    return {
      "data-maya": "mark",
      // The "Other (n)" lump is keyed by the sentinel, not its count, so a new count still sweeps.
      "data-key": key("h", ...(other ? [...parts.slice(0, -1), OTHER] : parts)),
      "data-c": c++,
      "data-s": s < 0 ? null : s % 8, // the depth-1 lump matches no top node: neutral
      "data-x": parts.join(" › "),
      "data-series": "",
      "data-y": n.value,
      "data-f": ctx.fmt(spec.y, n.value),
      "data-tone": ctx.tone(n.value),
      "data-q": n.cv === null ? null : ctx.q(n.cv),
      "data-depth": n.depth,
    };
  };
  return { root, tops, attrs };
}

const text = (s: string) => s.length * 7.2 + 4;

/** The no-data text, centred on the plot, for a mark with nothing to draw. */
const none = (c: MarkCtx): MarkOut => (
  c.label(c.plot.x + c.plot.w / 2, c.plot.y + c.plot.h / 2 + 4, c.t("noData"), "above"),
  { marks: "", hits: "" }
);

const treemap: Mark = {
  noun: "Treemap",
  draw(ctx): MarkOut {
    const { plot, spec } = ctx;
    const { root, attrs } = setup(ctx, !!spec.drill, spec.hue); // a drilled branch keeps its colour
    let marks = "";
    let hits = "";
    const walk = (n: Node, x: number, y: number, w: number, h: number): void => {
      // 0.5 px inset below the top level: siblings sit 1 px apart (stroke adds more).
      const g = n.depth > 1 ? 0.5 : 0;
      const [bx, by, bw, bh] = [x + g, y + g, Math.max(0, w - 2 * g), Math.max(0, h - 2 * g)];
      if (!n.children.length) {
        if (bw * bh < 4) return; // ponytail: leaves under ~2 px a side are not drawn
        const a = attrs(n);
        // A drilled branch is one hue: its tiles step through three tints in size order.
        const tint = spec.drilled.length ? 1 + (a["data-c"] % 3) : null;
        marks += el("rect", {
          ...a,
          "data-tint": tint,
          x: r(bx),
          y: r(by),
          width: r(bw),
          height: r(bh),
        });
        // No data-depth on the hit: [data-depth] strokes would outline every grown target.
        hits += hit({ ...a, "data-depth": null }, bx, by, bw, bh);
        // Name over value when both fit (the name cut with an ellipsis, never dropped), else "name · value", else the value.
        const [lx, ly, f] = [bx + bw / 2, by + bh / 2, a["data-f"]];
        const cap = Math.floor((bw - 4) / 7.2);
        if (spec.labels === false || bh < 16) return; // names on unless turned off
        if (bh >= 34 && cap >= 3)
          ctx.label(lx, ly - 8, clip(n.name, cap), "center") &&
            text(f) <= bw &&
            ctx.label(lx, ly + 8, f, "center");
        else if (text(`${n.name} · ${f}`) <= bw) ctx.label(lx, ly, `${n.name} · ${f}`, "center");
        else if (text(f) <= bw) ctx.label(lx, ly, f, "center");
        return;
      }
      if (n.depth === 1 && bw >= 28 && bh >= 30)
        ctx.label(bx + bw / 2, by + 9, clip(n.name, Math.floor((bw - 4) / 7.2)), "center");
      for (const [c, cx, cy, cw, ch] of squarify(n.children, bx, by, bw, bh))
        walk(c, cx, cy, cw, ch);
    };
    walk(root, plot.x, plot.y, plot.w, plot.h);
    return { marks, hits };
  },
};

const pct = (p: number) => (p > 0 && p < 0.005 ? "<1%" : `${Math.round(p * 100)}%`);

/*
 * Sunburst slices are stroked circles, not paths: pathLength 360 makes the dash an angle, so
 * r, stroke-width, stroke-dasharray and stroke-dashoffset (all CSS properties) carry the whole
 * shape and a drill sweeps in angle space (animate.ts). Dash period is exactly 360, so a slice
 * that crosses the circle's start (3 o'clock) wraps. Offset = 90 - start, angles from 12 o'clock.
 * Every level is drawn; a drill zooms: the branch becomes the centre disk and fills the circle.
 */
const sunburst: Mark = {
  noun: "Sunburst",
  draw(ctx): MarkOut {
    const { plot, spec } = ctx;
    const { root, attrs } = setup(ctx, false, spec.hue); // a drilled branch keeps its colour
    const w = Math.min(plot.w, plot.h) / 2 / (spec.path.length + 1); // ring width; the disk is one
    const [cx, cy] = [plot.x + plot.w / 2, plot.y + plot.h / 2];
    const at = (rad: number, deg: number) => [
      cx + rad * Math.sin(deg / DEG),
      cy - rad * Math.cos(deg / DEG),
    ];
    const circle = (a: object, rm: number, a0: number, sweep: number) =>
      el("circle", {
        ...a,
        cx: r(cx),
        cy: r(cy),
        r: r(rm),
        "stroke-width": r(Math.max(0, w - 1)),
        pathLength: 360,
        "stroke-dasharray": `${r(sweep)} ${r(360 - sweep)}`,
        "stroke-dashoffset": r(90 - a0),
      });
    const names = spec.labels !== false; // on unless turned off: a sunburst without names is unreadable
    let marks = "";
    let labels = "";
    const walk = (n: Node, a0: number, a1: number, parent: Node, other = false): void => {
      const span = a1 - a0;
      if (n.depth) {
        const rm = (n.depth + 0.5) * w;
        if ((span / DEG) * (rm + w / 2) < 2) return; // ponytail: arcs under 2 px are not drawn (nor their children)
        const full = span > 359.99;
        const pad = full ? 0 : Math.min(span / 2, DEG / rm); // 1 px between siblings
        const a = { ...attrs(n, other), "data-other": other || null };
        const share = pct(n.value / parent.value);
        a["data-f"] += ` · ${n.depth > 1 ? ctx.t("shareOf", share, parent.name) : share}`;
        marks += circle(
          { ...a, "data-tint": Math.min(3, n.depth + spec.drilled.length) },
          rm,
          a0 + pad / 2,
          span - pad,
        );
        // Label along the arc (upright, cut to what fits: the whole name or 4 characters at least),
        // else along the radius, else none. Depth 1 sits on a full-strength fill: dark ink.
        const sw = span - pad;
        const mid = a0 + span / 2;
        const [lx, ly] = at(rm, mid) as [number, number];
        const nm = n.name;
        const tw = text(nm) / 2;
        // ponytail: a straight name must stay inside the ring (its chord sags (w - 12) / 2 at most), so long names are cut, never curved.
        const cap = Math.floor((Math.min((sw / DEG) * rm, Math.sqrt(4 * rm * (w - 12))) - 6) / 7.2);
        const [rot, shown] =
          cap >= Math.min(nm.length, 4)
            ? [
                mid + (mid > 90 && mid < 270 ? 180 : 0),
                nm.length > cap ? `${nm.slice(0, cap - 1)}…` : nm,
              ]
            : tw < w / 2 - 2 && (sw / DEG) * (rm - tw) >= 14
              ? [mid + (mid < 180 ? -90 : 90), nm]
              : [null, nm];
        if (names && rot !== null)
          labels += el(
            "text",
            {
              x: r(lx),
              y: r(ly),
              transform: rot ? `rotate(${r(rot)} ${r(lx)} ${r(ly)})` : null,
              "text-anchor": "middle",
              "dominant-baseline": "middle",
              "data-in": true,
              "data-ink": n.depth === 1 ? "" : null,
            },
            esc(shown),
          );
      }
      const kids = [...n.children].sort(big);
      let a = a0;
      for (const [i, c] of kids.entries()) {
        let s = (span * c.value) / n.value;
        // Slivers under 4 px across read as hatching: the rest (all smaller) become one "Other (n)".
        // The largest child is never lumped: it keeps a 3 px tick, so a ring of slivers still names its head.
        if (!i) s = Math.max(s, (3 * DEG) / ((c.depth + 1) * w));
        else if (kids[i + 1] && (s / DEG) * (c.depth + 0.5) * w < 4) {
          const name = `${ctx.t("other")} (${kids.length - i})`;
          const value = kids.slice(i).reduce((q, k) => q + k.value, 0); // by value: the tick moved the angle
          walk({ ...c, name, value, children: [], parts: [...n.parts, name] }, a, a1, n, true);
          break;
        }
        walk(c, a, a + s, n);
        a += s;
      }
    };
    walk(root, 0, 360, root);
    // Centre disk: the current branch (key of its slice one level up, so a drill grows it in).
    const name = spec.drilled.at(-1) ?? ctx.t("total");
    const f = ctx.fmt(spec.y, root.value);
    marks += circle(
      {
        ...attrs(root),
        "data-s": spec.hue === null ? null : spec.hue % 8,
        "data-tint": Math.min(3, spec.drilled.length) || null,
        "data-x": name,
        "data-depth": 0,
      },
      (w - 1) / 2,
      0,
      360,
    );
    if (names && text(name) <= 2 * w - 8 && text(f) <= 2 * w - 8)
      ctx.label(cx, cy - 8, name, "center") && ctx.label(cx, cy + 8, f, "center");
    return { marks, hits: "", labels };
  },
};

register("treemap", treemap);
register("sunburst", sunburst);

/** Column width ~ column total; segments are shares of the column total (visible series only). */
export const marimekko: Mark = {
  noun: "Marimekko",
  draw(ctx): MarkOut {
    const { plot, spec, shaped } = ctx;
    const { categories, series, cells } = shaped;
    // ponytail: negative and null values count as 0, a stack of shares cannot show them.
    const val = new Map<string, number>();
    const tot = categories.map(() => 0);
    for (const c of cells) {
      const v = Math.max(0, c.value ?? 0);
      val.set(`${c.ci}/${c.si}`, v);
      tot[c.ci] = (tot[c.ci] ?? 0) + v;
    }
    const grand = tot.reduce((a, b) => a + b, 0);
    if (!grand) return none(ctx);
    // Left gutter for the 0-100% scale, bottom strip for "name · share of total".
    const [x0, top, bot] = [plot.x + 36, plot.y + 8, plot.y + plot.h - 26];
    const [gap, sg] = [3, 1.5];
    const live = tot.filter((t) => t > 0).length;
    const free = plot.x + plot.w - 1 - x0 - gap * (live - 1);
    let marks = "";
    let hits = "";
    let grid = "";
    let labels = "";
    const on = spec.labels !== false;
    const txt = (x: number, y: number, s: string, a: Record<string, string | number>) =>
      el("text", { x: r(x), y: r(y), "text-anchor": "middle", "data-in": true, ...a }, esc(s));
    // Scale: gridlines behind the columns show through the gaps; ticks stay inside the plot.
    for (const p of bot - top < 120 ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1]) {
      const ty = r(bot - (bot - top) * p);
      grid += el("line", { x1: plot.x + 32, x2: plot.x + plot.w, y1: ty, y2: ty });
      if (on)
        labels += txt(plot.x + 30, ty, `${p * 100}%`, {
          "text-anchor": "end",
          "dominant-baseline": "middle",
          "data-ax": "",
        });
    }
    let x = x0;
    categories.forEach((name, ci) => {
      const t = tot[ci] ?? 0;
      if (!t) return;
      const w = (free * t) / grand;
      let y = bot;
      for (const si of shaped.visible) {
        const v = val.get(`${ci}/${si}`);
        if (!v) continue;
        const h = ((bot - top) * v) / t;
        const share = pct(v / t);
        const a = {
          "data-maya": "mark",
          "data-key": key(series[si], name),
          "data-c": ci,
          "data-s": si % 8,
          "data-x": name,
          "data-series": series[si],
          "data-y": v,
          "data-f": `${ctx.fmt(spec.y, v)} (${share})`,
          "data-mm": true,
        };
        y -= h;
        // Segments sit 1.5 px apart: each is inset half the gap, so the stack keeps its true height.
        const [sy, sh] = [y + sg / 2, Math.max(0, h - sg)];
        marks += el("rect", { ...a, x: r(x), y: r(sy), width: r(w), height: r(sh) });
        hits += hit(a, x, y, w, h);
        const [cx, cy] = [x + w / 2, y + h / 2];
        // Share, plus the series name above it when the segment is tall and wide enough.
        if (on && h >= 18 && text(share) <= w) {
          const two = h >= 40 && text(series[si]!) <= w;
          if (two)
            labels += txt(cx, cy - 8, series[si]!, {
              "dominant-baseline": "middle",
              "data-ink": "n",
            });
          labels += txt(cx, cy + (two ? 8 : 0), share, {
            "dominant-baseline": "middle",
            "data-ink": "",
          });
        }
      }
      // Column label: name and its share of the grand total, shortened to what fits.
      const gs = pct(t / grand);
      const full = `${name} · ${gs}`;
      const room = Math.floor((w + gap - 4) / 7.2); // chars that fit; a name is cut, never swapped for a bare share
      const fit =
        full.length <= room
          ? full
          : name.length <= room
            ? name
            : room >= 4
              ? `${name.slice(0, room - 1)}…`
              : "";
      // Too narrow for one line: the name over its share, both kept.
      const two = fit !== full && gs.length <= room && fit.length > 3;
      if (on && fit) {
        labels += txt(x + w / 2, bot + (two ? 10 : 17), fit, { "data-col": "" });
        if (two) labels += txt(x + w / 2, bot + 22, gs, { "data-col": "" });
      }
      x += w + gap;
    });
    return { marks, hits, grid, labels };
  },
};

/** 10x10 cells split between the x categories by largest remainder. */
export const waffle: Mark = {
  noun: "Waffle",
  draw(ctx): MarkOut {
    const { plot, spec, shaped } = ctx;
    const vals = shaped.categories.map(() => 0);
    for (const c of shaped.cells) vals[c.ci] = (vals[c.ci] ?? 0) + Math.max(0, c.value ?? 0);
    const sum = vals.reduce((a, b) => a + b, 0);
    if (!sum) return none(ctx);
    const n = vals.map((v) => Math.floor((v / sum) * 100));
    const left = 100 - n.reduce((a, b) => a + b, 0);
    vals
      .map((v, i) => [((v / sum) * 100) % 1, i] as const)
      .sort((a, b) => b[0] - a[0] || a[1] - b[1])
      .slice(0, left)
      .forEach(([, i]) => (n[i] = (n[i] ?? 0) + 1));
    const step = Math.min(plot.w, plot.h) / 10;
    const [ox, oy] = [plot.x + (plot.w - step * 10) / 2, plot.y + (plot.h - step * 10) / 2];
    const g = Math.min(3, step * 0.12);
    let marks = "";
    let hits = "";
    let i = 0;
    shaped.categories.forEach((name, ci) => {
      const v = vals[ci] ?? 0;
      for (let k = 0; k < (n[ci] ?? 0); k++, i++) {
        const [cx, cy] = [ox + (i % 10) * step, oy + Math.floor(i / 10) * step];
        const a = {
          "data-maya": "mark",
          "data-key": key("w", name, k),
          "data-c": i,
          "data-s": ci % 8,
          // Hovering a cell lights its whole category, the way flows light a path (tooltip.ts).
          "data-n": "w" + ci,
          "data-a": "w" + ci,
          "data-x": name,
          "data-series": "",
          "data-y": v,
          "data-f": `${ctx.fmt(spec.y, v)} (${pct(v / sum)})`,
        };
        marks += el("rect", {
          ...a,
          x: r(cx + g / 2),
          y: r(cy + g / 2),
          width: r(step - g),
          height: r(step - g),
        });
        // The hit covers the whole grid step so the gaps between cells still hit.
        hits += el("rect", {
          ...a,
          "data-maya": "hit",
          x: r(cx),
          y: r(cy),
          width: r(step),
          height: r(step),
          fill: "transparent",
        });
      }
    });
    const legend =
      `<div class="maya-legend" data-maya="legend">` +
      shaped.categories
        .map(
          (name, ci) =>
            `<span data-s="${ci % 8}"><i></i>${esc(name)} ${pct((vals[ci] ?? 0) / sum)}</span>`,
        )
        .join("") +
      `</div>`;
    return { marks, hits, legend };
  },
};
register("marimekko", marimekko);
register("waffle", waffle);

export {};
