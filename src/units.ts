/*
 * mayacharts/units: one dot per row that flies between forms. Imports only registry, svg,
 * scale, ticks and types.
 *
 * Spec: x = group, y = value (the swarm form's axis), name = row identity (the key), optional
 * colorBy. resolve() makes x the series (without colorBy), so the legend toggles groups,
 * view.hidden hides them and colors map by group. spec.forms
 * (default waffle, bars, swarm) lists the forms; view.form picks one (ResolvedSpec.form,
 * clamped). Core draws the form control. Every dot is `<circle data-maya="mark">` keyed
 * `u~NAME` (the row index without a name), identical in every form, so a form change is an
 * ordinary keyed update: the translate FLIP in animate.ts flies the dots with no new animation
 * code. One radius for all forms (the largest that fits both grid forms), so a dot is the same
 * size wherever it lands.
 *   - waffle: a square-ish grid filled column by column in group order.
 *   - bars: one column of stacked dots per group, its name and count underneath.
 *   - swarm: dots along the y axis (the only form with axes), dodged like beeswarm.
 */
import { register } from "./core/registry.ts";
import { cbField, el, esc, key, nameId, r } from "./core/svg.ts";
import type { LinearScale, Mark, ResolvedSpec, Shaped } from "./core/types.ts";

const MAX = 1500;
const TOP = 22; // caption row
const BASE = 30; // bars: group name and count under the columns

interface Dot {
  i: number;
  k: string;
  ci: number;
  g: string;
  si: number;
  v: number;
  name: string | null;
  row: Record<string, unknown>;
}

/**
 * One dot per row with a numeric y and a visible series, in data order. Groups are numbered in
 * first-appearance order over all rows, the order of shaped.series when x is the series.
 */
function dots(spec: ResolvedSpec, shaped: Shaped): Dot[] {
  const cats = new Map<string, number>();
  const seen = new Map<string, number>();
  const out: Dot[] = [];
  spec.data.forEach((row, i) => {
    const v = row[spec.y];
    const g = String(row[spec.x]);
    const ci = cats.get(g) ?? cats.set(g, cats.size).size - 1;
    if (typeof v !== "number" || !Number.isFinite(v)) return;
    const nv = spec.name === null ? null : row[spec.name];
    const name = nv == null ? null : String(nv);
    const k = key("u", nameId(seen, name, i)); // before the visibility test: hiding never renames
    const si = shaped.series.indexOf(spec.series === null ? "" : String(row[spec.series]));
    if (shaped.visible.includes(si)) out.push({ i, k, ci, g, si, v, name, row });
  });
  return out;
}

/** Dodge along x: each dot takes the smallest |offset| that clears the placed ones within a diameter. */
function dodge(xs: number[], d: number): number[] {
  const order = xs.map((_, i) => i).sort((a, b) => xs[a]! - xs[b]! || a - b);
  const out: number[] = xs.map(() => 0);
  const placed: number[] = [];
  let from = 0;
  for (const i of order) {
    while (from < placed.length && xs[i]! - xs[placed[from]!]! >= d) from++;
    // ponytail: only the 50 most recent neighbours are checked, so a heavy tie can overlap.
    const near = placed.slice(Math.max(from, placed.length - 50));
    const cand = [0];
    for (const j of near) {
      const h = Math.sqrt(Math.max(0, d * d - (xs[i]! - xs[j]!) ** 2));
      cand.push(out[j]! + h, out[j]! - h);
    }
    cand.sort((a, b) => Math.abs(a) - Math.abs(b) || b - a);
    const ok = (o: number) =>
      near.every((j) => (xs[i]! - xs[j]!) ** 2 + (o - out[j]!) ** 2 >= d * d - 1e-6);
    out[i] = cand.find(ok) ?? 0;
    placed.push(i);
  }
  return out;
}

/** Largest pitch p with `rows(k)` rows of k dots fitting a w x h box, over k = 1..n; the first (tallest) wins ties. */
function best(n: number, w: number, h: number) {
  let out = { p: 0, k: 1 };
  for (let k = 1; k <= Math.max(1, n); k++) {
    const p = Math.min(w / k, h / Math.ceil(n / k));
    if (p > out.p + 1e-9) out = { p, k };
  }
  return out;
}

