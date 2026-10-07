/*
 * mayacharts/weave: a bump chart whose threads weave. Imports only registry, svg, scale, ticks
 * and types.
 *
 * Spec: x = period (band axis, bottom), y = value, series = one thread each (required, 8 at most).
 * Algorithm:
 *   - Per x, rank the visible series by y, descending (1 = largest; ties in series order). A
 *     null y leaves a gap in that thread; the others rank among themselves.
 *   - Rank sets the vertical position (rank 1 on top). The left axis is a band axis of series
 *     names in the first period's rank order, so the names stand at the thread starts; the
 *     right end labels come from ends() (name and last value), as on line.
 *   - Draw one thick path per segment (period i to i + 1), key `w~SERIES~i`, and under each
 *     segment that crosses another a `--maya-bg` halo (`w~SERIES~i~h`), so a crossing reads as
 *     over and under. In each segment the series whose rank improves is drawn last.
 *   - Threads carry data-s and data-a (the series index); one dot per (series, period) holds the
 *     tooltip (data-n = the series index, so hovering a dot lights its thread through the flow
 *     path in tooltip.ts; data-f = rank and value). Dots are emitted in rank order per period,
 *     so the tooltip lists the leaderboard.
 * Theme rule wanted (theme.ts, not here): [data-w]{opacity:var(--h,var(--d,var(--o)));
 *   transition:opacity .25s}[data-maya=marks]:has([data-active]) [data-w]:not([data-lit]){opacity:.18}
 */
import { register } from "./core/registry.ts";
import { clip, el, esc, key, plotHit, r } from "./core/svg.ts";
import type { BandScale, Cell, Mark, Shaped } from "./core/types.ts";

/**
 * Per period (in order), series index -> [slot, value, rank] of the series present, in slot order.
 * The slot places the thread (1 = top, ties in series order); the rank is what is shown: ties share
 * it (competition ranking) and read "=1".
 */
const ranks = (sh: Shaped) => {
  const by = sh.categories.map(() => [] as Cell[]);
  for (const c of sh.cells) if (c.value !== null) by[c.ci]!.push(c);
  return by.map((cs) => {
    cs.sort((a, b) => b.value! - a.value! || a.si - b.si);
    let top = 0;
    return new Map(
      cs.map((c, i) => {
        if (cs[i - 1]?.value !== c.value) top = i + 1;
        const tied = cs[i - 1]?.value === c.value || cs[i + 1]?.value === c.value;
        return [c.si, [i + 1, c.value!, (tied ? "=" : "") + top] as const];
      }),
    );
  });
};

/** The visible series that have a value somewhere: the ones that get a slot, a thread and a name. */
const live = (sh: Shaped) =>
  sh.visible.filter((si) => sh.cells.some((c) => c.si === si && c.value !== null));

