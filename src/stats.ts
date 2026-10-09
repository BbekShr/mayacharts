// mayacharts/stats: box plot and funnel. Imports only registry, svg, scale, ticks and types.
import { register } from "./core/registry.ts";
import { bandScale } from "./core/scale.ts";
import { el, esc, hit, key, memo, nameId, r, tw } from "./core/svg.ts";
import type { Axis, BandScale, LinearScale, Mark, ResolvedSpec, Shaped } from "./core/types.ts";

interface Box {
  ci: number;
  si: number;
  /** Row indices: a million rows must not become a million objects. */
  pts: number[];
  /** Their values, read in the row pass (a mapped Float64Array.from is slow at millions of rows). */
  vs: number[];
}

/** Raw rows by (category, series): the shaped cells are sums, a box plot needs the rows. */
function boxes(spec: ResolvedSpec, shaped: Shaped) {
  // Kept per data array: a re-render of the same rows (resize, hover, hide) skips the row pass and the sorts.
  const k = `box|${spec.x}|${spec.y}|${spec.series}|${shaped.visible}|${shaped.categories.join("\0")}`;
  return memo(spec.data, k, () => rowPass(spec, shaped));
}

function rowPass(spec: ResolvedSpec, shaped: Shaped) {
  const cats = new Map(shaped.categories.map((c, ci) => [c, ci]));
  const by: Box[] = []; // sparse, indexed by cell id: filter() walks it in order
  const sj = new Map(shaped.visible.map((j) => [shaped.series[j], j]));
  spec.data.forEach((row, i) => {
    const v = row[spec.y];
    if (typeof v !== "number" || !Number.isFinite(v)) return;
    const ci = cats.get(String(row[spec.x]));
    const si = sj.get(spec.series === null ? "" : String(row[spec.series]));
    if (ci === undefined || si === undefined) return;
    const id = ci * shaped.series.length + si;
    const b = (by[id] ??= { ci, si, pts: [], vs: [] });
    b.pts.push(i);
    b.vs.push(v);
  });
  const all = by.filter(Boolean);
  // Sorted once per box (typed sort is numeric, no comparator); the extent, label width and loop share it.
  const vals = all.map((b) => Float64Array.from(b.vs));
  return { all, vals, sorted: vals.map((v) => v.slice().sort()) };
}

/** Quantile of a sorted list by linear interpolation (R-7, Excel QUARTILE.INC). */
const q = (s: ArrayLike<number>, p: number) => {
  const h = (s.length - 1) * p;
  const k = Math.floor(h);
  return s[k]! + (h - k) * ((s[k + 1] ?? s[k]!) - s[k]!);
};

// Box and dot size, in px.
const MAX_BOX = 64;
const DOT = 2.25;
const OUT = 4;

