import { thin } from "../shape.ts";
import { el, esc, key, plotHit, r } from "../svg.ts";
import type { Cell, Mark, MarkCtx } from "../types.ts";

const PAD = 12;
// One hover target per 4 px of sparkline; a denser series keeps each bucket's low and high.
const PX = 4;
const num = (v: unknown) => (typeof v === "number" ? v : null);

/** Headline, delta vs previous period, sparkline, target bullet. No axes: everything from width/height. */
function draw(ctx: MarkCtx) {
  const { spec, shaped, width: W, height: H } = ctx;
  const cats = spec.x ? shaped.categories : [];
  const cells: Cell[] = spec.x ? shaped.cells.filter((c) => c.si === 0) : [];
  const live = cells.filter((c) => c.value !== null);
  const last = live[live.length - 1];
  const value = spec.x
    ? (last?.value ?? null)
    : ctx.agg(spec.aggregate)(spec.data.map((row) => num(row[spec.y])));
  const mid = W / 2;
  if (value === null)
    return {
      marks: "",
      hits: "",
      labels: el(
        "text",
        { "data-maya": "empty", x: r(mid), y: r(H / 2), "text-anchor": "middle" },
        esc(ctx.t("noData")),
      ),
    };

  const ci = last?.ci ?? 0;
  const period = spec.x ? ctx.fmt(spec.x, cats[ci]) : "";
  const f = ctx.fmt(spec.y, value);
  const fs = r(Math.max(16, Math.min(H * 0.32, 72, (W - 2 * PAD) / (f.length * 0.62))));
  const payload = {
    "data-c": ci,
    "data-s": 0,
    "data-x": period,
    "data-y": value,
    "data-f": f,
  };
  const text = (a: Parameters<typeof el>[1], s: string) =>
    el("text", { ...a, "dominant-baseline": "hanging", x: PAD }, esc(s));
  const pct = (o: Intl.NumberFormatOptions) =>
    new Intl.NumberFormat(spec.locale, { style: "percent", maximumFractionDigits: 1, ...o });

  let marks = text(
    { "data-maya": "mark", "data-key": "v", ...payload, "font-size": fs, y: PAD },
    f,
  );
  let labels = "";
  let hits = "";
  let top = PAD + fs + 4;
  const prev = live[live.length - 2];
  if (last && prev && prev.value) {
    const chg = (value - prev.value) / Math.abs(prev.value);
    const s = pct({ signDisplay: "exceptZero" }).format(chg).replace("-", "\u2212");
    labels += text(
      {
        "data-kpi": "delta",
        "data-tone": chg > 0 ? "good" : chg < 0 ? "bad" : null,
        y: r(top),
        "font-size": 12,
      },
      ctx.t("vs", s, ctx.fmt(spec.x, cats[prev.ci])),
    );
    top += 16;
  }
  const rowTop = top; // where the period caption sits when there is no sparkline to anchor it to
  top += 18;

  let grid = "";
  const target = typeof spec.colorBy === "object" && spec.colorBy ? spec.colorBy.target : null;
  let bottom = H - PAD;
  if (target) {
    const w = W - 2 * PAD;
    const k = Math.min(Math.max(value / target, 0), 1.2) / 1.2;
    bottom -= 8;
    // Unkeyed parts live outside the marks group (the element diffs marks by data-key).
    grid = el("rect", { "data-kpi": "track", x: PAD, y: bottom, width: r(w), height: 8, rx: 4 });
    marks += el("rect", {
      "data-maya": "mark",
      "data-key": "b",
      ...payload,
      "data-kpi": "fill",
      "data-tone": ctx.tone(value),
      x: PAD,
      y: bottom,
      width: r(w * k),
      height: 8,
      rx: 4,
    });
    labels += el("line", {
      "data-kpi": "target",
      "stroke-width": 2,
      x1: r(PAD + w / 1.2),
      x2: r(PAD + w / 1.2),
      y1: bottom - 3,
      y2: bottom + 11,
    });
    labels += text(
      { "data-kpi": "of", y: bottom - 16, "font-size": 11 },
      ctx.t("ofTarget", pct({}).format(value / target), ctx.fmt(spec.y, target)),
    );
    bottom -= 24;
  }

  // ponytail: sparkline needs 28px; with a target bullet and a short box the bullet wins.
  // A long series arrives thinned (shape.ts): x positions come from the kept categories' own indexes.
  const total = shaped.reduced?.[1] ?? cats.length;
  const at = (ci: number) => shaped.index?.[ci] ?? ci;
  if (cats.length >= 3 && bottom - top >= 28) {
    const vs = live.map((c) => c.value!);
    const lo = vs.reduce((a, b) => Math.min(a, b)); // not Math.min(...vs): that throws on long series
    const span = vs.reduce((a, b) => Math.max(a, b)) - lo || 1;
    const n = total - 1;
    const step = (W - 2 * PAD) / n;
    const px = (i: number) => r(PAD + at(i) * step);
    const py = (v: number) => r(bottom - ((v - lo) / span) * (bottom - top - 4) - 2);
    const shown = thin([cells.map((c) => c.value)], Math.floor((W - 2 * PAD) / PX)).map(
      (k) => cells[k]!,
    );
    let d = "";
    let gap = true;
    shown.forEach((c) => {
      if (c.value === null) return void (gap = true);
      d += `${gap ? "M" : "L"}${px(c.ci)} ${py(c.value)}`;
      gap = false;
      marks += el("circle", {
        "data-maya": "mark",
        "data-key": key("", cats[c.ci]),
        "data-c": c.ci,
        "data-s": 0,
        "data-x": ctx.fmt(spec.x, cats[c.ci]),
        "data-y": c.value,
        "data-f": ctx.fmt(spec.y, c.value),
        "data-neg": c.value < 0,
        "data-last": c === last,
        r: 3,
        cx: px(c.ci),
        cy: py(c.value),
      });
    });
    // Unbroken sparkline: a soft area under it (render.ts adds the fading gradient).
    marks =
      (live.length === cells.length
        ? el("path", {
            "data-maya": "area",
            "data-key": key("a", ""),
            "data-s": 0,
            d: `${d}L${px(last!.ci)} ${r(bottom)}L${px(live[0]!.ci)} ${r(bottom)}Z`,
          })
        : "") +
      el("path", {
        "data-maya": "line",
        "data-key": key("l", ""),
        "data-s": 0,
        pathLength: 1,
        d: d || null,
      }) +
      marks;
    hits = plotHit({ x: 0, y: 0, w: W, h: H });
    // The headline's period names the sparkline's last point: right-aligned above it.
    if (period)
      labels += el(
        "text",
        {
          "data-kpi": "period",
          x: px(last!.ci),
          // Above every point under the caption, so the line never crosses it.
          y: Math.max(
            top,
            Math.min(
              ...shown
                .filter(
                  (c) => c.value !== null && +px(c.ci) > +px(last!.ci) - period.length * 6 - 6,
                )
                .map((c) => +py(c.value!)),
            ) - 18,
          ),
          "font-size": 11,
          "text-anchor": "end",
          "dominant-baseline": "hanging",
        },
        esc(period),
      );
  } else if (period)
    labels += text({ "data-kpi": "period", y: r(rowTop), "font-size": 11 }, period);
  return { marks, hits, labels, grid };
}

export const kpi: Mark = { noun: "KPI", draw };
