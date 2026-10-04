/*
 * Public signatures take `ChartSpec<R> | ChartSpec`: R is inferred from `data` so typed rows
 * get field autocomplete, while spreading a Row-typed spec with new rows still compiles.
 *
 * mayaCharts core — design note (the contract every module and the element layer follow)
 * =====================================================================================
 *
 * Pipeline: validateSpec -> resolve(spec, view) -> shape -> niceTicks -> format -> layout
 *           -> scales -> Mark.draw(ctx) -> assemble. Pure, synchronous, deterministic (same
 *           input, same bytes). `src/core/**` never imports `src/element/**` and never
 *           touches window/document (a test deletes globalThis.window and imports it).
 *
 * State: interaction state is not in the spec. RenderOptions.view = { measure, drill, window,
 *   hidden } and RenderOptions.selected = Sel[] (raw values). resolve() applies measure
 *   (active y, measures[] kept for the control) and drill (filter rows, advance x/path).
 *   shape() applies, in order: aggregate -> sort -> limit -> window -> hidden. SSR can
 *   therefore render any state.
 *
 * Marks: `CORE[type] ?? MODULES.get(type)`. CORE is the static map below; modules
 *   (hierarchy, flow, geo) call registry.register() on import. A Mark is
 *   { noun, axes?(spec, shaped): [bottom, left], check?(spec, fail), draw(ctx) }.
 *   MarkCtx closures: fmt(field, v, step?), label(x, y, text, place), tone(v), agg(kind),
 *   fail(code, path, headline, ...details), t(key, ...args); plus spec, shaped, width,
 *   height, plot, x (bottom-axis scale), y (left-axis scale). Modules import only
 *   registry.ts, svg.ts, scale.ts, ticks.ts and types.
 *
 * Outputs
 *   render(spec, opts)      standalone `<svg class="maya-root">` with an embedded <style>.
 *                           Works as a file, in <img>, or rasterized by the hosted API.
 *   renderShell(spec, opts) `<maya-chart>` with Declarative Shadow DOM + JSON spec child.
 *                           The JSON child is the spec with rows projected to referenced
 *                           fields only (x y series size name path colorBy, format and
 *                           titles keys). `opts.nonce` lands on the shell's <style>.
 *   renderParts(spec, opts) the pieces (svg without <style>, legend, controls, crumbs, table,
 *                           title, override style + vars, warnings).
 *
 * Shadow content (identical from renderShell and the element, built by `shellInner`).
 * Slot order is fixed:
 *   <style>CSS</style>
 *   <div class="maya" style="OVERRIDES">
 *     TITLE  CONTROLS  LEGEND  CRUMBS
 *     <div class="maya-box">SVG</div>
 *     TABLE
 *     <div class="maya-sr" data-maya="live" aria-live="polite"></div>  static, never replaced
 *     <div class="maya-probe" data-maya="probe"></div>
 *     <div class="maya-tip" popover="manual" role="tooltip"></div>
 *   </div>
 *
 * SVG structure (render/renderParts):
 *   <svg class="maya-svg" viewBox="0 0 W H" width="W" height="H" role="img"
 *        aria-labelledby="maya-t" aria-describedby="maya-d" [tabindex="0" in parts only]
 *        data-plot="x y w h" data-n="categories" [data-xd="lo hi" data-yd="lo hi" for
 *        linear-x types instead of data-n] [data-dir="h" when horizontal]>
 *     <title id="maya-t">  <desc id="maya-d">
 *     <g data-maya="grid">     lines perpendicular to the value axis
 *     <g data-maya="axis-y">   tick labels (text-anchor end), axis title when titles has it
 *     <g data-maya="axis-x">   category labels, every `layout.xLabelEvery`th, axis title
 *     <g data-maya="marks">    only [data-key] children, one tag per key
 *     <g data-maya="labels">   value labels (text), from ctx.label
 *     <g data-maya="cross">    crosshair (line/area), moved via CSSOM transform
 *     <g data-maya="hits">     invisible enlarged targets (see below)
 *   Empty data: grid/axes/groups omitted, `<text data-maya="empty">` (text.noData) centered.
 *   Marks group attributes are synced on patch.
 *
 * Hydration contract — the ONLY selectors the element layer may rely on:
 *   [data-maya="mark"]  attrs: data-key, data-c (category index; unique per mark for non-band
 *                       types), data-s (palette slot = series index % 8), data-x (formatted
 *                       category), data-y (raw value), data-series (series key, "" when
 *                       none), data-f (formatted value). data-neg when value < 0.
 *                       Optional: data-tone="good|bad", data-q (ramp step), data-other
 *                       (limit roll-up), data-depth, data-selected.
 *                       Line: point circles are marks (hidden until active) plus one
 *                       keyless full-height band hit per category.
 *   [data-maya="hit"]   same payload as its mark (incl. data-key). Emitted only when the
 *                       mark is narrower or shorter than 24px: the mark's rect grown to
 *                       >= 24px in that dimension, centered. fill="transparent".
 *   [data-maya="probe"] / .maya-tip  tooltip anchor probe + popover (shell only).
 *   [data-maya="live"]  the static polite live region; written via textContent only.
 *   [data-maya="legend"] buttons: <button type="button" data-si="i" data-s="i%8"
 *                       data-key="KEY" aria-pressed="true|false"><i></i>KEY</button>
 *                       Ramp/tone legends are non-button <div data-maya="ramp|tone">.
 *   The tooltip reads its content from these attributes; the element never sees rows.
 *
 * Key grammar (svg.ts key(...parts)): each part encodeURIComponent'ed with `~` -> %7E,
 *   joined by `~`. Band `S~C`; line/area `l~S`/`a~S`; scatter `S~name(#n)` or index;
 *   hierarchy `h~p0~p1…`; sankey node `n~depth~name`, link `k~depth~src~dst`; hexmap
 *   `g~CODE`; limit roll-up category is the sentinel OTHER ("\u0000other").
 *   The element diffs marks by data-key (and tagName), never by index.
 *
 * CSS hooks theme.ts styles (interaction modules never touch theme.ts):
 *   .maya-ctl [role=radio][aria-checked]  .maya-crumbs  .maya-reset  .maya-err
 *   [data-maya=brush]  [data-maya=cross]  [data-maya=link]  [data-depth]  [data-selected]
 *   [data-tone]  [data-q]  [data-other]  [data-dir=h]
 *
 * Keyboard (one keydown dispatcher in maya-chart.ts; handlers return "handled"):
 *   Escape priority: pinned tooltip -> brush in progress -> selection -> zoom window -> drill
 *   pop. Enter activates drill, else select, on the tooltip's active mark; Space pins.
 *
 * Colors: never inline. CSS rules `[data-s="0"]..[data-s="7"]` map to --maya-series-1..8;
 *   --maya-series-1 defaults to var(--maya-accent) so single-series charts use the
 *   accent. spec.colors / spec.theme become custom properties in `Parts.vars` (applied
 *   with style.setProperty by the element) and `Parts.style` (style attribute in render()
 *   and renderShell() output only). Every value passes the CSS allowlist in validate.ts.
 *
 * Animation contract (element/animate.ts): marks get
 *   `transform-box: fill-box; transform-origin: 0 0` from CSS. The element commits new
 *   geometry attributes immediately and animates ONLY transform/opacity:
 *     update: from translate(oldX-newX, oldY-newY) scale(oldW/newW, oldH/newH) to none
 *     enter:  positive bar from translate(0, h) scale(1, 0); negative from scale(1, 0);
 *             plus opacity 0 -> 1
 *     exit:   reverse of enter, then remove on finish
 *   Guard zero sizes (use 1e-6). Skip entirely under prefers-reduced-motion or
 *   spec.animate === false.
 *
 * Layout: no text measurement exists in Node, so label widths are estimated as
 *   chars * 0.6 * 12 + 8 (font-size constant 12). x labels are never rotated; every nth
 *   label is drawn where n = ceil(maxLabelWidth / band.step). Coordinates are rounded
 *   to 2 decimals (`r()` in svg.ts).
 *
 * Legend and title are HTML, not SVG (free wrapping and font metrics). render() — the
 * bare SVG — therefore has no legend; renderShell() is the full-fidelity output.
 */
