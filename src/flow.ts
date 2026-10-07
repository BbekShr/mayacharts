// mayacharts/flow: sankey and chord. Imports only registry, svg and types (never validate/render/shape).
import { register } from "./core/registry.ts";
import { TAU } from "./core/scale.ts";
import { clip, el, esc, key, memo, r } from "./core/svg.ts";
import type { Mark, MarkCtx } from "./core/types.ts";

const W = 14;
const PAD = 10;
const CH = 7.2; // label width per character, the same estimate the core uses

// Colour rule shared by both charts: the outer column is one neutral (`data-neu`, the muted
// foreground), the next column takes palette slots, and a link takes its level-1 node's colour.
interface C {
  s: number; // palette slot, -1 for neutral
}
const paint = (n: C) => (n.s < 0 ? { "data-neu": true } : { "data-s": n.s });
const neutral = (col: C[]) => col.forEach((n) => (n.s = -1));
// Every node index upstream or downstream of a node along any path; hovering lights them.
const reach = (ls: L[]) => {
  // Neighbours per node and direction, so a walk reads its own links, not every link per step.
  const nb = new Map<number, number[]>();
  for (const l of ls)
    for (const [k, b] of [
      [l.s.i * 2, l.t.i],
      [l.t.i * 2 + 1, l.s.i],
    ] as const)
      (nb.get(k) ?? nb.set(k, []).get(k)!).push(b);
  const walk = (i: number, up: boolean, seen = new Set<number>()) => {
    for (const b of nb.get(i * 2 + +up) ?? []) if (!seen.has(b)) (seen.add(b), walk(b, up, seen));
    return seen;
  };
  const ids = (n: N, up: boolean) => [n.i, ...walk(n.i, up)];
  const join = (a: number[]) => [...new Set(a)].join(" ");
  return {
    node: (n: N) => join([...ids(n, true), ...ids(n, false)]),
    link: (l: L) => join([...ids(l.s, true), ...ids(l.t, false)]),
  };
};
type Reach = ReturnType<typeof reach>;
/** A vertical-room check for labels: accepts (and books) a span inside lo..hi that is still free. */
const slots = (lo: number, hi: number) => {
  const t: number[][] = [];
  return (a: number, b: number) =>
    a >= lo && b <= hi && !t.some(([u, d]) => a < d! && b > u!) && (t.push([a, b]), true);
};
/** Name over a muted value (two lines), else "name value" on one; "" when neither fits. */
const lines = (
  x: number,
  cy: number,
  anchor: string,
  name: string,
  val: string,
  cap: number,
  room: (top: number, bottom: number) => boolean,
) => {
  const at = { x: r(x), "text-anchor": anchor, "dominant-baseline": "middle" };
  if (room(cy - 16, cy + 16))
    return (
      el("text", { ...at, y: r(cy - 7), "data-nm": true }, esc(clip(name, cap))) +
      el("text", { ...at, y: r(cy + 8), "data-v": true }, esc(val))
    );
  if (!room(cy - 8, cy + 8)) return "";
  const both = cap - val.length - 1 >= [...name].length; // name and value must both fit
  return el(
    "text",
    { ...at, y: r(cy), "data-nm": true },
    esc(clip(name, cap)) + (both ? el("tspan", { "data-v": true, dx: 6 }, esc(val)) : ""),
  );
};

interface N {
  lv: number;
  name: string;
  i: number;
  in: number;
  out: number;
  v: number;
  y: number;
  s: number;
  a: number;
}
interface L {
  s: N;
  t: N;
  vals: number[];
  v: number;
  sy: number;
  ty: number;
}

// Hydration attributes common to both charts; `off` is the number of drilled levels.
const linkAttrs = (ctx: MarkCtx, h: Reach, l: L, c: number, off: number, tint: N) => ({
  "data-maya": "link",
  "data-key": key("k", l.s.lv + off, l.s.name, l.t.name), // level in the whole path
  "data-c": c,
  ...paint(tint),
  "data-a": h.link(l),
  "data-x": `${l.s.name} → ${l.t.name}`,
  "data-series": "",
  "data-y": l.v,
  "data-f": ctx.fmt(ctx.spec.y, l.v),
});
const nodeAttrs = (ctx: MarkCtx, h: Reach, n: N, c: number, off: number, series = "") => ({
  "data-maya": "mark",
  "data-key": key("n", n.lv + off, n.name),
  "data-c": c,
  ...paint(n),
  "data-n": n.i,
  "data-a": h.node(n),
  "data-x": n.name,
  "data-series": series,
  "data-y": n.v,
  "data-f": ctx.fmt(ctx.spec.y, n.v),
  "data-depth": n.lv,
});

