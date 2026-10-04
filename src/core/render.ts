/*
 * mayaCharts core — design note (the contract every module and the element layer follow)
 * =====================================================================================
 *
 * Pipeline: validateSpec -> resolve -> shape -> niceTicks -> format -> layout -> scales
 *           -> marks -> assemble. Pure, synchronous, deterministic (same input, same
 *           bytes). `src/core/**` never imports `src/element/**` and never touches
 *           window/document (a test deletes globalThis.window and imports it).
 *
 * Outputs
 *   render(spec, opts)      standalone `<svg class="maya-root">` with an embedded <style>.
 *                           Works as a file, in <img>, or rasterized by the hosted API.
 *   renderShell(spec, opts) `<maya-chart>` with Declarative Shadow DOM + JSON spec child.
 *                           Full fidelity (HTML title, HTML legend, data table). Works
 *                           with JS disabled; the element adopts it when JS loads.
 *   renderParts(spec, opts) the pieces (svg without <style>, legend, table, title,
 *                           override style) that the shell and the element assemble.
 *
 * Shadow content (identical from renderShell and the element, built by `shellInner`):
 *   <style>CSS</style>
 *   <div class="maya" style="OVERRIDES">
 *     TITLE  LEGEND
 *     <div class="maya-box">SVG</div>
 *     TABLE
 *     <div class="maya-probe" data-maya="probe"></div>
 *     <div class="maya-tip" popover="manual" role="tooltip"></div>
 *   </div>
 *
 * SVG structure (render/renderParts):
 *   <svg class="maya-svg" viewBox="0 0 W H" width="W" height="H" role="img"
 *        aria-labelledby="maya-t" aria-describedby="maya-d" [tabindex="0" in parts only]>
 *     <title id="maya-t">  <desc id="maya-d">
 *     <g data-maya="grid">     horizontal lines at y ticks
 *     <g data-maya="axis-y">   tick labels (text-anchor end), optional yLabel
 *     <g data-maya="axis-x">   category labels, every `layout.xLabelEvery`th, optional xLabel
 *     <g data-maya="marks">    one <rect> per visible cell
 *     <g data-maya="hits">     invisible enlarged targets (see below)
 *   Empty data: grid/axes omitted, `<text data-maya="empty">No data</text>` centered.
 *
 * Hydration contract — the ONLY selectors the element layer may rely on:
 *   [data-maya="mark"]  attrs: data-key, data-c (category index), data-s (palette slot
 *                       = series index % 8), data-x (category label), data-series
 *                       (series key, "" when none), data-f (formatted value).
 *                       data-neg present when value < 0.
 *   [data-maya="hit"]   same payload as its mark (incl. data-key). Emitted only when the
 *                       mark is narrower or shorter than 24px: the mark's rect grown to
 *                       >= 24px in that dimension, centered. fill="transparent".
 *   [data-maya="probe"] / .maya-tip  tooltip anchor probe + popover (shell only).
 *   [data-maya="legend"] buttons: <button type="button" data-si="i" data-s="i%8"
 *                       aria-pressed="true|false"><i></i>KEY</button>
 *   The tooltip reads its content from these attributes; the element never sees rows.
 *   Tooltip shows every visible series at the hovered category (marks sharing data-c,
 *   DOM order) with the hovered one emphasized.
 *
 * data-key = encodeURIComponent(seriesKey) + "~" + encodeURIComponent(category).
 *   Identity-based, XML-safe. The element diffs marks by data-key only, never by index.
 *
 * Colors: never inline. CSS rules `[data-s="0"]..[data-s="7"]` map to --maya-series-1..8;
 *   --maya-series-1 defaults to var(--maya-accent) so single-series charts use the
 *   accent. spec.colors / spec.theme become custom-property declarations in
 *   `Parts.style` (inline style on .maya, or on the <svg> for standalone render).
 *   Every override value is validated against CSS injection in validate.ts.
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
import { barMarks } from "./marks/bar.ts";
import { bandScale, linearScale } from "./scale.ts";
import { shape } from "./shape.ts";
import { niceTicks } from "./ticks.ts";
import { css } from "../styles/theme.ts";
import { el, esc, r } from "./svg.ts";
import { resolve, validateOptions, validateSpec } from "./validate.ts";
import type { ChartSpec, Parts, RenderOptions } from "./types.ts";

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());

function build(spec: ChartSpec, opts: RenderOptions | undefined, sheet: string | null): Parts {
  validateSpec(spec);
  if (opts !== undefined) validateOptions(opts);
  if (spec.type !== "bar")
    throw new Error(`mayacharts: "${spec.type}" charts are not implemented yet`);
  const s = resolve(spec);
  const W = opts?.width ?? 640;
  const H = opts?.height ?? 320;
  const shaped = shape(s, opts?.hidden);
  const empty = s.data.length === 0;
  const [lo, hi] = s.yDomain ?? shaped.extent;
  const t = niceTicks(lo, hi);
  const domain = s.yDomain ?? t.domain;
  const values = s.yDomain ? t.values.filter((v) => v >= lo && v <= hi) : t.values;
  const fmt = formatter(s, t.step);
  const yLabels = values.map(fmt);
  const lay = layout(s, shaped, yLabels, { width: W, height: H });
  const { plot } = lay;
  const x = bandScale(shaped.categories, [plot.x, plot.x + plot.w]);
  const y = linearScale(domain, [plot.y + plot.h, plot.y]);

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
      "No data",
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
    if (s.yLabel) {
      const cy = r(plot.y + plot.h / 2);
      ay += el(
        "text",
        { x: 9, y: cy, "text-anchor": "middle", transform: `rotate(-90 9 ${cy})` },
        esc(s.yLabel),
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
    if (s.xLabel)
      ax += el(
        "text",
        { x: r(plot.x + plot.w / 2), y: H - 4, "text-anchor": "middle" },
        esc(s.xLabel),
      );
    body += g("axis-x", ax);
    const m = barMarks({ spec: s, shaped, layout: lay, x, y, fmt });
    body += g("marks", m.marks) + g("hits", m.hits);
  }

  const vars: string[] = [];
  s.colors?.slice(0, 8).forEach((c, i) => vars.push(`--maya-series-${i + 1}:${c};`));
  for (const k in s.theme) vars.push(`--maya-${kebab(k)}:${s.theme[k as keyof typeof s.theme]};`);
  const style = vars.join("");

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
    table: s.table ? dataTable(s, shaped, fmt) : "",
    title: s.title === null ? "" : `<div class="maya-title">${esc(s.title)}</div>`,
    style,
  };
}

export function renderParts(spec: ChartSpec, opts?: RenderOptions): Parts {
  return build(spec, opts, null);
}

/** Standalone SVG string with an embedded stylesheet. */
export function render(spec: ChartSpec, opts?: RenderOptions): string {
  return build(spec, opts, css).svg;
}

/** Inner shadow-root markup, shared by renderShell and the element. */
export function shellInner(parts: Parts, css: string): string {
  const st = parts.style ? ` style="${esc(parts.style)}"` : "";
  return (
    `<style>${css}</style><div class="maya"${st}>${parts.title}${parts.legend}<div class="maya-box">${parts.svg}</div>${parts.table}` +
    `<div class="maya-probe" data-maya="probe"></div><div class="maya-tip" popover="manual" role="tooltip"></div></div>`
  );
}

/** `<maya-chart>` with Declarative Shadow DOM. JSON child escapes `<` as <. */
export function renderShell(spec: ChartSpec, opts?: RenderOptions): string {
  const json = JSON.stringify(spec).replace(/</g, "\\u003c");
  return `<maya-chart><template shadowrootmode="open">${shellInner(renderParts(spec, opts), css)}</template><script type="application/json">${json}</script></maya-chart>`;
}
