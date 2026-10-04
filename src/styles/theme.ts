const L =
  ":host,.maya-root{--maya-font:system-ui,sans-serif;--maya-font-size:12px;--maya-fg:light-dark(#1f2328,#e6edf3);--maya-fg-muted:light-dark(#656d76,#9198a1);--maya-grid:color-mix(in oklab,var(--maya-fg) 12%,transparent);--maya-bg:light-dark(#fff,#0d1117);--maya-accent:oklch(.6 .17 255);--maya-radius:2px;--maya-tooltip-bg:var(--maya-fg);--maya-tooltip-fg:var(--maya-bg);--maya-focus:var(--maya-accent);--maya-good:light-dark(#1a7f37,#3fb950);--maya-bad:light-dark(#cf222e,#f85149);--maya-series-1:var(--maya-accent);--maya-series-2:oklch(.66 .16 50);--maya-series-3:oklch(.62 .15 160);--maya-series-4:oklch(.66 .17 330);--maya-series-5:oklch(.62 .14 90);--maya-series-6:oklch(.62 .12 205);--maya-series-7:oklch(.64 .19 22);--maya-series-8:oklch(.62 .16 295);color-scheme:light dark}";
const D = "--maya-fg:#1f2328;--maya-fg-muted:#656d76;--maya-bg:#fff";
const N = "--maya-fg:#e6edf3;--maya-fg-muted:#9198a1;--maya-bg:#0d1117";
const rng = (n: number, from = 0) => Array.from({ length: n }, (_, i) => i + from);
const S = rng(8)
  .map((n) => `[data-s="${n}"]{--c:var(--maya-series-${n + 1})}`)
  .join("");
// Ramp: 10 steps, 20% floor. ponytail: only steps >= 8 reach 3:1; values are also text everywhere.
const Q = rng(10)
  .map((n) => `[data-q="${n}"]{--q:${Math.round(20 + (n * 80) / 9)}%}`)
  .join("");