/** Rows to nodes (one per name per level) and links (one per adjacent pair, aggregated). */
const graph = (ctx: MarkCtx, what: string) => {
  const { spec } = ctx;
  const P = spec.path;
  const cols = P.length;
  // The row pass (nodes and each link's values) is kept per data array; layout mutates nodes and
  // links, so every render works on copies of it.
  const raw = memo(spec.data, `graph|${P}|${spec.y}`, () => {
    // Maps, not objects: node names such as "__proto__" are plain data.
    const nodes: N[] = [];
    const byLv: Map<string, N>[] = P.map(() => new Map());
    const links = new Map<number, L>();
    const node = (lv: number, name: string): N => {
      let n = byLv[lv]!.get(name);
      if (!n) {
        n = { lv, name, i: nodes.length, in: 0, out: 0, v: 0, y: 0, s: 0, a: 0 };
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
          `spec.${spec.y} is ${v}, but ${what} sizes must be positive.`,
        );
      let prev = node(0, String(row[P[0]!]));
      for (let lv = 1; lv < cols; lv++) {
        const next = node(lv, String(row[P[lv]!]));
        const k = prev.i * 2 ** 26 + next.i; // ponytail: numeric key, ceiling 67M nodes
        let l = links.get(k);
        if (!l) links.set(k, (l = { s: prev, t: next, vals: [], v: 0, sy: 0, ty: 0 }));
        l.vals.push(v);
        prev = next;
      }
    }
    return { nodes, links: [...links.values()] };
  });
  const nodes = raw.nodes.map((n) => ({ ...n }));
  const ls = raw.links.map((l) => ({ ...l, s: nodes[l.s.i]!, t: nodes[l.t.i]! }));
  const red = ctx.agg(spec.aggregate);
  for (const l of ls) {
    l.v = red(l.vals) ?? 0;
    if (!(l.v > 0))
      ctx.fail(
        "non-positive-value",
        spec.y,
        `link ${l.s.name} to ${l.t.name} is ${l.v}, but ${what} sizes must be positive.`,
      );
    l.s.out += l.v;
    l.t.in += l.v;
  }
  for (const n of nodes) n.v = Math.max(n.in, n.out);
  return { nodes, ls };
};

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
    const { nodes, ls } = graph(ctx, "sankey");

    // Colour: column 0 neutral, column 1 palette slots in first-seen order, deeper nodes the slot
    // of their single level-1 ancestor (several different ones: neutral). A branching tree (several
    // roots, every column-1 node with one parent) colours by root instead: colour follows the branch.
    const roots = nodes.filter((n) => n.lv === 0);
    const tree =
      roots.length > 1 &&
      nodes.every((n) => n.lv !== 1 || ls.filter((l) => l.t === n).length === 1);
    tree ? roots.forEach((n, j) => (n.s = j % 8)) : neutral(roots);
    let slot = 0;
    for (let lv = 1; lv < cols; lv++)
      for (const n of nodes.filter((n) => n.lv === lv)) {
        const from = new Set(ls.filter((l) => l.t === n).map((l) => l.s.s));
        const [one] = from;
        if (lv === 1) n.s = tree ? one! : slot++ % 8;
        else n.s = from.size === 1 ? one! : -1;
      }
    // A link takes its target's colour out of column 0, else its source's.
    const tint = (l: L) => (l.s.lv === 0 ? l.t : l.s);
    const hov = reach(ls);

    // Order: columns start sorted by value, then barycentre sweeps pull each node towards the
    // weighted middle of its neighbours (fewer crossings). Keys never depend on the order.
    const order = Array.from({ length: cols }, (_, lv) =>
      nodes.filter((n) => n.lv === lv).sort((a, b) => b.v - a.v || a.i - b.i),
    );
    const sweep = (lv: number, from: number) => {
      for (const n of order[lv]!) {
        let [sum, w] = [0, 0];
        for (const l of ls) {
          const o = from < lv ? (l.t === n ? l.s : null) : l.s === n ? l.t : null;
          if (o) ((sum += l.v * order[from]!.indexOf(o)), (w += l.v));
        }
        n.a = w ? sum / w : 0; // the barycentre (chord uses `a` for an angle)
      }
      order[lv]!.sort((a, b) => a.a - b.a || b.v - a.v || a.i - b.i);
    };
    for (let lv = 1; lv < cols; lv++) sweep(lv, lv - 1);
    for (let lv = cols - 2; lv > 0; lv--) sweep(lv, lv + 1);

    // Label room: the last column always keeps its labels beside it, clear of the flows; the first
    // does too on a wide tile, else its labels ride in the gap, over the flows, behind a halo.
    const val = (n: N) => ctx.fmt(spec.y, n.v);
    const wide = plot.w >= 420;
    const room = (lv: number) =>
      Math.min(
        plot.w * (wide ? 0.22 : 0.28),
        Math.max(0, ...order[lv]!.map((n) => Math.min(20, [...n.name].length) * CH)) + 16, // 4 px over the cap's 12: no float round-down
      );
    const [padL, padR] = [wide ? room(0) : 0, room(cols - 1)];
    const gap = (plot.w - padL - padR - W) / (cols - 1);
    const x = (n: N) => plot.x + padL + n.lv * gap;

    // Inset 8 px (half a label) so edge nodes keep their labels; padding shrinks so it never
    // takes more than a quarter of the height, then the scale is what is left over.
    const [top, avail] = [plot.y + 8, Math.max(0, plot.h - 16)];
    const most = Math.max(...order.map((c) => c.length));
    const pad = most > 1 ? Math.min(PAD, avail / 4 / (most - 1)) : 0;
    let k = Infinity;
    for (const c of order) {
      const sum = c.reduce((a, n) => a + n.v, 0);
      if (sum > 0) k = Math.min(k, (avail - pad * (c.length - 1)) / sum);
    }
    if (!(k > 0 && k < Infinity)) k = 0;
    for (const c of order) {
      let y = top;
      for (const n of c) ((n.y = y), (y += n.v * k + pad));
    }
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
      marks += el("path", { ...linkAttrs(ctx, hov, l, c++, spec.drilled.length, tint(l)), d });
    }
    for (const n of nodes) {
      marks += el("rect", {
        ...nodeAttrs(ctx, hov, n, c++, spec.drilled.length),
        x: r(x(n)),
        y: r(n.y),
        width: W,
        height: r(n.v * k),
      });
    }

    // Labels, biggest node first so a crowded column keeps the important ones.
    // ponytail: a label that collides with a bigger one is dropped (the tooltip still names it).
    const taken = order.map(() => slots(plot.y, plot.y + plot.h));
    const lab: string[] = []; // by node index
    for (const n of [...nodes].sort((a, b) => b.v - a.v || a.i - b.i)) {
      const [first, last] = [n.lv === 0, n.lv === cols - 1];
      const left = wide && first;
      const w = left ? padL : last ? padR : gap;
      const cap = Math.max(3, Math.floor((w - (left || last ? 12 : W + 14)) / CH));
      const cy = n.y + (n.v * k) / 2;
      const slack = Math.max(0, (n.v * k) / 2 - 16); // a tall node slides its label up or down to find room
      for (const d of [0, -1, 1])
        if (
          (lab[n.i] = lines(
            left ? x(n) - 6 : x(n) + W + 6,
            cy + d * slack,
            left ? "end" : "start",
            n.name,
            val(n),
            cap,
            // A sliver of a node gets one line (a second would crowd its neighbours out).
            n.v * k < 12 ? (a, b) => b - a < 20 && taken[n.lv]!(a, b) : taken[n.lv]!,
          ))
        )
          break;
    }
    return { marks, hits: "", labels: lab.join("") };
  },
};