import { dataTable, describe, titleText } from "./a11y.ts";
import { formatter } from "./format.ts";
import { layout } from "./layout.ts";
import { bar } from "./marks/bar.ts";
import { heatmap } from "./marks/heatmap.ts";
import { area, line } from "./marks/line.ts";
import { scatter } from "./marks/scatter.ts";
import { MODULES } from "./registry.ts";
import { bandScale, linearScale } from "./scale.ts";
import { shape } from "./shape.ts";
import { t } from "./strings.ts";
import { niceTicks } from "./ticks.ts";
import { css } from "../styles/theme.ts";
import { el, esc, r } from "./svg.ts";
import { fail, resolve, validateOptions, validateSpec } from "./validate.ts";
import type { ChartSpec, Mark, MarkCtx, Parts, RenderOptions, Row } from "./types.ts";

const CORE: Readonly<Record<string, Mark>> = {
  bar,
  waterfall: bar,
  line,
  area,
  scatter,
  heatmap,
};

const kebab = (s: string) => s.replace(/[A-Z]|\d+/g, (c) => "-" + c.toLowerCase());

function build(spec: ChartSpec, opts: RenderOptions | undefined, sheet: string | null): Parts {
  validateSpec(spec);
  if (opts !== undefined) validateOptions(opts);
  // validateSpec guarantees the type is core or registered.
  const mark = (Object.hasOwn(CORE, spec.type) ? CORE[spec.type] : MODULES.get(spec.type))!;
  const s = resolve(spec, opts?.view);
  const W = opts?.width ?? 640;
  const H = opts?.height ?? 320;
  const shaped = shape(s, opts?.view?.hidden);
  const empty = s.data.length === 0;
  const [lo, hi] = s.yDomain ?? shaped.extent;
  const tk = niceTicks(lo, hi);
  const domain = s.yDomain ?? tk.domain;
  const values = s.yDomain ? tk.values.filter((v) => v >= lo && v <= hi) : tk.values;
  const fmt = formatter(s, tk.step);
  const yLabels = values.map(fmt);
  const lay = layout(s, shaped, yLabels, { width: W, height: H });
  const { plot } = lay;
  const x = bandScale(shaped.categories, [plot.x, plot.x + plot.w]);
  const y = linearScale(domain, [plot.y + plot.h, plot.y]);
  const yTitle = s.titles.get(s.y);
  const xTitle = s.titles.get(s.x);

  let body = "";
  if (empty) {
    body = el(
      "text",
      {
        "data-maya": "empty",
        x: W / 2,
        y: H / 2,
        "text-anchor": "middle",
        "dominant-baseline": "middle",
      },
      esc(t(s, "noData")),
    );
  } else {
    const g = (name: string, c: string) => el("g", { "data-maya": name }, c);
    const x2 = r(plot.x + plot.w);
    body += g(
      "grid",
      s.grid
        ? values
            .map((v) => el("line", { x1: r(plot.x), x2, y1: r(y.of(v)), y2: r(y.of(v)) }))
            .join("")
        : "",
    );
    let ay = "";
    if (s.yAxis)
      values.forEach((v, i) => {
        ay += el(
          "text",
          { x: r(plot.x - 6), y: r(y.of(v)), "text-anchor": "end", "dominant-baseline": "middle" },
          esc(yLabels[i]!),
        );
      });
    if (yTitle) {
      const cy = r(plot.y + plot.h / 2);
      ay += el(
        "text",
        { x: 9, y: cy, "text-anchor": "middle", transform: `rotate(-90 9 ${cy})` },
        esc(yTitle),
      );
    }
    body += g("axis-y", ay);
    let ax = "";
    if (s.xAxis)
      shaped.categories.forEach((c, i) => {
        if (i % lay.xLabelEvery === 0)
          ax += el(
            "text",
            {
              x: r(x.at(i) + x.bandwidth / 2),
              y: r(plot.y + plot.h + 16),
              "text-anchor": "middle",
            },
            esc(c),
          );
      });
    if (xTitle)
      ax += el(
        "text",
        { x: r(plot.x + plot.w / 2), y: H - 4, "text-anchor": "middle" },
        esc(xTitle),
      );
    body += g("axis-x", ax);
    // T1a: frame() from mark.axes(), real label()/tone(), agg() from shape.ts.
    const ctx: MarkCtx = {
      spec: s,
      shaped,
      width: W,
      height: H,
      plot,
      x,
      y,
      fmt: (_field, v, step) =>
        typeof v === "number"
          ? (step === undefined ? fmt : formatter(s, step))(v)
          : String(v ?? ""),
      label: () => false,
      tone: () => null,
      agg: () => {
        throw new Error("mayacharts: agg not implemented");
      },
      fail,
      t: (k, ...a) => t(s, k, ...a),
    };
    const m = mark.draw(ctx);
    body +=
      g("marks", m.marks) +
      g("labels", m.labels ?? "") +
      g("cross", m.cross ?? "") +
      g("hits", m.hits);
  }

  const vars: [string, string][] = [];
  // T1a: object-form colors map to stable slots by series key.
  if (Array.isArray(s.colors))
    (s.colors as readonly string[]).forEach((c, i) => vars.push([`--maya-series-${i + 1}`, c]));
  for (const k in s.theme) vars.push([`--maya-${kebab(k)}`, s.theme[k as keyof typeof s.theme]!]);
  const style = vars.map(([k, v]) => `${k}:${v};`).join("");

  const svg = el(
    "svg",
    {
      class: sheet === null ? "maya-svg" : "maya-root maya-svg",
      viewBox: `0 0 ${W} ${H}`,
      width: W,
      height: H,
      role: "img",
      // Standalone SVGs may share a page, so they can't use fixed ids; shadow roots scope them.
      "aria-label": sheet === null ? null : titleText(s),
      "aria-labelledby": sheet === null ? "maya-t" : null,
      "aria-describedby": sheet === null ? "maya-d" : null,
      tabindex: sheet === null ? "0" : null,
      style: sheet === null ? null : style || null,
      "data-plot": `${r(plot.x)} ${r(plot.y)} ${r(plot.w)} ${r(plot.h)}`,
      "data-n": shaped.categories.length,
      "data-dir": s.horizontal ? "h" : null,
    },
    (sheet ? `<style>${sheet}</style>` : "") +
      el("title", { id: sheet === null ? "maya-t" : null }, esc(titleText(s))) +
      el("desc", { id: sheet === null ? "maya-d" : null }, esc(describe(s, shaped, fmt))) +
      body,
  );

  const legend =
    s.legend && s.series !== null
      ? `<div class="maya-legend" data-maya="legend">` +
        shaped.series
          .map((k, i) =>
            el(
              "button",
              {
                type: "button",
                "data-si": i,
                "data-s": i % 8,
                "aria-pressed": String(shaped.visible.includes(i)),
              },
              `<i></i>${esc(k)}`,
            ),
          )
          .join("") +
        `</div>`
      : "";
  return {
    svg,
    legend,
    controls: "",
    crumbs: "",
    table: s.table ? dataTable(s, shaped, fmt) : "",
    title: s.title === null ? "" : `<div class="maya-title">${esc(s.title)}</div>`,
    style,
    vars,
    warnings: [],
  };
}