export const boxplot: Mark = {
  noun: "Box plot",
  axes(spec, shaped) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const b of boxes(spec, shaped).sorted)
      ((lo = Math.min(lo, b[0]!)), (hi = Math.max(hi, b.at(-1)!)));
    if (lo > hi) lo = hi = 0;
    // One value (or all equal): keep zero in view so the box has a scale to sit on.
    if (lo === hi) [lo, hi] = [Math.min(0, lo), Math.max(0, hi)];
    return [
      { kind: "band", field: spec.x, domain: shaped.categories },
      { kind: "linear", field: spec.y, domain: spec.yDomain ?? [lo, hi] },
    ];
  },
  draw(ctx) {
    const { spec, shaped } = ctx;
    const cat = ctx.x as BandScale;
    const { of, range } = ctx.y as LinearScale;
    // A yDomain can exclude data: it sits on the plot edge.
    const py = (v: number) => Math.min(Math.max(of(v), Math.min(...range)), Math.max(...range));
    const inner = bandScale(
      shaped.visible.map((j) => shaped.series[j]!),
      [0, cat.bandwidth],
      0.1,
      0,
    );
    const f = (v: number) => ctx.fmt(spec.y, v);
    let marks = "";
    let top = "";
    let hits = "";
    const rows: string[][] = [];
    const { all, vals, sorted } = boxes(spec, shaped);
    let w = Math.min(inner.bandwidth * 0.7, MAX_BOX);
    // A lone series with labels: slim the boxes (to 24 px at least, else leave them) so the longest median label fits beside each,
    // the last one included.
    if (shaped.visible.length === 1 && spec.labels !== false) {
      const lab = Math.max(...sorted.map((s) => tw(f(q(s, 0.5)))));
      const fit = Math.min(
        cat.step - lab - 8,
        cat.step - 2 * (lab + 4 - (ctx.width - ctx.plot.x - ctx.plot.w)),
      );
      if (fit >= 24) w = Math.min(w, fit);
    }
    // Median labels, decided once per chart below: [box left, box right, median y, q3 y, text, box name].
    const meds: [number, number, number, number, string, string, number][] = [];
    all.forEach(({ ci, si, pts }, bi) => {
      const ser = shaped.series[si]!;
      const cname = shaped.categories[ci]!;
      const s = sorted[bi]!;
      const [q1, med, q3] = [q(s, 0.25), q(s, 0.5), q(s, 0.75)];
      const [fl, fh] = [q1 - 1.5 * (q3 - q1), q3 + 1.5 * (q3 - q1)];
      const inside = s.filter((v) => v >= fl && v <= fh); // the whiskers: nearest rows inside the fences
      const [wl, wh] = [inside[0]!, inside.at(-1)!];

      const cx = cat.at(ci) + inner.at(shaped.visible.indexOf(si)) + inner.bandwidth / 2;
      const [x0, x1, cp] = [cx - w / 2, cx + w / 2, w / 4];
      const [yh, y3, ym, y1, yl] = [wh, q3, med, q1, wl].map(py) as [
        number,
        number,
        number,
        number,
        number,
      ];
      const bh = Math.max(Math.abs(y1 - y3), 2);
      const by = Math.min(y1, y3) - (bh - Math.abs(y1 - y3)) / 2;
      const base = { "data-c": ci, "data-s": si % 8 };
      const ln = (k: string, a: number, b: number, c: number, e: number, more = {}) =>
        el("line", {
          "data-maya": "line",
          "data-key": key(k, ser, cname),
          ...base,
          ...more,
          x1: r(a),
          y1: r(b),
          x2: r(c),
          y2: r(e),
        });
      const lines: [string, number | string][] = [
        [ctx.t("max"), f(s.at(-1)!)],
        [ctx.t("q3"), f(q3)],
        [ctx.t("median"), f(med)],
        [ctx.t("q1"), f(q1)],
        [ctx.t("min"), f(s[0]!)],
        [ctx.t("rows"), ctx.fmt("", s.length)],
      ];
      const d = {
        "data-key": key("b", ser, cname),
        ...base,
        "data-x": ctx.fmt(spec.x, cname),
        "data-series": ser,
        "data-f": lines.map((l) => l.join("\t")).join("\n"),
        "data-y": med,
        "data-neg": med < 0,
      };
      // Whisker (stem and caps) and median are keyed line paths with fixed commands, so they morph and
      // dim with their box. The median takes the kpi target stroke (ink); dots go under it.
      marks +=
        el("rect", {
          "data-maya": "mark",
          ...d,
          "data-bx": true,
          x: r(x0),
          y: r(by),
          width: r(w),
          height: r(bh),
        }) +
        // Stems and caps are <line>s, each with its own stable key: the element glides lines by
        // transform, so they travel with the box in every browser (a path would crossfade).
        ln("ws", cx, yh, cx, y3) +
        ln("wt", cx, yl, cx, y1) +
        ln("wh", cx - cp, yh, cx + cp, yh) +
        ln("wl", cx - cp, yl, cx + cp, yl);
      // Always drawn (hit() skips a big target): the whole whisker span is the box, over its dots and lines.
      hits += el("rect", {
        ...d,
        "data-maya": "hit",
        x: r(x0),
        y: r(yh),
        width: r(w),
        height: r(yl - yh),
        fill: "transparent",
      });
      meds.push([x0, x1, ym, y3, f(med), ser ? `${cname} (${ser})` : cname, y1]);

      // Every row is a faint dot when the box holds few rows; outliers are always marks. One key
      // prefix for both, so a row crossing the fence moves instead of re-entering.
      // ponytail: dots only at 30 rows or fewer; a denser box would be a smear (use beeswarm).
      const seen = new Map<string, number>();
      for (let k = 0; k < pts.length; k++) {
        const i = pts[k]!;
        const pv = vals[bi]![k]!; // contiguous: a million rows scan in a few ms
        const out = pv < fl || pv > fh;
        // Unnamed rows of a big box are only drawn when they are outliers: skip the rest cheaply.
        if (!out && pts.length > 30 && spec.name === null) continue;
        const nv = spec.name === null ? null : spec.data[i]![spec.name];
        const pn = nv == null ? null : String(nv);
        const id = nameId(seen, pn, i);
        const dx = cx + (((k * 0.618) % 1) - 0.5) * w * 0.6;
        if (!out) {
          if (pts.length <= 30)
            marks += el("circle", {
              "data-key": key("d", ser, cname, id),
              ...base,
              "data-bx": true,
              "data-total": true, // neutral ink (--c muted), no series colour
              cx: r(dx),
              cy: r(py(pv)),
              r: DOT,
            });
          continue;
        }
        const who = ctx.fmt(spec.x, cname);
        const od = {
          "data-key": key("d", ser, cname, id),
          // no data-c: the tooltip rows are this row's alone (a category group would list the box too)
          "data-last": true, // keeps the circle visible under svg[data-pt] (the whisker is a line path)
          "data-s": si % 8,
          "data-x": who,
          "data-series": ser,
          "data-f": `${pn ?? spec.titles.get(spec.y) ?? spec.y}\t${f(pv)}`,
          "data-y": pv,
          "data-neg": pv < 0,
        };
        top += el("circle", {
          "data-maya": "mark",
          ...od,
          cx: r(cx),
          cy: r(py(pv)),
          r: OUT,
        });
        hits += hit(od, cx - OUT, py(pv) - OUT, OUT * 2, OUT * 2);
      }
      marks += ln("m", x0, ym, x1, ym, { "data-kpi": "target" });
      rows.push([
        ctx.fmt(spec.x, cname),
        ...(spec.series === null ? [] : [ser]),
        ...[s.at(-1)!, q3, med, q1, s[0]!].map(f),
        ctx.fmt("", s.length),
      ]);
    });
    // One placement for every box, never mixed and never above the cap (that reads as the max), always
    // on the box's own median line: right of the box when every label fits before the next box (the
    // last one may use the svg's right margin), else on the box above the median, else below it, when
    // every box is tall enough; else no labels (the tooltip and table carry them).
    // ponytail: three placements, all or nothing.
    const order = [...meds].sort((a, b) => a[0] - b[0]);
    const step = Math.min(...order.map((o, i) => (order[i + 1]?.[0] ?? Infinity) - o[0])) - 4;
    const side = order.every((m, i) => tw(m[4]) <= (order[i + 1]?.[0] ?? ctx.width + 2) - m[1] - 6);
    const fits = meds.every((m) => tw(m[4]) <= step);
    const up = fits && meds.every((m) => m[2] - m[3] >= 18);
    const down = fits && meds.every((m) => m[6] - m[2] >= 18);
    if (spec.labels !== false && (side || up || down))
      for (const [x0, x1, ym, , t] of meds)
        side
          ? ctx.label(x1 + 4, ym, t, "start")
          : ctx.label((x0 + x1) / 2, ym, t, up ? "above" : "below");
    const ti = (x: string) => spec.titles.get(x) ?? x;
    return {
      marks: marks + top,
      hits,
      note: !meds.length
        ? ""
        : ((lo, hi) =>
            lo[4] === hi[4]
              ? `${ctx.t("median")} ${lo[4]}.`
              : `${ctx.t("median")}: ${lo[5]} ${lo[4]} to ${hi[5]} ${hi[4]}.`)(
            meds.reduce((a, b) => (b[2] > a[2] ? b : a)),
            meds.reduce((a, b) => (b[2] < a[2] ? b : a)),
          ),
      table: {
        head: [
          ti(spec.x),
          ...(spec.series === null ? [] : [ti(spec.series)]),
          ...(["max", "q3", "median", "q1", "min", "rows"] as const).map((k) => ctx.t(k)),
        ],
        rows,
      },
    };
  },
};