register("sankey", sankey);

const RING = 14;

/** Chord diagram: from-nodes on the left half, to-nodes on the right, ribbons between them. */
export const chord: Mark = {
  noun: "Chord",
  draw(ctx) {
    const { spec, plot } = ctx;
    const [P0, P1] = spec.path as [string, string];
    const { nodes, ls } = graph(ctx, "chord");
    // From-nodes neutral, to-nodes palette slots in first-seen order; ribbons take the to-node's colour.
    neutral(nodes.filter((n) => n.lv === 0));
    nodes.filter((n) => n.lv === 1).forEach((n, j) => (n.s = j % 8));
    const hov = reach(ls);
    const total = ls.reduce((a, l) => a + l.v, 0);
    if (!(total > 0)) return { marks: "", hits: "" };

    // Angles run clockwise from 12 o'clock. To-nodes fill the right half top to bottom (largest on
    // top), from-nodes the left half bottom to top (largest on top). Each side holds `total`.
    const SIDE = 0.14;
    const GAP = 0.04;
    const sides = [0, 1].map((lv) => nodes.filter((n) => n.lv === lv));
    const k = Math.min(...sides.map((c) => (Math.PI - SIDE - GAP * (c.length - 1)) / total));
    for (const lv of [0, 1]) {
      const c = sides[lv]!.sort((a, b) => (lv ? b.v - a.v : a.v - b.v) || a.i - b.i);
      let a = lv ? SIDE / 2 : Math.PI + SIDE / 2;
      for (const n of c) ((n.a = a), (a += n.v * k + GAP));
    }
    // Label room per side from the longest label (at most 20 characters, at most 36% of the
    // width), so the ring grows to what is left; the pair is then centred as a whole.
    const maxCh = Math.min(20, Math.floor((plot.w * 0.36 - 4) / CH));
    const val = (n: N) => ctx.fmt(spec.y, n.v);
    const lw = [0, 1].map(
      (lv) =>
        Math.max(
          0,
          ...sides[lv]!.map((n) => Math.max([...clip(n.name, maxCh)].length, val(n).length)),
        ) *
          CH +
        4,
    ) as [number, number];
    const gutter = RING + 6;
    const R = Math.max(
      12,
      Math.min(plot.h / 2 - RING - 40, (plot.w - lw[0] - lw[1] - 2 * gutter - 4) / 2),
    );
    const spare = plot.w - lw[0] - lw[1] - 2 * (R + gutter);
    const cx = plot.x + spare / 2 + lw[0] + R + gutter;
    const cy = plot.y + plot.h / 2;
    const pt = (a: number, rad: number) =>
      `${r(cx + rad * Math.sin(a))} ${r(cy - rad * Math.cos(a))}`;
    const arc = (a0: number, a1: number, rad: number, sweep: 0 | 1) =>
      `A${r(rad)} ${r(rad)} 0 0 ${sweep} ${pt(sweep ? a1 : a0, rad)}`;
    // An edge from angle u to v bows towards the centre by how far apart they are: opposite ends
    // pass near it, neighbours (across the gap at 12 and 6 o'clock) run straight along the rim, so
    // no notch is cut into the ribbon.
    const edge = (u: number, v: number) => {
      const delta = ((v - u + 3 * Math.PI) % TAU) - Math.PI;
      const far = Math.abs(delta) / Math.PI;
      const near = 1 - far;
      const q = R * (1 - 0.9 * far * far * (3 - 2 * far)); // smoothstep: 1 R when close, .1 R opposite
      // Neighbours lean the controls along the rim (a third of the way), so the edge follows the arc.
      const f = (near * near * delta) / 3;
      return `C${pt(u + f, q)} ${pt(v - f, q)} ${pt(v, R)}`;
    };

    // Ribbon slots: each node hands them out clockwise, ordered to avoid crossings.
    for (const n of nodes) {
      let a = n.a;
      for (const l of ls
        .filter((l) => (n.lv ? l.t : l.s) === n)
        .sort((x, y) => (n.lv ? y.s.a - x.s.a : y.t.a - x.t.a))) {
        n.lv ? (l.ty = a) : (l.sy = a); // here sy and ty are angles
        a += l.v * k;
      }
    }
    let c = 0;
    let marks = "";
    for (const l of ls) {
      const [sa, ta] = [l.sy, l.ty];
      const [sb, tb] = [sa + l.v * k, ta + l.v * k];
      const d = `M${pt(sa, R)}${arc(sa, sb, R, 1)}${edge(sb, ta)}${arc(ta, tb, R, 1)}${edge(tb, sa)}Z`;
      marks += el("path", { ...linkAttrs(ctx, hov, l, c++, 0, l.t), d });
    }
    // The group arc is a 10 px band inset 2 px; CSS strokes it 4 px with round joins in its own
    // colour, which rounds the ends and lands the band at R + 4 .. R + RING (clear of the ribbons).
    for (const n of nodes) {
      const ia = Math.min(2 / R, (n.v * k) / 4);
      const [a0, a1, r0, r1] = [n.a + ia, n.a + n.v * k - ia, R + 6, R + RING - 2];
      const d = `M${pt(a0, r1)}${arc(a0, a1, r1, 1)}L${pt(a1, r0)}${arc(a0, a1, r0, 0)}Z`;
      marks += el("path", {
        ...nodeAttrs(ctx, hov, n, c++, 0, spec.titles.get(n.lv ? P1 : P0) ?? (n.lv ? P1 : P0)),
        "data-arc": true,
        d,
      });
    }
    // ponytail: labels are clipped to 20 characters; one that would overlap its neighbour on the
    // same side is dropped, after trying it on one line.
    const room = [0, 1].map(() => slots(plot.y, plot.y + plot.h));
    let labels = "";
    for (const n of [...nodes].sort((a, b) => b.v - a.v)) {
      const m = n.a + (n.v * k) / 2;
      const [sn, cs] = [Math.sin(m), Math.cos(m)];
      const rad = R + RING + 6;
      const [lx, ly] = [cx + rad * sn, cy - rad * cs];
      const pole = Math.abs(sn) < 0.25;
      // Top and bottom labels grow away from the ring; side labels centre on the arc.
      const cyy = pole ? ly + (cs > 0 ? -14 : 14) : ly;
      const anchor = pole ? "middle" : sn > 0 ? "start" : "end";
      labels += lines(lx, cyy, anchor, n.name, val(n), maxCh, room[sn > 0 ? 1 : 0]!);
    }
    return { marks, hits: "", labels };
  },
};
register("chord", chord);

export {};