export function renderParts<R extends object = Row>(
  spec: ChartSpec<R> | ChartSpec,
  opts?: RenderOptions,
): Parts {
  return build(spec as unknown as ChartSpec, opts, null);
}

/** Standalone SVG string with an embedded stylesheet. */
export function render<R extends object = Row>(
  spec: ChartSpec<R> | ChartSpec,
  opts?: RenderOptions,
): string {
  return build(spec as unknown as ChartSpec, opts, css).svg;
}

/** Inner shadow-root markup, shared by renderShell and the element. Fixed slot order. */
export function shellInner(parts: Parts, css: string, nonce?: string): string {
  const st = parts.style ? ` style="${esc(parts.style)}"` : "";
  const n = nonce ? ` nonce="${esc(nonce)}"` : "";
  return (
    `<style${n}>${css}</style><div class="maya"${st}>${parts.title}${parts.controls}${parts.legend}${parts.crumbs}` +
    `<div class="maya-box">${parts.svg}</div>${parts.table}` +
    `<div class="maya-sr" data-maya="live" aria-live="polite"></div>` +
    `<div class="maya-probe" data-maya="probe"></div><div class="maya-tip" popover="manual" role="tooltip"></div></div>`
  );
}

/** Rows cut to the fields the spec references (no data leakage into SSR HTML). */
function project(spec: ChartSpec): ChartSpec {
  const keep = (o: object | string | undefined) => (typeof o === "object" ? Object.keys(o) : []);
  const fields = new Set<unknown>([
    spec.x,
    ...(typeof spec.y === "string" ? [spec.y] : spec.y),
    spec.series,
    spec.size,
    spec.name,
    ...(spec.path ?? []),
    typeof spec.colorBy === "string" ? spec.colorBy : undefined,
    ...keep(spec.format),
    ...keep(spec.titles),
  ]);
  return {
    ...spec,
    data: spec.data.map((row) =>
      Object.fromEntries(Object.entries(row).filter(([k]) => fields.has(k))),
    ),
  };
}

/** `<maya-chart>` with Declarative Shadow DOM. JSON child escapes `<` as <. */
export function renderShell<R extends object = Row>(
  spec: ChartSpec<R> | ChartSpec,
  opts?: RenderOptions,
): string {
  const p = renderParts(spec, opts);
  const json = JSON.stringify(project(spec as unknown as ChartSpec)).replace(/</g, "\\u003c");
  return `<maya-chart><template shadowrootmode="open">${shellInner(p, css, opts?.nonce)}</template><script type="application/json">${json}</script></maya-chart>`;
}
