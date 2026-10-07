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
 * Names are drawn after every planet, each in its own keyed group `o~CATEGORY~l` that rotates in the
 * same bucket as its planet (data-a = the planet's data-n, so hovering the planet lights its name),
 * so no trail crosses a name. Orbit radius is the rank of y (largest innermost); planet area is
 * |y|; the total sits at the sun as a text mark keyed `t` that counts up, the sum of |y| so the
 * planet areas add up to it (with negative values it is gross, not net). The trail reads with motion off, in SSR and
 * in toSVG(). Motion is a theme rule, not JS (see theme.ts): no y2 means no data-v, so nothing moves.
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
    const R = Math.max(inner + 12, Math.min(plot.w / 2 - 40, plot.h / 2 - P - 28));
    const ring = (k: number) => (n > 1 ? inner + (k * (R - inner)) / (n - 1) : (inner + R) / 2);
    const fv = (v: number) => ctx.fmt(spec.y, v);
    const [ty, t2] = [spec.titles.get(spec.y) ?? spec.y, spec.titles.get(spec.y2 ?? "") ?? spec.y2];

    // The growth title says "%" and no format of its own: say it on every figure too.
    const pct = spec.y2 && !spec.format.has(spec.y2) && /%/.test(t2 ?? "") ? "%" : "";
    const text = (s: string, x: number, y: number, o = {}) =>
      el("text", { x, y, "text-anchor": "middle", ...o }, esc(s));
    // Label block centred radially outward from the planet (px, py are sun-relative); "" when it
    // would touch the sun, so the sun's title stays clear.
    const lab = (px: number, py: number, pr: number, nm: string, gf: string) => {
      const [w, h, len] = [Math.max(nm.length, gf.length) * 6.4, gf ? 24 : 13, Math.hypot(px, py)];
      const [ux, uy] = [px / len, py / len];
      const d = pr + 2 + Math.abs(ux) * (w / 2) + Math.abs(uy) * (h / 2);
      const [x, y] = [r(ux * d), r(uy * d)];
      if (
        Math.hypot(Math.max(0, Math.abs(px + x) - w / 2), Math.max(0, Math.abs(py + y) - h / 2)) <
        R0 + 2
      )
        return "";
      return el(
        "g",
        { transform: `translate(${px} ${py})` },
        el(
          "g",
          { "data-up": true },
          text(nm, x, y - (gf ? 1 : -4)) + (gf ? text(gf, x, y + 10, { "data-g": true }) : ""),
        ),
      );
    };
    let marks = "";
    let names = ""; // labels, drawn after every planet so no trail crosses a name
    let grid = el("circle", { cx, cy, r: r(R0), "data-disc": true });
    ps.forEach((p, k) => {
      const [rr, a] = [ring(k), ((k * 137.5 + 20) % 360) / DEG];
      const at = (t: number) => `${r(rr * Math.sin(t))} ${r(-rr * Math.cos(t))}`;
      const [px, py] = [r(rr * Math.sin(a)), r(-rr * Math.cos(a))];
      const pr = Math.max(4, P * Math.sqrt(Math.abs(p.v) / vmax));
      const share = Math.abs(p.g ?? 0) / gmax;
      // ponytail: speed quantised to 5 buckets (theme durations), not continuous.
      const v = share ? Math.ceil(share * 5) : 0;
      const neg = (p.g ?? 0) < 0;
      const sweep = Math.max(6, share * 110) / DEG;
      const tone = p.g === null ? null : ctx.tone(p.g);
      const [f, gf] = [
        fv(p.v),
        p.g === null ? "" : (p.g > 0 ? "+" : "") + ctx.fmt(spec.y2!, p.g) + pct,
      ];
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
      // ponytail: only the 8 innermost planets are named; the rest answer to hover.
      // The name sits radially outward from the planet as drawn at rest (it is upright but
      // not orbiting with it, so under motion it drifts); a label that would touch the sun is skipped.
      const l = k < 8 ? lab(px, py, pr, clip(name, 12), gf) : "";
      if (l)
        names += el(
          "g",
          {
            "data-key": key("o", p.name, "l"),
            transform: `translate(${cx} ${cy})`,
            "data-s": 0,
            "data-a": p.ci,
          },
          v ? el("g", { "data-v": v, "data-neg": neg }, l) : l,
        );
    });

    // The sun: the grand total counts up like radial's centre.
    const total = ps.reduce((s, p) => s + Math.abs(p.v), 0);
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
          esc(clip(ty, Math.floor((R0 * 1.8) / 6.2))),
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
