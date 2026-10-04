import { el, esc, key, r } from "../svg.ts";
import type { Cell, Mark, MarkCtx } from "../types.ts";

const PAD = 12;
const num = (v: unknown) => (typeof v === "number" ? v : null);

/** Headline, delta vs previous period, sparkline, target bullet. No axes: everything from width/height. */
function draw(ctx: MarkCtx) {
  const { spec, shaped, width: W, height: H } = ctx;
  const cats = spec.x ? shaped.categories : [];
  const cells: Cell[] = spec.x
    ? shaped.cells.filter((c) => c.si === 0).sort((a, b) => a.ci - b.ci)
    : [];
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
    "data-series": "",
    "data-y": value,
    "data-f": f,
  };
  const text = (a: Parameters<typeof el>[1], s: string) =>
    el("text", { "dominant-baseline": "hanging", x: PAD, ...a }, esc(s));

  let marks = el(
    "text",
    {
      "data-maya": "mark",
      "data-key": "v",
      ...payload,
      "font-size": fs,
      x: PAD,
      y: PAD,
      "dominant-baseline": "hanging",
    },
    esc(f),
  );
  let labels = "";
  let hits = "";
  let top = PAD + fs + 4;
  const prev = live[live.length - 2];
  if (last && prev && prev.value) {
    const pct = (value - prev.value) / Math.abs(prev.value);
    const s = new Intl.NumberFormat(spec.locale, {
      style: "percent",
      maximumFractionDigits: 1,
      signDisplay: "exceptZero",
    }).format(pct);
    labels += text(
      {
        "data-kpi": "delta",
        "data-tone": pct > 0 ? "good" : pct < 0 ? "bad" : null,
        y: r(top),
        "font-size": 12,
      },
      ctx.t("vs", s, ctx.fmt(spec.x, cats[prev.ci])),
    );
    top += 16;
  }
  if (period) labels += text({ "data-kpi": "period", y: r(top), "font-size": 11 }, period);
  top += 18;

  let grid = "";
  const target = typeof spec.colorBy === "object" && spec.colorBy ? spec.colorBy.target : null;
  let bottom = H - PAD;
  if (target) {
    const w = W - 2 * PAD;
    const k = Math.min(Math.max(value / target, 0), 1.2) / 1.2;
    const pct = new Intl.NumberFormat(spec.locale, { style: "percent", maximumFractionDigits: 1 });
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
      ctx.t("ofTarget", pct.format(value / target), ctx.fmt(spec.y, target)),
    );
    bottom -= 24;
  }

  // ponytail: sparkline needs 28px; with a target bullet and a short box the bullet wins.
  if (cats.length >= 3 && bottom - top >= 28) {
    const vs = live.map((c) => c.value!);
    const lo = Math.min(...vs);
    const span = Math.max(...vs) - lo || 1;
    const n = cats.length - 1;
    const step = (W - 2 * PAD) / n;
    const px = (i: number) => r(PAD + i * step);
    const py = (v: number) => r(bottom - ((v - lo) / span) * (bottom - top - 4) - 2);
    let d = "";
    let gap = true;
    cells.forEach((c) => {
      if (c.value === null) return void (gap = true);
      d += `${gap ? "M" : "L"}${px(c.ci)} ${py(c.value)}`;
      gap = false;
      marks += el("circle", {
        "data-maya": "mark",
        "data-key": key("", cats[c.ci]),
        "data-c": c.ci,
        "data-s": 0,
        "data-x": ctx.fmt(spec.x, cats[c.ci]),
        "data-series": "",
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
    const a = live[0],
      z = live[live.length - 1];
    marks =
      (a && z && live.length === cells.length
        ? el("path", {
            "data-maya": "area",
            "data-key": key("a", ""),
            "data-s": 0,
            d: `${d}L${px(z.ci)} ${r(bottom)}L${px(a.ci)} ${r(bottom)}Z`,
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
    cats.forEach((_, i) => {
      hits += el("rect", {
        "data-maya": "hit",
        "data-c": i,
        x: r(Math.max(0, PAD + i * step - step / 2)),
        y: 0,
        width: r(step),
        height: H,
        fill: "transparent",
      });
    });
  }
  return { marks, hits, labels, grid };
}

export const kpi: Mark = { noun: "KPI", draw };