export const units: Mark = {
  noun: "Unit",
  axes(spec, shaped) {
    if (spec.forms[spec.form] !== "swarm") return [null, null];
    let lo = Infinity;
    let hi = -Infinity;
    for (const d of dots(spec, shaped)) ((lo = Math.min(lo, d.v)), (hi = Math.max(hi, d.v)));
    if (lo > hi) lo = hi = 0;
    return [{ kind: "linear", field: spec.y, domain: spec.yDomain ?? [lo, hi] }, null];
  },
  check(spec, fail) {
    // ponytail: 1500 dots at most, the number the form flight can animate; bin or limit the rows past it.
    if (spec.data.length > MAX)
      fail(
        "too-many-marks",
        "data",
        `${spec.data.length} rows exceed the limit of ${MAX} dots for units.`,
        "A dot per row must fly between forms: aggregate the rows first, or use beeswarm or scatter.",
      );
  },
  draw(ctx) {
    const { spec, shaped, plot } = ctx;
    const form = spec.forms[spec.form] ?? "waffle";
    const ti = (f: string) => spec.titles.get(f) ?? f;
    const pts = dots(spec, shaped);
    const n = pts.length;
    // Group order for the grids; the stable sort keeps data order inside a group.
    const sorted = pts
      .map((d, i) => [d, i] as const)
      .sort((a, b) => a[0].ci - b[0].ci || a[1] - b[1]);
    const rank = new Map(sorted.map(([d], j) => [d, j]));
    const cnt = new Map<number, number>();
    for (const d of pts) cnt.set(d.ci, (cnt.get(d.ci) ?? 0) + 1);
    const cols = [...cnt.keys()].sort((a, b) => a - b);
    const [ax, ay, aw] = [plot.x, plot.y + TOP, plot.w];
    const ah = plot.h - TOP;

    // One pitch for every form, so one dot size.
    const sw = aw / Math.max(1, cols.length);
    const bw = sw * 0.8;
    const most = Math.max(0, ...cnt.values());
    const wf = best(n, aw, ah);
    const wr = Math.max(1, Math.ceil(n / wf.k)); // waffle rows
    const wp = wf.p || 1;
    const bb = best(most, bw, ah - BASE);
    const pitch = Math.max(1, Math.min(wp, bb.p || wp));
    let rad = Math.max(1.5, Math.min(8, pitch * 0.42));

    const cx: number[] = [];
    const cy: number[] = [];
    let labels = "";
    const cap = el(
      "text",
      { x: r(ax), y: r(plot.y + 12), "data-ax": true },
      esc(`${ctx.t("perDot", ti(spec.name ?? spec.x))} · ${ctx.t(form)}`),
    );
    if (form === "waffle") {
      const nc = Math.ceil(n / wr);
      const [ox, oy] = [ax + (aw - nc * pitch) / 2, ay + (ah - wr * pitch) / 2];
      pts.forEach((d, i) => {
        const j = rank.get(d)!;
        ((cx[i] = ox + (Math.floor(j / wr) + 0.5) * pitch),
          (cy[i] = oy + ((j % wr) + 0.5) * pitch));
      });
    } else if (form === "bars") {
      const k = bb.k;
      const base = ay + ah - BASE;
      const at = new Map(cols.map((c, i) => [c, i]));
      const used = new Map<number, number>();
      pts.forEach((d, i) => {
        const j = used.get(d.ci) ?? 0;
        used.set(d.ci, j + 1);
        const left = ax + at.get(d.ci)! * sw + (sw - k * pitch) / 2;
        cx[i] = left + ((j % k) + 0.5) * pitch;
        cy[i] = base - (Math.floor(j / k) + 0.5) * pitch;
      });
      cols.forEach((c, i) => {
        const room = Math.max(0, Math.floor(sw / 6.5));
        const name = ctx.fmt(spec.x, pts.find((d) => d.ci === c)!.g);
        const fit = name.length <= room ? name : room >= 4 ? `${name.slice(0, room - 1)}…` : "";
        const mid = r(ax + (i + 0.5) * sw);
        if (fit)
          labels += el(
            "text",
            { x: mid, y: r(base + 14), "text-anchor": "middle", "data-col": true },
            esc(fit),
          );
        labels += el(
          "text",
          { x: mid, y: r(base + 26), "text-anchor": "middle", "data-v": true },
          esc(ctx.fmt("", cnt.get(c))),
        );
      });
    } else {
      const sx = ctx.x as LinearScale;
      const xs = pts.map((d) => sx.of(d.v));
      // The swarm shrinks its dots (the flight scales them) until it fits the band.
      let off = dodge(xs, rad * 2 + 0.5);
      while (rad > 1.5 && Math.max(0, ...off.map(Math.abs)) > ah / 2 - rad)
        off = dodge(xs, (rad = Math.max(1.5, rad * 0.85)) * 2 + 0.5);
      const lim = Math.max(0, ah / 2 - rad);
      pts.forEach(
        (_, i) => (
          (cx[i] = xs[i]!),
          (cy[i] = ay + ah / 2 + Math.max(-lim, Math.min(lim, off[i]!)))
        ),
      );
    }

    const cb = cbField(spec);
    const marks = pts
      .map((d, i) => {
        const grp = ctx.fmt(spec.x, d.g);
        const ser = shaped.series[d.si]!;
        const cv = cb ? d.row[cb] : null;
        return el("circle", {
          "data-maya": "mark",
          "data-key": d.k,
          "data-c": d.i,
          "data-s": d.ci % 8,
          "data-n": "g" + d.ci,
          "data-a": "g" + d.ci,
          "data-mm": true,
          "data-x": d.name ?? grp,
          "data-series": d.name !== null ? grp : ser || null,
          "data-y": d.v,
          "data-f": ctx.fmt(spec.y, d.v),
          "data-tone": ctx.tone(d.v),
          "data-q": typeof cv === "number" ? ctx.q(cv) : null,
          r: r(rad),
          cx: r(cx[i]!),
          cy: r(cy[i]!),
        });
      })
      .join("");
    return {
      marks,
      hits: "",
      labels: cap + labels,
      note: ctx.t("perDot", ti(spec.name ?? spec.x)) + ".",
    };
  },
};

register("units", units);
