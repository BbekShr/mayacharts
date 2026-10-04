const L =
  ":host,.maya-root{--maya-font:system-ui,sans-serif;--maya-font-size:12px;--maya-fg:light-dark(#1f2328,#e6edf3);--maya-fg-muted:light-dark(#656d76,#9198a1);--maya-grid:color-mix(in oklab,var(--maya-fg) 12%,transparent);--maya-bg:light-dark(#fff,#0d1117);--maya-accent:oklch(.6 .17 255);--maya-radius:2px;--maya-tooltip-bg:var(--maya-fg);--maya-tooltip-fg:var(--maya-bg);--maya-focus:var(--maya-accent);--maya-series-1:var(--maya-accent);--maya-series-2:oklch(.68 .16 50);--maya-series-3:oklch(.68 .15 160);--maya-series-4:oklch(.66 .17 330);--maya-series-5:oklch(.74 .15 90);--maya-series-6:oklch(.68 .12 205);--maya-series-7:oklch(.64 .19 22);--maya-series-8:oklch(.62 .16 295);color-scheme:light dark}";
const D = "--maya-fg:#1f2328;--maya-fg-muted:#656d76;--maya-bg:#fff";
const N = "--maya-fg:#e6edf3;--maya-fg-muted:#9198a1;--maya-bg:#0d1117";
const S = [0, 1, 2, 3, 4, 5, 6, 7]
  .map((n) => `[data-s="${n}"]{--c:var(--maya-series-${n + 1})}`)
  .join("");
export const css =
  L +
  `@supports not (color:light-dark(#000,#fff)){:host,.maya-root{${D}}@media (prefers-color-scheme:dark){:host,.maya-root{${N}}}}` +
  ":host{display:block;position:relative;container-type:inline-size;min-height:200px}" +
  ".maya{display:flex;flex-direction:column;height:100%;font:var(--maya-font-size) var(--maya-font);color:var(--maya-fg)}" +
  ".maya-title{font-weight:600;font-size:14px}" +
  ".maya-legend{display:flex;flex-wrap:wrap;gap:4px 12px;margin:0 0 8px}" +
  ".maya-legend button{display:inline-flex;align-items:center;gap:6px;border:0;background:none;padding:0;font:inherit;color:var(--maya-fg-muted);cursor:pointer}" +
  ".maya-legend [aria-pressed=false]{opacity:.4}" +
  ".maya-legend button:focus-visible{outline:2px solid var(--maya-focus)}" +
  "i{width:10px;height:10px;border-radius:3px;background:var(--c)}" +
  ".maya-box{flex:1;min-height:0;position:relative}" +
  ".maya-box svg{display:block;width:100%;height:100%;overflow:visible}" +
  ".maya-svg{font:var(--maya-font-size) var(--maya-font)}" +
  ".maya-svg text{fill:var(--maya-fg-muted)}" +
  "[data-maya=grid] *{stroke:var(--maya-grid);shape-rendering:crispEdges}" +
  S +
  "[data-maya=mark]{fill:var(--c,var(--maya-series-1));rx:var(--maya-radius);transform-box:fill-box;transform-origin:0 0}" +
  "[data-maya=mark][data-active]{fill:color-mix(in oklab,var(--c,var(--maya-series-1)),var(--maya-fg) 18%)}" +
  "[data-maya=hit]{fill:transparent}" +
  ".maya-svg:focus-visible{outline:2px solid var(--maya-focus)}" +
  "[data-maya=empty]{text-anchor:middle;dominant-baseline:middle;fill:var(--maya-fg-muted)}" +
  ".maya-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}" +
  ".maya-probe{position:absolute;width:0;height:0;pointer-events:none;anchor-name:--maya-probe}" +
  ".maya-tip{margin:0;inset:auto;border:0;padding:6px 8px;background:var(--maya-tooltip-bg);color:var(--maya-tooltip-fg);border-radius:6px;box-shadow:0 2px 8px #0003;font:var(--maya-font-size) var(--maya-font);pointer-events:none}" +
  "@supports (anchor-name:--x){.maya-tip{position-anchor:--maya-probe;position-area:block-start;position-try-fallbacks:flip-block,flip-inline;margin:8px}}" +
  ".maya-tip b{display:block}" +
  ".maya-tip div{display:flex;align-items:center;gap:6px}" +
  ".maya-tip [data-on]{font-weight:600}" +
  "@container (max-width:320px){.maya-legend{display:none}.maya-title{font-size:12px}}";
