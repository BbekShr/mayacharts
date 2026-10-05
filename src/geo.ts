// US state hex cartogram. Importing this file registers the "hexmap" type.
import { register } from "./core/registry.ts";
import { el, key, r, esc } from "./core/svg.ts";
import type { Mark } from "./core/types.ts";

// "CODE Name col row": odd-r offset grid (odd rows shift right half a hex), pointy-top.
const TABLE =
  "AK Alaska 0 0|ME Maine 10 0|WI Wisconsin 5 1|VT Vermont 9 1|NH New Hampshire 10 1|" +
  "WA Washington 0 2|ID Idaho 1 2|MT Montana 2 2|ND North Dakota 3 2|MN Minnesota 4 2|IL Illinois 5 2|MI Michigan 6 2|NY New York 8 2|MA Massachusetts 9 2|" +
  "OR Oregon 0 3|NV Nevada 1 3|WY Wyoming 2 3|SD South Dakota 3 3|IA Iowa 4 3|IN Indiana 5 3|OH Ohio 6 3|PA Pennsylvania 7 3|NJ New Jersey 8 3|CT Connecticut 9 3|RI Rhode Island 10 3|" +
  "CA California 0 4|UT Utah 1 4|CO Colorado 2 4|NE Nebraska 3 4|MO Missouri 4 4|KY Kentucky 5 4|WV West Virginia 6 4|VA Virginia 7 4|MD Maryland 8 4|DE Delaware 9 4|" +
  "AZ Arizona 1 5|NM New Mexico 2 5|KS Kansas 3 5|AR Arkansas 4 5|TN Tennessee 5 5|NC North Carolina 6 5|SC South Carolina 7 5|DC District of Columbia 8 5|" +
  "OK Oklahoma 3 6|LA Louisiana 4 6|MS Mississippi 5 6|AL Alabama 6 6|GA Georgia 7 6|" +
  "HI Hawaii 0 7|TX Texas 3 7|FL Florida 7 7|PR Puerto Rico 8 8";

const STATES = TABLE.split("|").map((e) => {
  const m = /^(\S+) (.+) (\d+) (\d+)$/.exec(e)!;
  return { code: m[1]!, name: m[2]!, c: +m[3]!, r: +m[4]! };
});
const BY = new Map<string, (typeof STATES)[number]>();
for (const s of STATES) BY.set(s.code.toLowerCase(), s).set(s.name.toLowerCase(), s);

const find = (v: unknown) => BY.get(String(v).trim().toLowerCase());

/** Closest code or name (a few edits away), else "". */
const near = (v: string): string => {
  const a = v.trim().toLowerCase();
  let best = "";
  let min = 4;
  for (const [k, s] of BY) {
    const n =
      Math.abs(a.length - k.length) +
      [...k].filter((ch) => !a.includes(ch)).length +
      [...a].filter((ch) => !k.includes(ch)).length;
    if (n < min) [min, best] = [n, k.length === 2 ? s.code : s.name];
  }
  return best;
};

const R3 = Math.sqrt(3);
const COLS = Math.max(...STATES.map((s) => s.c)) + 1.5;
const ROWS = Math.max(...STATES.map((s) => s.r)) + 1;

