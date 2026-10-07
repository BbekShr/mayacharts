/*
 * mayacharts/constellation: rows as stars, placed by how alike their measures are. Imports only
 * registry, svg, scale, ticks and types.
 *
 * Spec: x = name (one star per row), y = 2 or more measures (validate: too-few-measures; all
 * shown, no measure toggle, as parallel), optional size (star area, else the first measure) and
 * colorBy (a numeric field: ramp; "sign": tone of the first measure; none: the accent).
 * Algorithm:
 *   - Standardise each measure (z-scores); a constant measure is dropped from the PCA.
 *   - Deterministic 2-D PCA: 48 power iterations from a fixed start vector (the second component
 *     after deflation), each loading vector sign-normalised (first non-zero loading positive), so
 *     the same data gives the same bytes and the sky never flips between renders. Under 3 rows
 *     there is nothing to fit: one row at the centre, two on a horizontal line.
 *   - Rows with a non-number measure are left out; the description says how many.
 *   - Neighbours are measured in the full standardised space (what "alike" means), not on
 *     screen. A star's data-a lists the stars that count it among their 3 nearest, and its
 *     data-n is its own index, so the tooltip's flow lighting (`[data-a~=n]`) lights the 3 stars
 *     nearest to the one hovered. A thin line joins each star to its single nearest.
 *   - Up to 5 labels, spread over the sky, only where the box clears every star. Visible hint: text.alike.
 *   - Stars are `<circle data-maya="mark">` keyed `c~NAME` (svg.ts nameId for repeats).
 *   - No hits: the element's nearest-point pick (scatter's) is the intended hit model.
 */
import { register } from "./core/registry.ts";
import { cbField, el, esc, key, nameId, r } from "./core/svg.ts";
import type { Mark } from "./core/types.ts";

// ponytail: the nearest-neighbour search is O(n^2) and the measure columns are standardised in
// memory, so a constellation stops at 500 rows and 12 measures.
const MAX_ROWS = 500;
const MAX_MEASURES = 12;
const K = 3;
const PAD = 14;
const ITER = 48;

/** Largest eigenvector of a symmetric matrix by power iteration; sign: first non-zero loading positive. */
function power(m: number[][]): number[] {
  let v = m.map((_, i) => 1 + i * 0.37);
  for (let it = 0; it < ITER; it++) {
    const w = m.map((row) => row.reduce((s, c, j) => s + c * v[j]!, 0));
    const n = Math.hypot(...w);
    if (n < 1e-12) return v.map(() => 0);
    v = w.map((x) => x / n);
  }
  const f = v.find((x) => Math.abs(x) > 1e-9);
  return f !== undefined && f < 0 ? v.map((x) => -x) : v;
}

