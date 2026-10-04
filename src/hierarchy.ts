// treemap + sunburst. Importing this file registers both types.
import { register } from "./core/registry.ts";
import { el, esc, hit, key, r } from "./core/svg.ts";
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
  type Raw = { kids: Map<string, Raw>; ys: number[]; cs: number[] };
  const mk = (): Raw => ({ kids: new Map(), ys: [], cs: [] });
  const top = mk();
  for (const row of rows) {
    const v = row[y];
    if (typeof v !== "number") continue;
    let n = top;
    for (const f of path) {
      const k = String(row[f]);
      n = n.kids.get(k) ?? n.kids.set(k, mk()).get(k)!;
    }
    n.ys.push(v);
    const c = cb === null ? null : row[cb];
    if (typeof c === "number") n.cs.push(c);
  }
  const build = (raw: Raw, name: string, depth: number, parts: string[]): Node => {
    const children = [...raw.kids].map(([k, c]) => build(c, k, depth + 1, [...parts, k]));
    return {
      name,
      children,
      depth,
      parts,
      cv: raw.cs.length ? agg(raw.cs) : null,
      value: children.length ? children.reduce((s, c) => s + c.value, 0) : (agg(raw.ys) ?? 0),
    };
  };
  return build(top, "", 0, []);
}

/** Bruls squarify: [node, x, y, w, h] for `nodes` filling the box. */
function squarify(nodes: Node[], x: number, y: number, w: number, h: number) {
  const out: [Node, number, number, number, number][] = [];
  const items = nodes.filter((n) => n.value > 0).sort((a, b) => b.value - a.value);
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
function setup(ctx: MarkCtx) {
  const { spec } = ctx;
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
  const cb = typeof spec.colorBy === "string" && spec.colorBy !== "sign" ? spec.colorBy : null;
  const root = tree(spec.data, spec.path, spec.y, ctx.agg(spec.aggregate as Aggregate), cb);
  let c = 0;
  const tops = root.children;
  const attrs = (n: Node) => {
    const parts = [...spec.drilled, ...n.parts];
    const s = tops.findIndex((t) => t.name === n.parts[0]);
    return {
      "data-maya": "mark",
      "data-key": key("h", ...parts),
      "data-c": c++,
      "data-s": s % 8,
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

const treemap: Mark = {
  noun: "Treemap",
  draw(ctx): MarkOut {
    const { plot, spec } = ctx;
    const { root, attrs } = setup(ctx);
    let marks = "";
    let hits = "";
    const walk = (n: Node, x: number, y: number, w: number, h: number): void => {
      // 0.5 px inset below the top level: siblings sit 1 px apart (stroke adds more).
      const g = n.depth > 1 ? 0.5 : 0;
      const [bx, by, bw, bh] = [x + g, y + g, Math.max(0, w - 2 * g), Math.max(0, h - 2 * g)];
      if (!n.children.length) {
        const a = attrs(n);
        marks += el("rect", { ...a, x: r(bx), y: r(by), width: r(bw), height: r(bh) });
        hits += hit(a, bx, by, bw, bh);
        // Name over value when both fit, else "name · value" on one line, else the value.
        const [lx, ly, f, one] = [
          bx + bw / 2,
          by + bh / 2,
          a["data-f"],
          `${n.name} · ${a["data-f"]}`,
        ];
        if (!spec.labels || bh < 16) return;
        if (bh >= 34 && text(n.name) <= bw && text(f) <= bw)
          ctx.label(lx, ly - 8, n.name, "center") && ctx.label(lx, ly + 8, f, "center");
        else if (text(one) <= bw) ctx.label(lx, ly, one, "center");
        else if (text(f) <= bw) ctx.label(lx, ly, f, "center");
        return;
      }
      if (n.depth === 1 && text(n.name) <= bw && bh >= 30)
        ctx.label(bx + bw / 2, by + 9, n.name, "center");
      for (const [c, cx, cy, cw, ch] of squarify(n.children, bx, by, bw, bh))
        walk(c, cx, cy, cw, ch);
    };
    walk(root, plot.x, plot.y, plot.w, plot.h);
    return { marks, hits };
  },
};

const TAU = Math.PI * 2;

const sunburst: Mark = {
  noun: "Sunburst",
  draw(ctx): MarkOut {
    const { plot, spec } = ctx;
    const { root, attrs } = setup(ctx);
    const D = spec.path.length;
    const R = Math.min(plot.w, plot.h) / 2;
    const [cx, cy] = [plot.x + plot.w / 2, plot.y + plot.h / 2];
    const pt = (rad: number, a: number) =>
      `${r(cx + rad * Math.cos(a - Math.PI / 2))} ${r(cy + rad * Math.sin(a - Math.PI / 2))}`;
    let marks = "";
    const walk = (n: Node, a0: number, a1: number): void => {
      if (n.depth) {
        const [r0, r1] = [(n.depth * R) / (D + 1), ((n.depth + 1) * R) / (D + 1)];
        const e = Math.min(a1, a0 + (TAU * 359.99) / 360);
        const big = e - a0 > Math.PI ? 1 : 0;
        const d =
          `M${pt(r1, a0)}A${r(r1)} ${r(r1)} 0 ${big} 1 ${pt(r1, e)}` +
          `L${pt(r0, e)}A${r(r0)} ${r(r0)} 0 ${big} 0 ${pt(r0, a0)}Z`;
        marks += el("path", { ...attrs(n), d });
      }
      let a = a0;
      for (const c of n.children) {
        const span = ((a1 - a0) * c.value) / n.value;
        walk(c, a, a + span);
        a += span;
      }
    };
    walk(root, 0, TAU);
    return { marks, hits: "" };
  },
};

register("treemap", treemap);
register("sunburst", sunburst);

const pct = (p: number) => (p > 0 && p < 0.005 ? "<1%" : `${Math.round(p * 100)}%`);

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
    if (!grand) return { marks: "", hits: "" };
    const gap = 4;
    const [top, bot] = [plot.y + 2, plot.y + plot.h - 20];
    const free = plot.w - gap * (categories.length - 1);
    let marks = "";
    let hits = "";
    let x = plot.x;
    categories.forEach((name, ci) => {
      const t = tot[ci] ?? 0;
      const w = (free * t) / grand;
      let y = bot;
      for (const si of shaped.visible) {
        const v = val.get(`${ci}/${si}`);
        if (!v) continue;
        const h = ((bot - top) * v) / t;
        const f = ctx.fmt(spec.y, v);
        const a = {
          "data-maya": "mark",
          "data-key": key(series[si], name),
          "data-c": ci,
          "data-s": si % 8,
          "data-x": name,
          "data-series": series[si],
          "data-y": v,
          "data-f": `${f} (${pct(v / t)})`,
        };
        y -= h;
        marks += el("rect", { ...a, x: r(x), y: r(y), width: r(w), height: r(h) });
        hits += hit(a, x, y, w, h);
        if (spec.labels && h >= 16) {
          const share = pct(v / t);
          ctx.label(
            x + w / 2,
            y + h / 2,
            `${f} (${share})`.length * 7.2 + 4 <= w ? `${f} (${share})` : share,
            "center",
          );
        }
      }
      if (w > 0) ctx.label(x + w / 2, plot.y + plot.h - 20, name, "below");
      x += w + gap;
    });
    return { marks, hits };
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
    if (!sum) return { marks: "", hits: "" };
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