export const hexmap: Mark = {
  noun: "Hex map",
  check(spec, fail) {
    spec.data.forEach((row, i) => {
      const v = (row as Record<string, unknown>)[spec.x as string];
      if (v == null || find(v)) return;
      const d = near(String(v));
      fail(
        "unknown-state",
        `data[${i}].${spec.x}`,
        `"${v}" is not a US state`,
        d && `Did you mean "${d}"?`,
        "Use a two-letter code or full name (50 states, DC, PR).",
      );
    });
  },
  draw(ctx) {
    const { spec, shaped, plot } = ctx;
    const s = Math.min(plot.w / (R3 * COLS), plot.h / (1.5 * (ROWS - 1) + 2));
    const ox = plot.x + (plot.w - R3 * s * COLS) / 2;
    const oy = plot.y + (plot.h - s * (1.5 * (ROWS - 1) + 2)) / 2;
    // Gap between hexes in px (shrinks with tiny maps); the 1.5px round-join stroke is part of the hex.
    const k = s - Math.min(2.4, s * 0.14);
    const at = (st: (typeof STATES)[number]) => [
      ox + R3 * s * (st.c + 0.5 + (st.r % 2) / 2),
      oy + s + 1.5 * s * st.r,
    ];
    const hex = (st: (typeof STATES)[number]) => {
      const [cx, cy] = at(st) as [number, number];
      return (
        "M" +
        [0, 1, 2, 3, 4, 5]
          .map((i) => {
            const a = (Math.PI / 3) * i - Math.PI / 6;
            return `${r(cx + k * Math.cos(a))} ${r(cy + k * Math.sin(a))}`;
          })
          .join("L") +
        "Z"
      );
    };

    const sum = new Map<(typeof STATES)[number], number>();
    shaped.cells.forEach((c) => {
      const st = find(shaped.categories[c.ci]);
      if (st && c.value !== null) sum.set(st, (sum.get(st) ?? 0) + c.value);
    });
    const vals = [...sum.values()];
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);

    // Missing states stay on the map as dashed empty hexes with a faint code.
    let grid = "";
    let marks = "";
    let labels = "";
    let n = 0;
    const w = R3 * k;
    const fc = Math.min(13, s * 0.55);
    const fv = fc * 0.8;
    const text = (cx: number, cy: number, str: string, extra: Record<string, unknown>) =>
      el(
        "text",
        { x: r(cx), y: r(cy), "text-anchor": "middle", "dominant-baseline": "middle", ...extra },
        esc(str),
      );
    // Values only when the longest still fits in a hex (so narrow maps drop them first, then codes).
    const f = new Map([...sum].map(([st, v]) => [st, ctx.fmt(spec.y, v)] as const));
    const showV =
      fv >= 8 && Math.max(0, ...[...f.values()].map((x) => x.length)) * fv * 0.6 <= w * 0.8;
    const showC = w >= 15;
    const dy = showV ? fc * 0.3 : 0;
    for (const st of STATES) {
      if (sum.has(st)) continue;
      grid += el("path", {
        d: hex(st),
        fill: "none",
        "stroke-dasharray": "3 3",
        "data-none": true,
      });
      const [cx, cy] = at(st) as [number, number];
      if (showC)
        labels += text(cx, cy, st.code, {
          "data-in": true,
          opacity: 0.4,
          "font-size": r(fc),
        });
    }
    for (const [st, v] of sum) {
      const [cx, cy] = at(st) as [number, number];
      const q = hi > lo ? Math.min(9, Math.floor(((v - lo) / (hi - lo)) * 10)) : 9;
      marks += el("path", {
        "data-maya": "mark",
        "data-key": key("g", st.code),
        "data-c": n++,
        "data-s": 0,
        "data-x": st.name,
        "data-series": "",
        "data-f": f.get(st),
        "data-y": v,
        "data-neg": v < 0,
        "data-tone": ctx.tone(v),
        "data-q": q,
        d: hex(st),
      });
      // Drawn here (not ctx.label) so labels on the dark ramp steps can carry data-dark.
      // "l": steps 7 and 8 are light text in light mode only; the top step is in both.
      const o = { "data-in": true, "data-dark": q >= 9 ? true : q >= 7 ? "l" : null };
      if (showC)
        labels += text(cx, cy - dy, st.code, { ...o, "font-size": r(fc), "font-weight": 600 });
      if (showV)
        labels += text(cx, cy + fc * 0.62, f.get(st)!, { ...o, "font-size": r(fv), opacity: 0.8 });
    }
    const legend =
      hi > lo
        ? `<div class="maya-legend" data-maya="ramp" data-hex><b>${esc(spec.titles.get(spec.y) ?? spec.y)}</b><span>${esc(ctx.fmt(spec.y, lo))}</span><i></i><span>${esc(ctx.fmt(spec.y, hi))}</span></div>`
        : "";
    return { marks, hits: "", labels, grid, legend };
  },
};

register("hexmap", hexmap);

export {};
