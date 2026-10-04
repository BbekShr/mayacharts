const L =
  ":host,.maya-root{--maya-font:ui-sans-serif,system-ui,sans-serif;--maya-font-size:12px;--maya-fg:light-dark(#1f2328,#e6edf3);--maya-fg-muted:light-dark(#656d76,#9198a1);--maya-grid:color-mix(in oklab,var(--maya-fg) 10%,transparent);--maya-bg:light-dark(#fff,#0d1117);--maya-accent:oklch(.6 .17 255);--maya-radius:3px;--maya-ease:cubic-bezier(.22,1,.36,1);--maya-tooltip-bg:color-mix(in oklab,var(--maya-bg) 92%,transparent);--maya-tooltip-fg:var(--maya-fg);--maya-focus:var(--maya-accent);--maya-good:light-dark(#1a7f37,#3fb950);--maya-bad:light-dark(#cf222e,#f85149);--maya-series-1:var(--maya-accent);--maya-series-2:oklch(.66 .16 50);--maya-series-3:oklch(.62 .15 160);--maya-series-4:oklch(.66 .17 330);--maya-series-5:oklch(.62 .14 90);--maya-series-6:oklch(.62 .12 205);--maya-series-7:oklch(.64 .19 22);--maya-series-8:oklch(.62 .16 295);color-scheme:light dark}";
const D = "--maya-fg:#1f2328;--maya-fg-muted:#656d76;--maya-bg:#fff";
const N = "--maya-fg:#e6edf3;--maya-fg-muted:#9198a1;--maya-bg:#0d1117";
const rng = (n: number, from = 0) => Array.from({ length: n }, (_, i) => i + from);
const S = rng(8)
  .map((n) => `[data-s="${n}"]{--c:var(--maya-series-${n + 1})}`)
  .join("");
// Area fill: the slot's baseline-fading gradient (render.ts defs), flat tint if the reference fails.
const A = rng(8)
  .map(
    (n) =>
      `svg:not([data-stack]) [data-maya=area][data-s="${n}"]{fill:url(#maya-a${n}) color-mix(in oklab,var(--c) 18%,transparent)}`,
  )
  .join("");
// Ramp: 10 steps, 20% floor (about 32% in dark mode, see --b). ponytail: only steps >= 8 reach 3:1; values are also text everywhere.
const Q = rng(10)
  .map((n) => `[data-q="${n}"]{--q:${Math.round(20 + (n * 80) / 9)}%}`)
  .join("");
// Legend hover: dim the other series' marks (slot match; :has needs no JS).
const H = rng(8)
  .map(
    (n) =>
      `.maya:has(.maya-legend [data-s="${n}"]:hover) :is([data-maya=mark],[data-maya=line],[data-maya=area]):not([data-s="${n}"]){opacity:.25}`,
  )
  .join("");
// Sliding indicator of .maya-ctl: data-n = options (2..4; ponytail: more options need more rules), data-i = checked index (set by the element).
const C =
  rng(3, 2)
    .map((n) => `.maya-ctl[data-n="${n}"]::before{width:calc((100% - 4px)/${n})}`)
    .join("") +
  rng(3, 1)
    .map((i) => `.maya-ctl[data-i="${i}"]::before{transform:translateX(${i * 100}%)}`)
    .join("");
const B =
  "border:0;background:none;padding:0;font:inherit;color:var(--maya-fg-muted);cursor:pointer";