const MAX_BAND = 64;
const MIN_W = 4;

export const funnel: Mark = {
  noun: "Funnel",
  // Wide form: categories are field names, so the axis shows their titles.
  axes: (spec, shaped): [Axis, Axis] => [
    null,
    {
      kind: "band",
      field: spec.x,
      domain: spec.x ? shaped.categories : shaped.categories.map((c) => spec.titles.get(c) ?? c),
    },
  ],
  draw(ctx) {
    const { spec, shaped, plot } = ctx;
    const cat = ctx.y as BandScale;
    const vals: (number | null)[] = shaped.categories.map(() => null);
    for (const c of shaped.cells) vals[c.ci] = c.value;
    const nums = vals.filter((v): v is number => v !== null);
    const max = Math.max(0, ...nums);
    const first = vals[0] ?? 0;
    const nf = (p: number) =>
      new Intl.NumberFormat(spec.locale, {
        style: "percent",
        maximumFractionDigits: p < 0.1 ? 1 : 0,
      }).format(p);
    const share = (v: number | null | undefined, of: number | null | undefined) =>
      v == null || !of ? null : v / of;
    const text = (p: number | null) => (p === null ? "" : nf(p));
    const steps = vals.map((v, i) => (i ? share(v, vals[i - 1]) : null));
    const low = steps.filter((p): p is number => p !== null);
    const worst = low.length > 1 ? Math.min(...low) : -1;

    const gap = Math.min(22, cat.step * 0.4);
    const th = Math.min(cat.step - gap, MAX_BAND);
    const cx = plot.x + plot.w / 2;
    const geo = vals.map((v, ci) => {
      if (v === null) return null;
      // A zero stage draws no bar (a zero-width path stays hoverable and keeps its label).
      const w = v === 0 ? 0 : max ? Math.max(MIN_W, (v / max) * plot.w) : MIN_W;
      return { w, y: cat.at(ci) + cat.bandwidth / 2 - th / 2 };
    });
    let conns = "";
    let bars = "";
    let hits = "";
    let labels = "";
    const rows: string[][] = [];
    const ti = (x: string) => spec.titles.get(x) ?? x;
    geo.forEach((g, ci) => {
      const v = vals[ci];
      if (!g || v == null) return;
      const name = shaped.categories[ci]!;
      const shown = spec.x === "" ? (spec.titles.get(name) ?? name) : ctx.fmt(spec.x, name);
      const sp = text(steps[ci]!);
      const sf = text(share(v, first));
      const val = ctx.fmt(spec.y, v);
      const d = {
        "data-key": key("f", name),
        "data-c": ci,
        "data-s": 0,
        "data-x": shown,
        "data-series": "",
        "data-f": [
          `${spec.x ? ti(spec.y) : ctx.t("total")}\t${val}`,
          sp && `${ctx.t("ofPrevious")}\t${sp}`,
          sf && `${ctx.t("ofFirst")}\t${sf}`,
        ]
          .filter(Boolean)
          .join("\n"),
        "data-y": v,
        "data-neg": false,
      };
      const [x, y, rr] = [cx - g.w / 2, g.y, Math.min(4, g.w / 2, th / 2)];
      // Rounded rectangle, fixed commands, centred on cx so the entrance pop grows it from the middle.
      const e = [x + g.w, y + th].map(r);
      const [l, t, a, b] = [x, y, x + rr, y + rr].map(r);
      const [rx, bb, ri, bi] = [x + g.w - rr, y + th - rr, e[0]!, e[1]!];
      bars += el("path", {
        "data-maya": "mark",
        ...d,
        d: `M${a} ${t}H${r(rx)}Q${ri} ${t} ${ri} ${b}V${r(bb)}Q${ri} ${bi} ${r(rx)} ${bi}H${a}Q${l} ${bi} ${l} ${r(bb)}V${b}Q${l} ${t} ${a} ${t}Z`,
      });
      hits += hit(d, x, y, g.w, th);
      const cy = y + th / 2;
      if (spec.labels !== false) {
        // The last stage also states the overall conversion: "2.5K · 4.3%".
        const txt = ci === vals.length - 1 && ci && sf ? `${val} \u00b7 ${sf}` : val;
        const est = txt.length * 7.2 + 8;
        const out = cx + g.w / 2 + 6 + est <= ctx.width;
        // Inside when it fits (ink on the fill); a short band still holds it if outside would leave the svg.
        if (est <= g.w && (th >= 16 || !out))
          labels += el(
            "text",
            {
              x: r(cx),
              y: r(cy),
              "text-anchor": "middle",
              "dominant-baseline": "middle",
              "data-in": true,
              "data-ink": "n",
            },
            esc(txt),
          );
        else ctx.label(cx + g.w / 2 + 6, cy, txt, "start");
        // Step share centred in the gap above this stage; the lowest one reads without hovering.
        // ponytail: dropped when the gap between bands is under 12 px; the tooltip still carries it.
        if (ci && steps[ci] != null && cat.step - th >= 12)
          labels += el(
            "text",
            {
              x: r(cx),
              y: r(y - (cat.step - th) / 2),
              "text-anchor": "middle",
              "dominant-baseline": "middle",
              "data-ring": steps[ci] === worst ? null : true,
              "data-tone": steps[ci] === worst ? "bad" : null,
            },
            esc(sp),
          );
      }
      const up = ci ? geo[ci - 1] : null;
      if (up)
        conns += el("path", {
          "data-maya": "area",
          "data-key": key("k", name),
          "data-c": ci,
          "data-total": true,
          d: `M${r(cx - up.w / 2)} ${r(up.y + th)}H${r(cx + up.w / 2)}L${r(cx + g.w / 2)} ${r(y)}H${r(cx - g.w / 2)}Z`,
        });
      rows.push([shown, val, sp, sf]);
    });
    const end = share(vals.at(-1), first);
    return {
      marks: conns + bars,
      hits,
      labels,
      note:
        end === null || vals.length < 2
          ? ""
          : `${spec.x ? shaped.categories.at(-1) : ti(shaped.categories.at(-1)!)}, ${ctx.t("ofFirst")}: ${nf(end)}.`,
      table: {
        head: [
          spec.x ? ti(spec.x) : "",
          spec.x ? ti(spec.y) : ctx.t("total"),
          ctx.t("ofPrevious"),
          ctx.t("ofFirst"),
        ],
        rows,
      },
    };
  },
};

register("boxplot", boxplot);
register("funnel", funnel);
