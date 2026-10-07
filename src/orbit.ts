/*
 * mayacharts/orbit: an orrery of categories. Imports only registry, svg, scale, ticks and
 * types.
 *
 * Spec: x = category (a planet), y = value (planet area), optional y2 = growth (speed and
 * direction; shaped.y2 holds it per category). sort and limit work (limit rolls up an Other
 * planet that sits on the outer orbit and does not move), colorBy "sign" tints by growth.
 * Per planet, keyed `o~CATEGORY` (translated to the sun):
 *   <g data-key data-s data-tone>
 *     <g data-v="1..5" [data-neg]>   the theme rotates this about the sun
 *       trail <path data-trail>      static arc behind the planet, sweep proportional to growth
 *       <circle data-maya=mark>      the keyed mark, key S~C, cx/cy on its orbit
 * Names are drawn after every planet, each in its own keyed group `o~CATEGORY~l` (data-a = the
 * planet's data-n, so hovering the planet lights its name): <g data-up>two <text>s</g>. They are STATIC,
 * not in a rotating bucket: a name sits radially outward of its planet's resting angle, on its lane,
 * so names never cross each other while the planets turn. Placed largest planet first and dropped when
 * they would touch the sun, another planet or name, or leave the plot (at most 6 are named).
 * Orbit radius is the rank of y (largest innermost); planet area is |y| (capped to its lane, a negative
 * planet is paler with a ring, data-below); the total sits at the sun as a text mark keyed `t` that counts up, the sum of |y| so the
 * planet areas add up to it (with negative values it is gross, not net, and the sun says so). The trail reads with motion off, in SSR and
 * in toSVG(). Motion (theme.ts and animate.ts): the chart rests at angle 0, where the names stand. The first draw
 * sweeps each g[data-v] in from its own direction (further the faster it is) and the names fade in once
 * settled; a mouse over the chart sets data-spin on the host, which turns the planets at their speed and
 * hides the names; an active planet pauses the turn; leaving glides them home the short way, then the
 * names return. Keyboard focus never spins. Reduced motion and animate:false: always at rest. No y2 means no data-v, so nothing moves.
 * The tooltip's second line (growth) rides in data-f as "label\tvalue" lines, as scatter's does.
 */
import { register } from "./core/registry.ts";
import { clip, el, esc, key, OTHER, r } from "./core/svg.ts";
import { DEG } from "./core/scale.ts";
import type { Mark } from "./core/types.ts";