export const constellation: Mark = {
  noun: "Constellation",
  check(spec, fail) {
    if (spec.data.length > MAX_ROWS)
      fail(
        "too-many-marks",
        "data",
        `spec.data has ${spec.data.length} rows; a constellation draws at most ${MAX_ROWS} (its neighbour search is quadratic).`,
        "Aggregate or filter the rows first.",
      );
    if (Array.isArray(spec.y) && spec.y.length > MAX_MEASURES)
      fail(
        "too-many-marks",
        "y",
        `spec.y has ${spec.y.length} measures; a constellation takes at most ${MAX_MEASURES}.`,
        "Pick the measures that matter.",
      );
  },
  draw(ctx) {
    const { spec, plot } = ctx;
    const ms = spec.measures;
    const ti = (f: string) => spec.titles.get(f) ?? f;
    const rows = spec.data.filter((row) => ms.every((m) => typeof row[m] === "number"));
    const n = rows.length;
    const left = spec.data.length - n;
    const note = left
      ? ` ${ctx.fmt("", left)} of ${ctx.fmt("", spec.data.length)} rows have a missing measure and are left out.`
      : "";
    if (!n) return { marks: "", hits: "", note };

    // Standardise; a constant measure has no spread and is dropped.
    const raw = ms.map((m) => rows.map((row) => row[m] as number));
    const z = raw
      .map((c) => {
        const mu = c.reduce((a, b) => a + b, 0) / n;
        const sd = Math.sqrt(c.reduce((a, b) => a + (b - mu) ** 2, 0) / n);
        return sd > 1e-12 ? c.map((v) => (v - mu) / sd) : null;
      })
      .filter((c): c is number[] => c !== null);
    const d = z.length;
    const cov = z.map((a) => z.map((b) => a.reduce((s, v, t) => s + v * b[t]!, 0) / n));
    let p: number[][] = rows.map(() => [0, 0]);
    if (n > 2 && d) {
      const e1 = power(cov);
      const l = cov.map((row) => row.reduce((s, c, j) => s + c * e1[j]!, 0));
      const lam = l.reduce((s, x, i) => s + x * e1[i]!, 0);
      const e2 =
        d > 1 ? power(cov.map((row, i) => row.map((c, j) => c - lam * e1[i]! * e1[j]!))) : [];
      p = rows.map((_, i) => [e1, e2].map((e) => e.reduce((s, c, k) => s + c * z[k]![i]!, 0)));
    } else if (n === 2)
      p = [
        [-1, 0],
        [1, 0],
      ];

    // Stars sized by area; fit the sky to the plot box, keeping its proportions.
    const sz = spec.size ?? ms[0]!;
    const val = rows.map((row) => Math.abs(typeof row[sz] === "number" ? (row[sz] as number) : 0));
    const vmax = Math.max(...val) || 1;
    const k = Math.min(plot.w, plot.h) / 44 / Math.max(1, Math.sqrt(n / 40)); // crowded skies get smaller stars
    const rad = val.map((v) =>
      r(Math.max(1.5, 2.5 / Math.max(1, Math.sqrt(n / 40))) + Math.sqrt(v / vmax) * k),
    );
    const span = (a: number) => {
      const c = p.map((q) => q[a]!);
      return [Math.min(...c), Math.max(...c)] as const;
    };
    const [[x0, x1], [y0, y1]] = [span(0), span(1)];
    const pad = PAD + Math.max(...rad);
    const bw = Math.max(1, plot.w - 2 * pad);
    const bh = Math.max(1, plot.h - 2 * pad);
    // Each axis fills the box on its own, so a flat sky still spreads (distances on screen are
    // a picture; the neighbours below are measured in the data).
    const fit = (a: number, lo: number, hi: number, o: number, len: number) =>
      p.map((q) => r(o + (hi > lo ? ((q[a]! - lo) / (hi - lo)) * len : len / 2)));
    const px = fit(0, x0, x1, plot.x + pad, bw);
    const py = fit(1, y0, y1, plot.y + pad, bh);

    // Nearest neighbours in the full standardised space.
    const near = rows.map((_, i) =>
      rows
        .map((__, j) => [j, z.reduce((a, c) => a + (c[i]! - c[j]!) ** 2, 0)] as const)
        .filter(([j]) => j !== i)
        .sort((a, b) => a[1] - b[1] || a[0] - b[0])
        .slice(0, K)
        .map(([j]) => j),
    );
    const by = rows.map((_, j) => near.flatMap((a, i) => (a.includes(j) ? [i] : [])));

    const seen = new Map<string, number>();
    const ids = rows.map((row, i) =>
      nameId(seen, row[spec.x] == null ? null : String(row[spec.x]), i),
    );
    const names = rows.map((row, i) => (row[spec.x] == null ? String(i) : String(row[spec.x])));
    const cb = cbField(spec);
    const joined = new Set<string>();
    let grid = "";
    near.forEach((a, i) => {
      const j = a[0];
      if (j === undefined) return;
      const id = Math.min(i, j) + "-" + Math.max(i, j);
      if (joined.has(id)) return;
      joined.add(id);
      grid += el("line", { x1: px[i], y1: py[i], x2: px[j], y2: py[j] });
    });

    let marks = "";
    [...rows.keys()]
      .sort((a, b) => rad[b]! - rad[a]! || a - b) // big stars first, small ones stay on top
      .forEach((i) => {
        const row = rows[i]!;
        const cv = cb ? row[cb] : null;
        const tone = spec.colorBy === "sign" ? ctx.tone(raw[0]![i]!) : null;
        marks += el("circle", {
          "data-maya": "mark",
          "data-key": key("c", ids[i]),
          "data-c": i,
          "data-n": i,
          "data-a": by[i]!.join(" ") || null,
          "data-x": names[i],
          "data-y": raw[0]![i],
          "data-f": [
            ...ms.map((m, q) => `${ti(m)}\t${ctx.fmt(m, raw[q]![i])}`),
            ...(near[i]!.length
              ? [`\t${ctx.t("nearest", near[i]!.map((j) => names[j]).join(", "))}`]
              : []),
          ].join("\n"),
          "data-tone": tone,
          "data-q": typeof cv === "number" ? ctx.q(cv) : null,
          fill: "var(--c,var(--maya-series-1))",
          stroke: "color-mix(in oklab,var(--c,var(--maya-series-1)) 55%,var(--maya-fg))",
          "stroke-width": 1,
          r: rad[i],
          cx: px[i],
          cy: py[i],
        });
      });

    // Names, spread over the sky: start at the largest star, then take the star farthest from
    // every named one, skipping any whose label box would cover a star or a chosen label.
    // ponytail: greedy, 5 names; ctx.label still drops what collides or leaves the svg.
    const boxes: number[][] = [];
    const named: number[] = [];
    const free = (i: number, below: boolean) => {
      const w = names[i]!.length * 7.2 + 4;
      const x = px[i]! - w / 2;
      const y = below ? py[i]! + rad[i]! + 2 : py[i]! - rad[i]! - 16;
      const ok =
        !boxes.some((b) => x < b[2]! && x + w > b[0]! && y < b[3]! && y + 14 > b[1]!) &&
        rows.every(
          (_, j) =>
            Math.abs(px[j]! - Math.max(x, Math.min(px[j]!, x + w))) +
              Math.abs(py[j]! - Math.max(y, Math.min(py[j]!, y + 14))) >
            rad[j]! + 1,
        );
      if (ok) boxes.push([x, y, x + w, y + 14]);
      return ok;
    };
    const dist = (i: number) =>
      Math.min(...named.map((j) => Math.hypot(px[i]! - px[j]!, py[i]! - py[j]!)));
    const todo = new Set(rows.keys());
    while (named.length < 5 && todo.size) {
      const i = [...todo].reduce((m, c) =>
        (named.length ? dist(c) - dist(m) : val[c]! - val[m]!) > 0 ? c : m,
      );
      todo.delete(i);
      const below = !free(i, false);
      if (below && !free(i, true)) continue;
      named.push(i);
      ctx.label(
        px[i]!,
        below ? r(py[i]! + rad[i]!) : r(py[i]! - rad[i]!),
        names[i]!,
        below ? "below" : "above",
        key("c", ids[i]),
      );
    }

    const hint = ctx.t("alike", ms.map(ti).join(", "));
    const hintEl =
      hint.length * 6 < plot.w
        ? el("text", { x: r(plot.x + 4), y: r(plot.y + plot.h - 4), "data-v": true }, esc(hint))
        : "";
    return { marks, hits: "", grid, labels: hintEl, note };
  },
};

register("constellation", constellation);
