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
    // Inset 8 px (half a label) so edge nodes keep their labels; padding shrinks so it never
    // takes more than a quarter of the height, then the scale is what is left over.
    const [top, avail] = [plot.y + 8, Math.max(0, plot.h - 16)];
    const most = Math.max(...Array.from({ length: cols }, (_, lv) => col(lv).length));
    const pad = most > 1 ? Math.min(PAD, avail / 4 / (most - 1)) : 0;
    let k = Infinity;
    for (let lv = 0; lv < cols; lv++) {
      const c = col(lv);
      const sum = c.reduce((a, n) => a + n.v, 0);
      if (sum > 0) k = Math.min(k, (avail - pad * (c.length - 1)) / sum);
    }
    if (!(k > 0 && k < Infinity)) k = 0;
    for (let lv = 0; lv < cols; lv++) {
      let y = top;
      for (const n of col(lv)) ((n.y = y), (y += n.v * k + pad));
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

const TAU = Math.PI * 2;
const RING = 8;
const clip = (s: string, max: number) => {
  const c = [...s];
  return c.length > max ? c.slice(0, max - 1).join("") + "\u2026" : s;
};

interface CN {
  lv: number;
  s: number;
  name: string;
  i: number;
  v: number;
  a: number;
}
interface CL {
  s: CN;
  t: CN;
  vals: number[];
  v: number;
}

/** Chord diagram: from-nodes on the left half, to-nodes on the right, ribbons between them. */
export const chord: Mark = {
  noun: "Chord",
  draw(ctx) {
    const { spec, plot } = ctx;
    const [P0, P1] = spec.path as [string, string];
    const nodes: CN[] = [];
    const byLv: Map<string, CN>[] = [new Map(), new Map()];
    const links = new Map<string, CL>();
    const node = (lv: number, name: string): CN => {
      let n = byLv[lv]!.get(name);
      if (!n) {
        n = { lv, name, i: nodes.length, s: 0, v: 0, a: 0 };
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
          `spec.${spec.y} is ${v}, but chord sizes must be positive.`,
        );
      const s = node(0, String(row[P0]));
      const t = node(1, String(row[P1]));
      const k = s.i + "\0" + t.i;
      let l = links.get(k);
      if (!l) links.set(k, (l = { s, t, vals: [], v: 0 }));
      l.vals.push(v);
    }
    const red = ctx.agg(spec.aggregate);
    const ls = [...links.values()];
    for (const l of ls) {
      l.v = red(l.vals) ?? 0;
      if (!(l.v > 0))
        ctx.fail(
          "non-positive-value",
          spec.y,
          `link ${l.s.name} to ${l.t.name} is ${l.v}, but chord sizes must be positive.`,
        );
      l.s.v += l.v;
      l.t.v += l.v;
    }
    // Palette slots: from-nodes first, then to-nodes, in first-seen order.
    nodes.sort((a, b) => a.lv - b.lv || a.i - b.i).forEach((n, j) => (n.s = j % 8));
    const total = ls.reduce((a, l) => a + l.v, 0);
    if (!(total > 0)) return { marks: "", hits: "" };

    // Angles run clockwise from 12 o'clock. To-nodes fill the right half top to bottom (largest on
    // top), from-nodes the left half bottom to top (largest on top). Each side holds `total`.
    const SIDE = 0.1;
    const GAP = 0.03;
    const sides = [0, 1].map((lv) => nodes.filter((n) => n.lv === lv));
    const k = Math.min(...sides.map((c) => (Math.PI - SIDE - GAP * (c.length - 1)) / total));
    for (const lv of [0, 1]) {
      const c = sides[lv]!.sort((a, b) => (lv ? b.v - a.v : a.v - b.v) || a.i - b.i);
      let a = lv ? SIDE / 2 : Math.PI + SIDE / 2;
      for (const n of c) ((n.a = a), (a += n.v * k + GAP));
    }
    // Label room per side from the longest label (at most 20 characters, at most 36% of the
    // width), so the ring grows to what is left; the pair is then centred as a whole.
    const maxCh = Math.min(20, Math.floor((plot.w * 0.36 - 4) / 7.2));
    const lw = [0, 1].map(
      (lv) => Math.max(0, ...sides[lv]!.map((n) => [...clip(n.name, maxCh)].length)) * 7.2 + 4,
    ) as [number, number];
    const gutter = RING + 4;
    const R = Math.max(
      12,
      Math.min(plot.h / 2 - RING - 20, (plot.w - lw[0] - lw[1] - 2 * gutter - 4) / 2),
    );
    const spare = plot.w - lw[0] - lw[1] - 2 * (R + gutter);
    const cx = plot.x + spare / 2 + lw[0] + R + gutter;
    const cy = plot.y + plot.h / 2;
    const pt = (a: number, rad: number) =>
      `${r(cx + rad * Math.sin(a))} ${r(cy - rad * Math.cos(a))}`;
    const arc = (a0: number, a1: number, rad: number, sweep: 0 | 1) =>
      `A${r(rad)} ${r(rad)} 0 0 ${sweep} ${pt(sweep ? a1 : a0, rad)}`;

    // Ribbon slots: each node hands them out clockwise, ordered to avoid crossings.
    const slot = new Map<CL, { sa: number; ta: number }>();
    for (const n of nodes) {
      const mine = ls
        .filter((l) => (n.lv ? l.t : l.s) === n)
        .sort((x, y) => (n.lv ? y.s.a - x.s.a : y.t.a - x.t.a));
      let a = n.a;
      for (const l of mine) {
        const o = slot.get(l) ?? { sa: 0, ta: 0 };
        n.lv ? (o.ta = a) : (o.sa = a);
        slot.set(l, o);
        a += l.v * k;
      }
    }
    const title = (f: string) => spec.titles.get(f) ?? f;
    let c = 0;
    let marks = "";
    for (const l of ls) {
      const { sa, ta } = slot.get(l)!;
      const [sb, tb] = [sa + l.v * k, ta + l.v * k];
      const d = `M${pt(sa, R)}${arc(sa, sb, R, 1)}Q${r(cx)} ${r(cy)} ${pt(ta, R)}${arc(ta, tb, R, 1)}Q${r(cx)} ${r(cy)} ${pt(sa, R)}Z`;
      marks += el("path", {
        "data-maya": "link",
        "data-key": key("k", 0, l.s.name, l.t.name),
        "data-c": c++,
        "data-s": l.s.s,
        "data-x": `${l.s.name} -> ${l.t.name}`,
        "data-series": "",
        "data-y": l.v,
        "data-f": ctx.fmt(spec.y, l.v),
        d,
      });
    }
    for (const n of nodes) {
      const [a0, a1] = [n.a, n.a + n.v * k];
      const d = `M${pt(a0, R + RING)}${arc(a0, a1, R + RING, 1)}L${pt(a1, R)}${arc(a0, a1, R, 0)}Z`;
      marks += el("path", {
        "data-maya": "mark",
        "data-key": key("n", n.lv, n.name),
        "data-c": c++,
        "data-s": n.s,
        "data-x": n.name,
        "data-series": title(n.lv ? P1 : P0),
        "data-y": n.v,
        "data-f": ctx.fmt(spec.y, n.v),
        "data-depth": n.lv,
        d,
      });
    }
    // ponytail: labels are clipped to 20 characters; ones that still collide are dropped by ctx.label.
    for (const n of nodes) {
      const m = n.a + (n.v * k) / 2;
      const [sn, cs] = [Math.sin(m), Math.cos(m)];
      const rad = R + RING + 4;
      const [lx, ly] = [cx + rad * sn, cy - rad * cs];
      const text = clip(n.name, maxCh);
      ctx.label(
        lx,
        ly,
        text,
        Math.abs(sn) < 0.25 ? (cs > 0 ? "above" : "below") : sn > 0 ? "start" : "end",
      );
    }
    return { marks, hits: "" };
  },
};
register("chord", chord);

export {};