// Legend hover: dim the other series' marks (slot match; :has needs no JS).
const H = rng(8)
  .map((n) => `.maya:has([data-s="${n}"]:hover) [data-maya=mark]:not([data-s="${n}"]){opacity:.3}`)
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
  ".maya-title{font-weight:600;font-size:14px}" +
  ".maya-legend,.maya-crumbs{color:var(--maya-fg-muted);display:flex;flex-wrap:wrap;align-items:center;gap:4px 12px;margin:0 0 8px}" +
  `.maya-legend button,.maya-crumbs button,.maya-reset{display:inline-flex;align-items:center;gap:6px;${B}}` +
  ".maya-legend [aria-pressed=false]{opacity:.4}" +
  ":is(.maya-legend,.maya-crumbs) button:focus-visible,.maya-reset:focus-visible,.maya-ctl :focus-visible{outline:2px solid var(--maya-focus)}" +
  "i{width:10px;height:10px;border-radius:3px;background:var(--c)}" +
  "[data-maya=ramp]{display:flex;align-items:center;gap:6px}" +
  "[data-maya=ramp] i{width:80px;height:8px;background:linear-gradient(90deg,color-mix(in oklab,var(--maya-accent) 20%,var(--maya-bg)),var(--maya-accent))}" +
  "[data-maya=tone] span{display:inline-flex;align-items:center;gap:6px}" +
  ".maya-reset{position:absolute;top:4px;right:4px;border:1px solid var(--maya-grid);border-radius:99px;padding:2px 10px;background:var(--maya-bg)}" +
  ".maya-ctl{position:relative;display:inline-grid;grid-auto-flow:column;grid-auto-columns:1fr;align-self:flex-start;margin:0 0 8px;padding:2px;border-radius:8px;background:var(--maya-grid)}" +
  ".maya-ctl::before{content:'';position:absolute;inset:2px auto 2px 2px;width:calc(100% - 4px);border-radius:6px;background:var(--maya-bg);transition:transform .2s}" +
  C +
  `.maya-ctl [role=radio]{position:relative;padding:4px 10px;border-radius:6px;${B}}` +
  ".maya-ctl [aria-checked=true]{color:var(--maya-fg);font-weight:600}" +
  ".maya-err{margin:0;padding:8px;color:var(--maya-bad);white-space:pre-wrap;font:12px monospace}" +
  ".maya-box{flex:1;min-height:0;position:relative}" +
  ".maya-box svg{display:block;width:100%;height:100%;overflow:visible}" +
  ".maya-svg{direction:ltr;font:var(--maya-font-size) var(--maya-font);font-variant-numeric:tabular-nums}" +
  ".maya-svg text{fill:var(--maya-fg-muted);unicode-bidi:plaintext}" +
  "[data-maya=grid] *{stroke:var(--maya-grid);shape-rendering:crispEdges}" +
  S +
  "[data-other]{--c:var(--maya-fg-muted)}" +
  "[data-tone=good]{--c:var(--maya-good)}[data-tone=bad]{--c:var(--maya-bad)}" +
  "[data-q]{--c:color-mix(in oklab,var(--maya-accent) var(--q),var(--maya-bg))}" +
  Q +
  "[data-maya=mark]{fill:var(--c,var(--maya-series-1));rx:var(--maya-radius);transform-box:fill-box;transform-origin:0 0}" +
  "[data-dir=h] [data-neg]{transform-origin:100% 0}" +
  "[data-maya=mark],[data-maya=link]{transition:opacity .2s}" +
  "[data-maya=mark][data-active]{fill:color-mix(in oklab,var(--c,var(--maya-series-1)),var(--maya-fg) 18%)}" +
  "[data-n] circle[data-maya=mark]:not([data-active],[data-selected]){fill-opacity:0}" +
  "[data-maya=line]{fill:none;stroke:var(--c);stroke-width:2;stroke-linejoin:round}" +
  "[data-maya=area]{fill:color-mix(in oklab,var(--c) 18%,transparent);stroke:none}" +
  "[data-maya=link]{opacity:.35}[data-maya=link][data-active]{opacity:.6}" +
  "[data-depth]{stroke:var(--maya-bg);stroke-width:1}" +
  "[data-maya=marks]:has([data-active]) [data-maya=mark]:not([data-active]){opacity:.55}" +
  "[data-maya=marks]:has([data-selected]) [data-maya=mark]:not([data-selected]){opacity:.35}" +
  "[data-selected]{stroke:var(--maya-fg);stroke-width:2}" +
  H +
  "[data-maya=labels],[data-maya=cross]{pointer-events:none}[data-maya=cross]{opacity:0}" +
  "[data-maya=labels] text{fill:var(--maya-fg);paint-order:stroke;stroke:var(--maya-bg);stroke-width:3}" +
  "[data-maya=cross] line{stroke:var(--maya-fg-muted);stroke-dasharray:3 3}" +
  "[data-maya=brush]{fill:var(--maya-accent);fill-opacity:.15;stroke:var(--maya-accent);pointer-events:none}" +
  ".maya-svg:focus-visible{outline:2px solid var(--maya-focus)}" +
  ".maya-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}" +
  ".maya-probe{position:absolute;width:0;height:0;pointer-events:none;anchor-name:--maya-probe}" +
  ".maya-tip{margin:0;inset:auto;border:0;padding:6px 8px;background:var(--maya-tooltip-bg);color:var(--maya-tooltip-fg);border-radius:6px;box-shadow:0 2px 8px #0003;font:var(--maya-font-size) var(--maya-font);pointer-events:none}" +
  "@supports (anchor-name:--x){.maya-tip{position-anchor:--maya-probe;position-area:block-start;position-try-fallbacks:flip-block,flip-inline;margin:8px}}" +
  ".maya-tip{opacity:0;transition:opacity .12s}.maya-tip.maya-open{opacity:1}" +
  ".maya-tip b{display:block}" +
  ".maya-tip div{display:flex;align-items:center;gap:6px}" +
  ".maya-tip [data-on]{font-weight:600}" +
  "@container (max-width:320px){.maya-legend{display:none}.maya-title{font-size:12px}}" +
  "@media (prefers-contrast:more){:host,.maya-root{--maya-fg-muted:var(--maya-fg);--maya-grid:color-mix(in oklab,var(--maya-fg) 40%,transparent)}}" +
  "@media (forced-colors:active){.maya-svg,i{forced-color-adjust:none}[data-maya=mark]{stroke:CanvasText;stroke-width:1}[data-tone=bad]{stroke-dasharray:4 2}}" +
  "@media (prefers-reduced-motion:reduce){*{transition:none!important}}";
