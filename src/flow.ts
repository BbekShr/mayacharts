// mayacharts/flow: sankey. Imports only registry, svg and types (never validate/render/shape).
import { register } from "./core/registry.ts";
import { el, key, r } from "./core/svg.ts";
import type { Mark } from "./core/types.ts";

const W = 12;
const PAD = 8;

interface N {
  lv: number;
  name: string;
  i: number;
  in: number;
  out: number;
  v: number;
  y: number;
}
interface L {
  s: N;
  t: N;
  vals: number[];
  v: number;
  sy: number;
  ty: number;
}

export const sankey: Mark = {
  noun: "Sankey",
  check(spec, fail) {
    if (!Array.isArray(spec.path) || spec.path.length < 2)
      fail(
        "invalid-option",
        "path",
        'spec.path on "sankey" needs at least 2 levels.',
        'Example: path: ["source", "target"] (outer to inner).',
      );
  },
  draw(ctx) {
    const { spec, plot } = ctx;
    const P = spec.path;
    const cols = P.length;
    // Maps, not objects: node names such as "__proto__" are plain data.
    const nodes: N[] = [];
    const byLv: Map<string, N>[] = P.map(() => new Map());
    const links = new Map<string, L>();
    const node = (lv: number, name: string): N => {
      let n = byLv[lv]!.get(name);
      if (!n) {
        n = { lv, name, i: nodes.length, in: 0, out: 0, v: 0, y: 0 };
        byLv[lv]!.set(name, n);
        nodes.push(n);
      }
      return n;
    };
    for (const row of spec.data) {
      const v = row[spec.y];
      if (typeof v !== "number") continue;
      if (!(v > 0))
        ctx.fail(
          "non-positive-value",
          spec.y,
          `spec.${spec.y} is ${v}, but sankey sizes must be positive.`,
        );
      let prev = node(0, String(row[P[0]!]));
      for (let lv = 1; lv < cols; lv++) {
        const next = node(lv, String(row[P[lv]!]));
        const k = prev.i + "\0" + next.i;
        let l = links.get(k);
        if (!l) links.set(k, (l = { s: prev, t: next, vals: [], v: 0, sy: 0, ty: 0 }));
        l.vals.push(v);
        prev = next;
      }
    }
    const red = ctx.agg(spec.aggregate);
    const ls = [...links.values()];
    for (const l of ls) {
      l.v = red(l.vals) ?? 0;
      if (!(l.v > 0))
        ctx.fail(
          "non-positive-value",
          spec.y,
          `link ${l.s.name} to ${l.t.name} is ${l.v}, but sankey sizes must be positive.`,
        );
      l.s.out += l.v;
      l.t.in += l.v;
    }
    for (const n of nodes) n.v = Math.max(n.in, n.out);

    // ponytail: no crossing minimisation; columns sorted by value only.
    const col = (lv: number) => nodes.filter((n) => n.lv === lv).sort((a, b) => b.v - a.v);
    let k = Infinity;
    for (let lv = 0; lv < cols; lv++) {
      const c = col(lv);
      const sum = c.reduce((a, n) => a + n.v, 0);
      if (sum > 0) k = Math.min(k, (plot.h - PAD * (c.length - 1)) / sum);
    }
    if (!(k > 0 && k < Infinity)) k = 0;
    for (let lv = 0; lv < cols; lv++) {
      let y = plot.y;
      for (const n of col(lv)) ((n.y = y), (y += n.v * k + PAD));
    }
    const x = (n: N) => plot.x + (n.lv * (plot.w - W)) / (cols - 1);
    for (const n of nodes) {
      let o = n.y;
      for (const l of ls.filter((l) => l.s === n).sort((a, b) => a.t.y - b.t.y))
        ((l.sy = o), (o += l.v * k));
      o = n.y;
      for (const l of ls.filter((l) => l.t === n).sort((a, b) => a.s.y - b.s.y))
        ((l.ty = o), (o += l.v * k));
    }

    let c = 0;
    let marks = "";
    for (const l of ls) {
      const [x0, x1, th, m] = [x(l.s) + W, x(l.t), l.v * k, (x(l.s) + W + x(l.t)) / 2];
      const [a, b] = [l.sy, l.ty];
      const d = `M${r(x0)} ${r(a)}C${r(m)} ${r(a)} ${r(m)} ${r(b)} ${r(x1)} ${r(b)}L${r(x1)} ${r(b + th)}C${r(m)} ${r(b + th)} ${r(m)} ${r(a + th)} ${r(x0)} ${r(a + th)}Z`;
      marks += el("path", {
        "data-maya": "link",
        "data-key": key("k", l.s.lv, l.s.name, l.t.name),
        "data-c": c++,
        "data-s": l.s.i % 8,
        "data-x": `${l.s.name} → ${l.t.name}`,
        "data-series": "",
        "data-y": l.v,
        "data-f": ctx.fmt(spec.y, l.v),
        d,
      });
    }
    for (const n of nodes) {
      const h = n.v * k;
      marks += el("rect", {
        "data-maya": "mark",
        "data-key": key("n", n.lv, n.name),
        "data-c": c++,
        "data-s": n.i % 8,
        "data-x": n.name,
        "data-series": "",
        "data-y": n.v,
        "data-f": ctx.fmt(spec.y, n.v),
        "data-depth": n.lv,
        x: r(x(n)),
        y: r(n.y),
        width: W,
        height: r(h),
      });
      const last = n.lv === cols - 1;
      ctx.label(last ? x(n) - 4 : x(n) + W + 4, n.y + h / 2, n.name, last ? "end" : "start");
    }
    return { marks, hits: "" };
  },
};

register("sankey", sankey);

export {};
