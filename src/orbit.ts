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
 *       <g translate(planet)><g data-up>name and growth</g></g>   counter-rotated: stays upright
 * Orbit radius is the rank of y (largest innermost); planet radius is sqrt(y); the total sits at
 * the sun as a text mark keyed `t` that counts up. The trail reads with motion off, in SSR and
 * in toSVG(). Motion is a theme rule, not JS (see theme.ts): no y2 means no data-v, so nothing moves.
 * The tooltip's second line (growth) rides in data-f as "label\tvalue" lines, as scatter's does.
 */
import { register } from "./core/registry.ts";
import { el, esc, key, OTHER, r } from "./core/svg.ts";
import type { Mark } from "./core/types.ts";

const D = Math.PI / 180;
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

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
    const R = Math.max(inner + 12, Math.min(plot.w / 2 - 36, plot.h / 2 - P - 16));
    const ring = (k: number) => (n > 1 ? inner + (k * (R - inner)) / (n - 1) : (inner + R) / 2);
    const fv = (v: number) => ctx.fmt(spec.y, v);
    const [ty, t2] = [spec.titles.get(spec.y) ?? spec.y, spec.titles.get(spec.y2 ?? "") ?? spec.y2];

    let marks = "";
    let grid = el("circle", { cx, cy, r: r(R0), "data-disc": true });
    ps.forEach((p, k) => {
      const [rr, a] = [ring(k), (((k * 137.5 + 20) % 360) * Math.PI) / 180];
      const at = (t: number) => `${r(rr * Math.sin(t))} ${r(-rr * Math.cos(t))}`;
      const [px, py] = [r(rr * Math.sin(a)), r(-rr * Math.cos(a))];
      const pr = Math.max(4, P * Math.sqrt(Math.abs(p.v) / vmax));
      const share = Math.abs(p.g ?? 0) / gmax;
      // ponytail: speed quantised to 5 buckets (theme durations), not continuous.
      const v = share ? Math.ceil(share * 5) : 0;
      const neg = (p.g ?? 0) < 0;
      const sweep = Math.max(6, share * 110) * D;
      const tone = p.g === null ? null : ctx.tone(p.g);
      const [f, gf] = [fv(p.v), p.g === null ? "" : (p.g > 0 ? "+" : "") + ctx.fmt(spec.y2!, p.g)];
      const name = ctx.fmt(spec.x, p.name);
      const d = {
        "data-key": key(shaped.series[0] ?? "", p.name),
        "data-c": p.ci,
        "data-s": 0,
        "data-x": name,
        "data-series": "",
        "data-y": p.v,
        "data-f": gf ? `${ty}\t${f}\n${t2}\t${gf}` : f,
        "data-tone": tone,
        "data-other": p.name === OTHER,
      };
      const text = (s: string, y: number, o = {}) =>
        el("text", { y, "text-anchor": "middle", ...o }, esc(s));
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
            : "") +
            el("circle", { "data-maya": "mark", ...d, cx: px, cy: py, r: r(pr) }) +
            // ponytail: only the 8 innermost planets are named; the rest answer to hover.
            (k < 8
              ? el(
                  "g",
                  { transform: `translate(${px} ${py})` },
                  el(
                    "g",
                    { "data-up": true },
                    text(cut(name, 12), r(pr + 11)) +
                      (gf ? text(gf, r(pr + 22), { "data-g": true }) : ""),
                  ),
                )
              : ""),
        ),
      );
    });

    // The sun: the grand total counts up like radial's centre.
    const total = ps.reduce((s, p) => s + p.v, 0);
    const f = fv(total);
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
          esc(cut(ty, Math.floor((R0 * 1.8) / 6.2))),
        )
      : "";
    return {
      marks,
      hits: "",
      labels,
      grid,
      ...(spec.y2 ? { note: ctx.t("speedBy", t2!) } : {}),
    };
  },
};

register("orbit", orbit);