export const weave: Mark = {
  noun: "Weave",
  axes(spec, sh) {
    // Slot k holds the series ranked k + 1 in the first period; a series absent then leaves a
    // blank slot (distinct blanks, so the axis keys stay unique).
    const names = live(sh).map((_, k) => " ".repeat(k + 1));
    // Long names are cut so they do not take the plot: the right labels and the legend carry them whole.
    // Names that clip alike all keep their ends instead (as orbit does), so each label names its own series.
    const cut = (n: string) => clip(n, 16);
    const mid = (n: string) => [...n].slice(0, 9).join("") + "…" + [...n].slice(-6).join("");
    const all = live(sh).map((si) => cut(sh.series[si]!));
    ranks(sh)[0]?.forEach(([k], si) => {
      const n = sh.series[si]!;
      names[k - 1] = all.filter((c) => c === cut(n)).length > 1 ? mid(n) : cut(n);
    });
    return [
      { kind: "band", field: spec.x, domain: sh.categories },
      { kind: "band", field: spec.series ?? "", domain: names },
    ];
  },
  ends: (spec, sh, fmt) =>
    spec.labels || sh.visible.length !== sh.series.length || live(sh).length < 2
      ? []
      : live(sh).map((si) => {
          const c = sh.cells.filter((c) => c.si === si && c.value !== null).at(-1)!;
          const n = sh.series[si]!;
          return [spec.titles.get(n) ?? n, fmt(spec.y, c.value)] as [string, string];
        }),
  check(spec, fail) {
    const f = spec.series as string;
    const n = new Set(spec.data.map((row) => String((row as Record<string, unknown>)[f]))).size;
    // ponytail: 8 series, the palette slot cap; `limit` rolls up categories, never series.
    if (n > 8)
      fail(
        "too-many-marks",
        "series",
        `A weave draws at most 8 threads, and "${f}" has ${n} values.`,
        "Filter the rows to the series that matter, or group the rest into one series first.",
      );
  },
  draw(ctx) {
    const { spec, shaped: sh } = ctx;
    const X = ctx.x as BandScale;
    const Y = ctx.y as BandScale;
    const R = ranks(sh);
    const px = (ci: number) => r(X.at(ci) + X.bandwidth / 2);
    const py = (k: number) => r(Y.at(k - 1) + Y.bandwidth / 2);

    // ponytail: under 32 px a step, only the first and last dot are full size (the rest are pinpricks);
    // with no gutter the last value sits right of the last dot, if the margin has room (else the tooltip has it).
    const quiet = X.step < 32;
    // Room to label a dot above it: two rows apart enough that the value neither leaves the svg nor
    // lands beside the next rank. ponytail: denser than that, the legend and the tooltip name the threads.
    const roomy = Y.step >= 32;
    // A halo along a steep S-curve (under 48 px between periods) chops the thread under it into pieces.
    const halo = X.step < 48 ? 0 : 12;
    let threads = "";
    for (let i = 0; i < R.length - 1; i++) {
      const B = R[i + 1]!;
      const seg = [...R[i]!].flatMap(([si, [a]]) => (B.has(si) ? [[si, a, B.get(si)![0]]] : []));
      // Falling first, rising last: the climber passes over.
      seg.sort((p, q) => p[1]! - p[2]! - (q[1]! - q[2]!));
      const [x0, x1] = [px(i), px(i + 1)];
      const xm = r((x0 + x1) / 2);
      for (const [si, a, b] of seg as [number, number, number][]) {
        const [y0, y1] = [py(a), py(b)];
        const d = `M${x0} ${y0}C${xm} ${y0} ${xm} ${y1} ${x1} ${y1}`;
        const at = { "data-s": si % 8, "data-a": si, "data-c": i, d, fill: "none" };
        const ser = sh.series[si]!;
        // Every segment has a halo, so its key is stable when crossings change in an update.
        threads += el("path", {
          ...at,
          "data-key": key("w", ser, i, "h"),
          "data-w": "h",
          stroke: "var(--maya-bg)",
          "stroke-width": halo,
        });
        threads += el("path", {
          ...at,
          "data-key": key("w", ser, i),
          "data-w": "",
          stroke: "var(--c)",
          "stroke-width": 8,
        });
      }
    }

    let dots = "";
    let hits = plotHit(ctx.plot); // under the dot hits: between dots the nearest period answers, no flicker
    let end = "";
    const last = new Map<number, [number, number, number]>(); // si -> [ci, slot, x] of the last point
    R.forEach((P, ci) => {
      for (const [si, [k, v, rk]] of P) {
        const ser = sh.series[si]!;
        const kk = key(ser, sh.categories[ci]);
        const [cx, cy] = [px(ci), py(k)];
        const pin = quiet && ci > 0 && ci < R.length - 1;
        last.set(si, [ci, k, cx]);
        dots += el("circle", {
          "data-maya": "mark",
          "data-key": kk,
          "data-c": ci,
          "data-s": si % 8,
          "data-n": si,
          "data-a": si,
          "data-x": ctx.fmt(spec.x, sh.categories[ci]),
          "data-series": ser,
          "data-y": v,
          "data-f": `${ctx.t("rank", rk)} · ${ctx.fmt(spec.y, v)}`,
          "data-tone": ctx.tone(v),
          stroke: "var(--maya-bg)",
          "stroke-width": pin ? 1 : 2,
          r: pin ? 2.5 : 5.5,
          cx,
          cy,
        });
        hits += el("rect", {
          "data-maya": "hit",
          "data-key": kk,
          x: cx - 12,
          y: cy - 12,
          width: 24,
          height: 24,
          fill: "transparent",
        });
        // With no gutter the last value stands right of its dot when the margin has room, else just
        // above it (rows 32 px apart keep it nearer its own dot than the rank above).
        const val = ctx.fmt(spec.y, v);
        if (!ctx.gutter && ci === R.length - 1 && !spec.labels)
          (Y.step >= 16 && ctx.label(cx + 9, cy, val, "start", kk)) ||
            (roomy && ctx.label(cx, cy - 6, val, "above", kk));
        if (roomy) {
          if (spec.labels) ctx.label(cx, cy - 6, val, "above", kk);
          // A thread that starts late, or after a gap, has no name on the left axis: name it here.
          if (ci && !R[ci - 1]!.has(si))
            ctx.label(
              cx,
              cy - 6,
              clip(spec.titles.get(ser) ?? ser, 12),
              "above",
              key("w", ser, sh.categories[ci], "n"),
            );
        }
      }
    });

    // Right end labels in the gutter, at the slot of each thread's last point.
    if (ctx.gutter) {
      const cap = Math.max(1, Math.floor((ctx.gutter - 12) / 7.2));
      live(sh).forEach((si, n) => {
        const [ci, k, x] = last.get(si) ?? [];
        const [name, v] = ctx.ends[n] ?? [];
        if (ci === undefined || name === undefined || v === undefined) return;
        // One line when name and value fit; else the name, with the value on a second line if the
        // slot is tall enough, else the name alone. The theme sets unicode-bidi:plaintext, so a leading LRM
        // pins the base direction to LTR and the value is an LTR isolate: bidi cannot reorder either.
        const fit = [...`${name} ${v}`].length <= cap;
        const two = !fit && Y.step >= 30;
        const at = r(x! + 11);
        const val = `<tspan data-v=""${two ? ` x="${at}" dy="14"` : ' dx="4"'}>\u2066${esc(v)}\u2069</tspan>`;
        end += el(
          "text",
          {
            "data-end": true,
            "data-key": key(sh.series[si], sh.categories[ci]),
            "data-s": si % 8,
            x: at,
            y: py(k!) - (two ? 7 : 0),
            "dominant-baseline": "middle",
          },
          "\u200e" + esc(fit ? name : clip(name, cap)) + (fit || two ? val : ""),
        );
      });
    }

    const lead = (ci: number) =>
      sh.categories.length
        ? `${ctx.fmt(spec.x, sh.categories[ci])}: ${[...R[ci]!].map(([si, [, v]], i, a) => (i ? (a[i - 1]![1][1] === v ? " = " : " > ") : "") + sh.series[si]).join("")}`
        : "";
    return {
      marks: threads + dots,
      labels: end,
      hits,
      note: R.length ? [lead(0), ...(R.length > 1 ? [lead(R.length - 1)] : [])].join(". ") : "",
    };
  },
};

register("weave", weave);