export const css =
  L +
  `@supports not (color:light-dark(#000,#fff)){:host,.maya-root{${D}}@media (prefers-color-scheme:dark){:host,.maya-root{${N}}}}` +
  ":host{display:block;position:relative;container-type:inline-size;min-height:200px}" +
  ".maya{display:flex;flex-direction:column;height:100%;font:var(--maya-font-size) var(--maya-font);font-variant-numeric:tabular-nums;color:var(--maya-fg)}" +
  ".maya-title{font-weight:600;font-size:15px;letter-spacing:-.01em;margin:0 0 6px}" +
  ".maya-legend,.maya-crumbs{color:var(--maya-fg-muted);display:flex;flex-wrap:wrap;align-items:center;gap:2px 6px;margin:0 0 8px}" +
  ".maya-crumbs{min-height:1.25em;line-height:1.25}" +
  `.maya-legend :is(button,span),.maya-crumbs button,.maya-reset{display:inline-flex;align-items:center;gap:6px;${B};border-radius:6px;padding:2px 6px;transition:background .15s,opacity .2s,color .15s}` +
  ":is(.maya-legend,.maya-crumbs) button:hover{background:var(--maya-grid);color:var(--maya-fg)}" +
  ".maya-legend [aria-pressed=false]{opacity:.5}.maya-legend [aria-pressed=false] i{background:none;box-shadow:inset 0 0 0 1.5px var(--c)}" +
  ":is(.maya-legend,.maya-crumbs) button:focus-visible,.maya-reset:focus-visible,.maya-ctl :focus-visible{outline:2px solid var(--maya-focus);outline-offset:2px}" +
  "i{width:10px;height:10px;border-radius:3px;background:var(--c)}" +
  "[data-maya=ramp]{display:flex;align-items:center;gap:6px}" +
  "[data-maya=ramp] i{width:80px;height:8px;background:linear-gradient(90deg,color-mix(in oklab,var(--maya-accent) 20%,var(--b)),var(--maya-accent))}" +
  // Ramp floor: the background, lifted toward the accent in dark mode so low steps stay visible.
  "[data-q],[data-maya=ramp] i{--b:light-dark(var(--maya-bg),color-mix(in oklab,var(--maya-accent) 15%,var(--maya-bg)))}" +
  ".maya-reset{position:absolute;top:4px;right:4px;border:1px solid var(--maya-grid);border-radius:99px;padding:3px 12px;background:var(--maya-bg);box-shadow:0 1px 3px #0000001a}" +
  ".maya-ctl{position:relative;display:inline-grid;grid-auto-flow:column;grid-auto-columns:1fr;align-self:flex-start;margin:0 0 8px;padding:2px;border-radius:8px;background:var(--maya-grid)}" +
  ".maya-ctl::before{content:'';position:absolute;inset:2px auto 2px 2px;width:calc(100% - 4px);border-radius:6px;background:var(--maya-bg);box-shadow:0 1px 3px #00000024;transition:transform .3s var(--maya-ease)}" +
  C +
  `.maya-ctl [role=radio]{${B};position:relative;padding:4px 12px;border-radius:6px;transition:color .2s}` +
  ".maya-ctl [aria-checked=true]{color:var(--maya-fg);font-weight:600}" +
  ".maya-err{margin:0;padding:8px;color:var(--maya-bad);white-space:pre-wrap;font:12px monospace}" +
  ".maya-box{flex:1;min-height:0;position:relative}" +
  ".maya-box svg{display:block;width:100%;height:100%;overflow:visible}" +
  ".maya-svg{direction:ltr;font:var(--maya-font-size) var(--maya-font);font-variant-numeric:tabular-nums}" +
  ".maya-svg text{fill:var(--maya-fg-muted);unicode-bidi:plaintext}[data-maya^=axis] text{font-size:11px}" +
  "[data-maya=grid] *{stroke:var(--maya-grid);shape-rendering:crispEdges}" +
  S +
  "[data-other],[data-total]{--c:var(--maya-fg-muted)}" +
  "[data-tone=good]{--c:var(--maya-good)}[data-tone=bad]{--c:var(--maya-bad)}" +
  "[data-q]{--c:color-mix(in oklab,var(--maya-accent) var(--q),var(--b))}" +
  Q +
  "[data-maya=mark]{fill:var(--c,var(--maya-series-1));rx:var(--maya-radius);transform-box:fill-box;transform-origin:0 0}" +
  "[data-dir=h] [data-neg]{transform-origin:100% 0}" +
  "[data-maya=mark],[data-maya=link]{transition:opacity .25s var(--maya-ease),fill .2s}[data-ghost]{pointer-events:none}" +
  "[data-maya=mark][data-active]{fill:color-mix(in oklab,var(--c,var(--maya-series-1)),var(--maya-fg) 12%)}" +
  "[data-stack] rect[data-maya=mark]{stroke:var(--maya-bg);stroke-width:1}" +
  ":where([data-xd] circle[data-maya=mark]){stroke:var(--maya-bg);stroke-width:1}" +
  "[data-maya=line]~circle[data-maya=mark]:not([data-active],[data-lit],[data-selected],[data-last]){fill-opacity:0;stroke-opacity:0}" +
  "[data-maya=line]~circle[data-maya=mark]{stroke:var(--maya-bg);stroke-width:2;transition:fill-opacity .15s,stroke-opacity .15s}[data-maya=line]~circle[data-lit]{r:4px}" +
  "circle[data-maya=mark][data-active]{filter:drop-shadow(0 0 4px color-mix(in oklab,var(--c) 70%,transparent))}" +
  "[data-maya=line]{fill:none;stroke:var(--c);stroke-width:2.25;stroke-linejoin:round;stroke-linecap:round}" +
  "[data-maya=area]{fill:color-mix(in oklab,var(--c) 18%,transparent);stroke:none}[data-stack] [data-maya=area]{fill:color-mix(in oklab,var(--c) 45%,var(--maya-bg))}" +
  A +
  "stop{stop-color:var(--c)}" +
  "[data-maya=link]{fill:var(--c);opacity:.3}[data-maya=link][data-active]{opacity:.6}" +
  // Dumbbell connector, kpi parts, y2 legend swatch.
  "line[data-maya=link]{stroke:var(--c,var(--maya-fg-muted));opacity:1}" +
  "text[data-maya=mark]{fill:var(--maya-fg);font-weight:600}[data-kpi=track]{fill:var(--maya-grid)}[data-kpi=target]{stroke:var(--maya-fg)}" +
  "[data-maya=labels] [data-tone]{fill:var(--c)}[data-maya=labels] :is([data-kpi=period],[data-kpi=of]){fill:var(--maya-fg-muted)}" +
  "[data-line] i{height:2px;border-radius:1px}" +
  // 0.2 types: ridgeline fill, radial rings, table header and row text, parallel line focus.
  "[data-ridge]{fill:color-mix(in oklab,var(--c) 40%,var(--maya-bg))}[data-maya=grid] circle{fill:none;shape-rendering:auto}" +
  "[data-maya=labels] [data-ring]{fill:var(--maya-fg-muted)}[data-maya=marks] text{fill:var(--maya-fg)}" +
  "[data-maya=sort]{cursor:pointer}[data-maya=sort] rect{fill:transparent}[data-maya=sort] text{font-weight:600}[data-maya=sort]:focus-visible{outline:2px solid var(--maya-focus)}" +
  ":is([data-maya=line],[data-maya=area]){transition:opacity .25s}[data-maya=marks]:has(path[data-active]) path[data-maya=line]:not([data-active]){opacity:.25}" +
  "[data-depth]{stroke:var(--maya-bg);stroke-width:1}" +
  "[data-maya=marks]:has([data-active]) [data-maya=mark]:not([data-active],[data-lit],text){opacity:.4}" +
  "[data-maya=marks]:has([data-selected]) [data-maya=mark]:not([data-selected]){opacity:.35}" +
  "[data-selected]{stroke:var(--maya-fg);stroke-width:2}" +
  H +
  "[data-maya=labels],[data-maya=cross],[data-maya=band]{pointer-events:none}[data-maya=cross],[data-maya=band]{opacity:0;transition:opacity .2s}" +
  "[data-on]:is([data-maya=cross],[data-maya=band]){opacity:1;transition:opacity .2s,transform .25s var(--maya-ease)}[data-maya=band]{fill:var(--maya-fg);fill-opacity:.05;rx:6px}" +
  "[data-maya=labels] text{fill:var(--maya-fg);paint-order:stroke;stroke:var(--maya-bg);stroke-width:3;stroke-linejoin:round}[data-maya=labels] [data-in]{stroke:none}[data-maya=labels] [data-dark]{fill:var(--maya-bg)}[data-maya=hit]{stroke:none}" +
  "[data-maya=cross] line{stroke:var(--maya-fg-muted);stroke-opacity:.55}" +
  "[data-maya=brush]{fill:var(--maya-accent);fill-opacity:.12;stroke:var(--maya-accent);vector-effect:non-scaling-stroke;pointer-events:none}" +
  ".maya-svg:focus-visible{outline:2px solid var(--maya-focus)}" +
  ".maya-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}" +
  ".maya-probe{position:absolute;width:0;height:0;pointer-events:none;anchor-name:--maya-probe}" +
  ".maya-tip{margin:0;inset:auto;border:1px solid var(--maya-grid);padding:8px 10px;min-width:96px;background:var(--maya-tooltip-bg);color:var(--maya-tooltip-fg);border-radius:8px;box-shadow:0 1px 2px #0000000f,0 10px 28px -8px #0000004d;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);font:var(--maya-font-size)/1.4 var(--maya-font);font-variant-numeric:tabular-nums;pointer-events:none}" +
  "@supports (anchor-name:--x){.maya-tip{position-anchor:--maya-probe;position-area:block-start;position-try-fallbacks:flip-block,block-start span-inline-start,block-start span-inline-end;margin:8px}.maya-tip[data-side]{position-area:inline-end span-block-end;position-try-fallbacks:flip-inline;margin:0 12px}}" +
  ".maya-tip{opacity:0;translate:0 4px;transition:opacity .15s,translate .2s var(--maya-ease)}.maya-tip.maya-open{opacity:1;translate:none}" +
  ".maya-tip b{display:block;margin:0 0 4px;font-weight:600}" +
  ".maya-tip div{display:flex;align-items:center;gap:8px;color:color-mix(in oklab,var(--maya-tooltip-fg) 72%,transparent)}.maya-tip i{width:8px;height:8px;border-radius:50%}" +
  ".maya-tip [data-v]{margin-inline-start:auto;padding-inline-start:12px;font-weight:600;color:var(--maya-tooltip-fg)}.maya-tip [data-on]{color:var(--maya-tooltip-fg)}" +
  "@media (pointer:coarse){:is(.maya-legend,.maya-crumbs) button,.maya-ctl [role=radio],.maya-reset,.maya-crumbs{min-height:24px}}" +
  "@container (max-width:320px){.maya-legend:has(button){display:none}.maya-title{font-size:12px}}" +
  "@media (prefers-contrast:more){:host,.maya-root{--maya-fg-muted:var(--maya-fg);--maya-grid:color-mix(in oklab,var(--maya-fg) 40%,transparent)}}" +
  "@media (forced-colors:active){.maya-svg,i{forced-color-adjust:none}[data-maya=mark]{stroke:CanvasText;stroke-width:1}[data-tone=bad]{stroke-dasharray:4 2}}" +
  "[data-still] *{transition:none!important}@media (prefers-reduced-motion:reduce){*{transition:none!important}}";