export const orbit: Mark = {
  noun: "Orbit",
  draw(ctx) {
    const { spec, shaped, plot } = ctx;
    const by = new Map<number, number>();
    for (const c of shaped.cells) if (c.value !== null && !by.has(c.ci)) by.set(c.ci, c.value);
    const ps = [...by].map(([ci, v]) => ({
      ci,
      v,
      name: shaped.categories[ci]!,
      g: shaped.categories[ci] === OTHER ? null : (shaped.y2[ci] ?? null),
    }));
    if (!ps.length) return { marks: "", hits: "" };
    // Rank by size unless `sort` set the order; the Other roll-up is always outermost.
    ps.sort(
      (a, b) =>
        +(a.name === OTHER) - +(b.name === OTHER) ||
        (spec.sort ? 0 : Math.abs(b.v) - Math.abs(a.v)),
    );
    const n = ps.length;
    const vmax = Math.max(...ps.map((p) => Math.abs(p.v))) || 1;
    const gmax = Math.max(...ps.map((p) => Math.abs(p.g ?? 0))) || 1;
    const [cx, cy] = [r(plot.x + plot.w / 2), r(plot.y + plot.h / 2)];
    const P = Math.max(4, Math.min(16, Math.min(plot.w, plot.h) * 0.05, 40 / Math.sqrt(n))); // largest planet radius
    const R0 = Math.max(18, Math.min(Math.min(plot.w, plot.h) * 0.12, 40)); // sun
    const inner = R0 + P + 4;
    const fv = (v: number) => ctx.fmt(spec.y, v);
    const [ty, t2] = [spec.titles.get(spec.y) ?? spec.y, spec.titles.get(spec.y2 ?? "") ?? spec.y2];

    // The growth title says "%" and no format of its own: say it on every figure too, localised.
    // LRI..PDI keeps the sign and digits in one run in right-to-left text.
    const pct =
      spec.y2 && !spec.format.has(spec.y2) && /%/.test(t2 ?? "")
        ? new Intl.NumberFormat(spec.locale, {
            style: "unit",
            unit: "percent",
            signDisplay: "exceptZero",
            maximumFractionDigits: 1,
          })
        : null;
    const grow = (g: number) =>
      `\u2066${pct ? pct.format(g) : (g > 0 ? "+" : "") + ctx.fmt(spec.y2!, g)}\u2069`;
    // Middle ellipsis keeps the end of the name, so "Region number 12" and "Region number 13" differ.
    const nmax = plot.w < 480 ? 9 : 14;
    const short = (s: string) => {
      const c = [...s];
      return c.length <= nmax ? s : c.slice(0, nmax - 4).join("") + "…" + c.slice(-3).join("");
    };
    const text = (s: string, x: number, y: number, o = {}) =>
      el("text", { x, y, "text-anchor": "middle", ...o }, esc(s));
    const R = Math.max(inner + 12, Math.min(plot.w / 2 - 40, plot.h / 2 - P - 28));
    const ring = (k: number) => (n > 1 ? inner + (k * (R - inner)) / (n - 1) : (inner + R) / 2);
    // Planets never outgrow their lane: rings can sit 8 px apart.
    const pmax = Math.min(P, Math.max(3, 0.6 * (n > 1 ? (R - inner) / (n - 1) : R)));
    const g = ps.map((p, k) => {
      const [rr, a] = [ring(k), ((k * 137.5 + 20) % 360) / DEG];
      const [px, py] = [r(rr * Math.sin(a)), r(-rr * Math.cos(a))];
      return {
        rr,
        a,
        px,
        py,
        pr: Math.max(3, pmax * Math.sqrt(Math.abs(p.v) / vmax)),
      };
    });
    // Names are static, on the planet's lane at its resting angle, so they never cross each other
    // while the orbit turns. Placed largest planet first; a name that would touch the sun, a planet,
    // an earlier name or leave the plot is dropped.
    // ponytail: only the 6 largest planets are named, checked at rest; a turning planet can pass
    // behind a name for a moment. The rest answer to hover.
    const boxes: number[][] = [[-R0 - 2, -R0 - 2, R0 + 2, R0 + 2]];
    const named = new Map<number, [string, string, number, number]>();
    const wide = plot.w >= 480; // narrow: the growth stays in the tooltip
    const near = (d: (typeof g)[number], b: number[]) =>
      Math.hypot(
        Math.max(0, Math.abs(d.px - (b[0]! + b[2]!) / 2) - (b[2]! - b[0]!) / 2),
        Math.max(0, Math.abs(d.py - (b[1]! + b[3]!) / 2) - (b[3]! - b[1]!) / 2),
      ) <
      d.pr + 3;
    [...ps.keys()]
      .sort((i, j) => Math.abs(ps[j]!.v) - Math.abs(ps[i]!.v))
      .slice(0, 6)
      .forEach((k) => {
        const p = ps[k]!;
        const { rr, px, py, pr } = g[k]!;
        const nm = short(ctx.fmt(spec.x, p.name));
        const sub = fv(p.v) + (p.g === null || !wide ? "" : " \u00b7 " + grow(p.g));
        const [w, h] = [
          Math.max([...nm].length, [...sub].length - (sub.includes("\u2066") ? 2 : 0)) * 6.8,
          24,
        ];
        const [ux, uy] = [px / rr, py / rr];
        // Exact distance along the outward ray from the planet's edge to the box's near edge.
        const D = pr + 3 + Math.min(w / 2 / Math.abs(ux), h / 2 / Math.abs(uy));
        const [x, y] = [r(px + ux * D), r(py + uy * D)];
        const b = [x - w / 2, y - h / 2, x + w / 2, y + h / 2];
        if (
          b[0]! < -plot.w / 2 ||
          b[2]! > plot.w / 2 ||
          b[1]! < -plot.h / 2 ||
          b[3]! > plot.h / 2 ||
          boxes.some((o) => b[0]! < o[2]! && b[2]! > o[0]! && b[1]! < o[3]! && b[3]! > o[1]!) ||
          g.some((d, i) => i !== k && near(d, b))
        )
          return;
        boxes.push(b);
        named.set(k, [nm, sub, x, y]);
      });
    let marks = "";
    let names = ""; // labels, drawn after every planet so no trail crosses a name
    let grid = el("circle", { cx, cy, r: r(R0), "data-disc": true });
    ps.forEach((p, k) => {
      const { rr, a, px, py, pr } = g[k]!;
      const at = (t: number) => `${r(rr * Math.sin(t))} ${r(-rr * Math.cos(t))}`;
      const share = Math.abs(p.g ?? 0) / gmax;
      // ponytail: speed quantised to 5 buckets (theme durations), not continuous.
      const v = share ? Math.ceil(share * 5) : 0;
      const neg = (p.g ?? 0) < 0;
      const sweep = Math.max(6, share * 110) / DEG;
      const tone = p.g === null ? null : ctx.tone(p.g);
      const [f, gf] = [fv(p.v), p.g === null ? "" : grow(p.g)];
      const name = ctx.fmt(spec.x, p.name);
      const d = {
        "data-key": key(shaped.series[0] ?? "", p.name),
        "data-c": p.ci,
        "data-n": p.ci,
        "data-s": 0,
        "data-x": name,
        "data-series": "",
        "data-y": p.v,
        "data-f": gf ? `${ty}\t${f}\n${t2}\t${gf}` : f,
        "data-tone": tone,
        "data-other": p.name === OTHER,
        "data-below": p.v < 0, // area hides the sign: a negative planet is paler with a ring (theme)
      };
      grid += el("circle", { cx, cy, r: r(rr) });
      marks += el(
        "g",
        {
          "data-key": key("o", p.name),
          transform: `translate(${cx} ${cy})`,
          "data-s": 0,
          "data-tone": tone,
        },
        el(
          "g",
          { "data-v": v || null, "data-neg": neg },
          (v
            ? el("path", {
                "data-trail": true,
                d: `M${at(a + (neg ? sweep : -sweep))}A${r(rr)} ${r(rr)} 0 0 ${neg ? 0 : 1} ${at(a)}`,
              })
            : "") + el("circle", { "data-maya": "mark", ...d, cx: px, cy: py, r: r(pr) }),
        ),
      );
      const l = named.get(k);
      if (l)
        names += el(
          "g",
          {
            "data-key": key("o", p.name, "l"),
            transform: `translate(${cx} ${cy})`,
            "data-s": 0,
            "data-a": p.ci,
          },
          el(
            "g",
            { "data-up": true },
            text(l[0], l[2], l[3] - 1) + text(l[1], l[2], l[3] + 11, { "data-g": true }),
          ),
        );
    });

    // The sun: the grand total counts up like radial's centre.
    const total = ps.reduce((s, p) => s + Math.abs(p.v), 0);
    const f = fv(total);
    const neg = ps.some((p) => p.v < 0); // the sun is gross: say so
    const sub = R0 > 28;
    const fs = Math.max(11, Math.min(R0 * 0.42, 22, (R0 * 1.5) / (f.length * 0.62)));
    marks += el(
      "text",
      {
        "data-maya": "mark",
        "data-key": key("t"),
        "data-x": ty,
        "data-y": total,
        "data-f": f,
        "data-series": "",
        x: cx,
        y: r(cy + (sub ? 6 : 0)),
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        "font-size": r(fs),
        "font-weight": 650,
        "data-total": "",
      },
      esc(f),
    );
    const labels = sub
      ? el(
          "text",
          {
            x: cx,
            y: r(cy - fs / 2 - 4),
            "text-anchor": "middle",
            "dominant-baseline": "middle",
            "font-size": 11,
            "data-ring": "",
          },
          esc(clip(neg ? ctx.t("gross", ty) : ty, Math.floor((R0 * 1.8) / 5.6))),
        )
      : "";
    return {
      marks: marks + names,
      hits: "",
      labels,
      grid,
      ...(spec.y2 ? { note: ctx.t("speedBy", t2!) } : {}),
    };
  },
};

register("orbit", orbit);
