const L =
  ":host,.maya-root{--maya-font:system-ui,sans-serif;--maya-font-size:12px;--maya-fg:light-dark(#1f2328,#e6edf3);--maya-fg-muted:light-dark(#656d76,#9198a1);--maya-grid:color-mix(in oklab,var(--maya-fg) 10%,transparent);--maya-bg:light-dark(#fff,#0d1117);--maya-accent:oklch(.6 .17 255);--maya-radius:3px;--maya-ease:cubic-bezier(.22,1,.36,1);--maya-tooltip-bg:color-mix(in oklab,var(--maya-bg) 92%,transparent);--maya-tooltip-fg:var(--maya-fg);--maya-focus:var(--maya-accent);--maya-good:light-dark(#0b7a75,#4fb3a9);--maya-bad:light-dark(#b5471b,#f08a5d);--maya-series-1:var(--maya-accent);--maya-series-2:oklch(.66 .16 50);--maya-series-3:oklch(.62 .15 160);--maya-series-4:oklch(.66 .17 330);--maya-series-5:oklch(.62 .14 90);--maya-series-6:oklch(.62 .12 205);--maya-series-7:oklch(.64 .19 22);--maya-series-8:oklch(.62 .16 295)}";
const D = "--maya-fg:#1f2328;--maya-fg-muted:#656d76;--maya-bg:#fff";
const N = "--maya-fg:#e6edf3;--maya-fg-muted:#9198a1;--maya-bg:#0d1117";
const rng = (n: number, from = 0) => Array.from({ length: n }, (_, i) => i + from);
// Legend hover: dim the other series' marks. Speed: a `:has()` on an ancestor of a mark is
// checked once per mark, and `:has(:hover)` on .maya restyled the whole chart on every pointer
// move (13 ms at 10000 marks; WebKit does not invalidate it through a sibling combinator, so no
// :has on the legend either). The element sets inherited custom properties on .maya instead
// (--d legend hover, --h<slot> the hovered slot; --o selection on the marks group) and each
// mark reads them in one declaration.
const S = rng(8)
  .map((n) => `[data-s="${n}"]{--c:var(--maya-series-${n + 1});--h:var(--h${n})}`)
  .join("");
// Area fill: the slot's baseline-fading gradient (render.ts defs), flat tint if the reference fails.
const A = rng(8)
  .map(
    (n) =>
      `svg:not([data-stack]) [data-maya=area][data-s="${n}"]{fill:url(#maya-a${n}) color-mix(in oklab,var(--c) 18%,transparent)}`,
  )
  .join("");
// Ramp: 10 steps (--q for the density rules, --u the position 0..1 along low, mid, high), 20% floor (about 32% in dark mode, see --b). ponytail: only steps >= 8 reach 3:1 as fill (3:1 needs about 80% accent, no range left), so heatmap cells and hexes carry an accent outline (3.9:1 light, 4.8:1 dark), which is the 1.4.11 mark.
const Q = rng(10)
  .map((n) => `[data-q="${n}"]{--q:${Math.round(35 + (n * 65) / 9)}%;--u:${+(n / 9).toFixed(4)}}`)
  .join("");
// Sliding indicator of .maya-ctl: data-n = options (2..4; ponytail: more options need more rules), data-i = checked index (set by the element).
const C =
  rng(3, 2)
    .map((n) => `.maya-ctl[data-n="${n}"]::before{width:calc((100% - 4px)/${n})}`)
    .join("") +
  rng(3, 1)
    .map((i) => `.maya-ctl[data-i="${i}"]::before{transform:translateX(${i * 100}%)}`)
    .join("");
const R = ".maya[data-legend=right]";
// Range slider (param and frame): one selector, one track, one thumb.
const SL = ":is(.maya-param input,input.maya-frame)";
const TR =
  "{height:4px;border-radius:2px;background:color-mix(in oklab,var(--maya-fg) 22%,transparent)}";
const TH = "width:14px;height:14px;border:0;border-radius:50%;background:var(--maya-accent)";
const B = "border:0;background:none;font:inherit;color:var(--maya-fg-muted);cursor:pointer";
// radial
const RADIAL =
  ":where(path[data-polar]){stroke:var(--maya-bg);stroke-width:1.5;stroke-linejoin:round}" +
  "[data-maya=grid] circle[data-disc]{fill:var(--maya-fg);fill-opacity:.035;stroke:none}" +
  "[data-maya=labels] [data-tip],[data-maya=labels] [data-name]{font-size:var(--maya-label-size,11px);font-weight:600}";

// marimekko
const MEKKO =
  "[data-maya=labels] [data-ink]{fill:var(--maya-label-ink,#12161c);font-weight:600}[data-maya=labels] [data-ink=n]{font-weight:500}" +
  "[data-maya=labels] [data-ax]{stroke:none;font-size:var(--maya-label-size,11px)}[data-maya=labels] [data-col]{stroke:none;font-weight:500}" +
  "[data-maya=marks][data-hot] [data-mm]:not([data-active],[data-lit]){opacity:.62}";

// flow
// Sankey and chord: the outer column is one neutral (`data-neu`, no `data-s`), links take a
// palette colour. Hovering a node (`data-n`) lights every link and node on a path through it
// (the tooltip sets data-lit where `data-a` lists the node) and dims the rest; hovering a link
// lifts it and keeps every node bright.
const FLOW =
  (
    "[data-maya=link]{opacity:.45;fill:var(--c)}" +
    "M[data-hot] [data-maya=link]{opacity:.08}" +
    "M [data-maya=link]:is([data-active],[data-lit]){opacity:.85}"
  ).replaceAll("M", "[data-maya=marks]") +
  "rect[data-n]{rx:4px}" +
  "path[data-maya][data-arc]{stroke:var(--c);stroke-width:4;stroke-linejoin:round}path[data-arc][data-active]{stroke:color-mix(in oklab,var(--c),var(--maya-fg) 12%)}" +
  "[data-maya=labels] [data-nm]{font-weight:600}[data-maya=labels] [data-v]{font-weight:400;font-size:.9em}";

// hexmap
// Hexes: stronger ramp (48% floor, --fl), same-colour round-join stroke for soft corners, ring on hover.
const HEX = 'path[data-key^="g~"]';
const HEXMAP =
  `:is(.maya,.maya-root):has(${HEX}){--fl:48%}${HEX}{stroke:var(--maya-accent);stroke-width:1.5;stroke-linejoin:round}` +
  `${HEX}:is([data-active],[data-selected]){stroke:var(--maya-fg);stroke-width:2.5}` +
  "[data-maya=grid] [data-none]{stroke-opacity:.7;shape-rendering:auto}" +
  "[data-hex] i{width:120px;height:10px}";

// scatter
// SCAT = a chart with two linear axes (scatter only).
const SCAT = "[data-xd] ";
// Density and heatmap cells: the accent (3.9:1 on --maya-bg in light, 4.8:1 in dark) at the floor, shifting toward --maya-fg (to 75%) so the ramp keeps its range.
const DENS = (p: string) => `color-mix(in oklab,var(--maya-accent),var(--maya-fg) ${p})`;
// Speed: points without a series (no data-s) inherit fill, stroke and its width from the marks
// group, resolved once (a var() and color-mix() per point cost ~3 ms of first paint at 1000
// points); other slots, tones and ramp steps (OWN) mix their own --c. A dense plot's first point
// carries data-dense: the group's fill strength --p drops from 58% to 30% for every point.
const P = (c: string) =>
  `fill:color-mix(in oklab,${c} var(--p),transparent);stroke:color-mix(in oklab,${c} 64%,var(--maya-fg))`;
const LOW = "color-mix(in oklab,var(--maya-bg) 13%,var(--maya-accent))";
const OWN = ':is([data-tone],[data-q],[data-s]:not([data-s="0"]))';
const SCATTER =
  `${SCAT}[data-maya=marks]{--p:58%;stroke-width:1.25;${P("var(--maya-series-1)")}}${SCAT}[data-maya=marks]:has(>[data-dense]){--p:30%}` +
  `${SCAT}circle[data-maya=mark]{fill:inherit;stroke:inherit;transform-origin:center}` +
  `${SCAT}circle${OWN}{${P("var(--c,var(--maya-series-1))")}}` +
  `${SCAT}rect[data-maya=mark]{rx:0;stroke:none}circle[data-key^="c~"][data-q]{--c:${DENS("min(75%,max(0%,calc((var(--q) - 35%)*1.15)))")}}` +
  // Density cells (scatter and beeswarm bins, key b~): page tint to accent over steps 0-4, accent to ink over 5-9.
  `rect[data-key^="b~"][data-q]{--c:color-mix(in oklab,var(--maya-bg) max(0%,calc(13% - (var(--q) - 35%)*.36)),${DENS("min(75%,max(0%,calc((var(--q) - 67%)*2.3)))")})}` +
  `[data-d] i:has(~i){width:40px;background:linear-gradient(90deg,${LOW},var(--maya-accent))}[data-d] i~i{width:40px;background:linear-gradient(90deg,var(--maya-accent),${DENS("75%")})}` +
  `${SCAT}circle[data-maya=mark][data-q]{fill:color-mix(in oklab,var(--c) 85%,transparent)}` +
  `${SCAT}circle[data-maya=mark][data-active]{fill:color-mix(in oklab,var(--c,var(--maya-series-1)) 85%,transparent);stroke:var(--maya-fg);stroke-width:2;transform:scale(1.3);filter:none}` +
  "[data-maya=cross] [data-g]{transform:translateY(calc(-1*var(--y,0px)))}[data-maya=cross] [data-g=y]{transform:translateX(calc(-1*var(--x,0px)))}" +
  "[data-on][data-maya=cross] [data-g]{transition:transform .25s var(--maya-ease)}" +
  "[data-maya=cross] line[data-g]{stroke-dasharray:3 3;stroke-opacity:.7}" +
  "[data-maya=cross] text,[data-maya=rules] text{font-size:var(--maya-label-size,11px);font-weight:600;fill:var(--maya-fg);paint-order:stroke;stroke:var(--maya-bg);stroke-width:4;stroke-linejoin:round}";

// [data-pt] points are hidden (fill-opacity 0); an opacity on each would only cost WebKit a paint group apiece.
const DIM =
  ":not([data-active],[data-lit],text,:is(rect,path)[data-q],[data-kpi=fill],[data-pt] circle:not([data-last],[data-selected]))";
// orbit
// Planets orbit a sun: the theme rotates g[data-v] about the sun (its origin); a name rides inside, counter-turned upright.
// The chart is a still, trails included, unless motion is allowed and not `data-still`: then it turns until a pointer, focus or an active planet stops it.
// ponytail: five speed buckets, one period each (--p).
const ORBIT =
  "g[data-v]{transform-box:view-box;transform-origin:0 0}" +
  "[data-trail]{fill:none;stroke:var(--c,var(--maya-series-1));pointer-events:none;stroke-width:2;stroke-linecap:round}[data-trail=true]{stroke-opacity:.5}" +
  "g[data-s] circle[data-maya=mark]{stroke:var(--maya-bg);stroke-width:1.5}g[data-s] circle[data-maya=mark]:is([data-active],[data-selected]){stroke:var(--maya-fg);stroke-width:2}" +
  "[data-maya=marks][data-hot] g[data-s]:not([data-lit],:has([data-active])) :is(g[data-up],[data-trail]){opacity:.4}" +
  "g[data-s] circle[data-below]{fill-opacity:.45;stroke:var(--c)}[data-up] text{font-size:var(--maya-label-size,11px);font-weight:600}[data-up] [data-g]{font-weight:400;fill:var(--maya-fg-muted)}" +
  "@media (prefers-reduced-motion:no-preference){@keyframes maya-orbit{to{transform:rotate(360deg)}}" +
  [80, 52, 36, 24, 16].map((s, i) => `g[data-v="${i + 1}"]{--p:${s}s}`).join("") +
  // Always turning; a name turns back about its own centre at the same rate, so it stays upright beside its planet.
  ".maya:not([data-still]) g[data-v]{animation:maya-orbit var(--p) linear infinite}.maya:not([data-still]) g[data-neg]{animation-direction:reverse}" +
  ".maya:not([data-still]) g[data-v] g[data-up]{transform-box:fill-box;transform-origin:center;animation:inherit;animation-direction:reverse}.maya:not([data-still]) g[data-neg] g[data-up]{animation-direction:normal}" +
  // A pointer over the chart, keyboard focus or an active planet stops the sky where it is.
  ".maya-svg:is(:hover,:focus,:has([data-active])) :is(g[data-v],g[data-up]){animation-play-state:paused}" +
  "}" +
  // Weave threads and halos: dim with legend hover, selection and the lit thread.
  "[data-w]{opacity:var(--h,var(--d,var(--o)));transition:opacity .25s}[data-maya=marks][data-hot] [data-w]:not([data-lit]){opacity:.18}" +
  // Memory ghost (bar `was`): the previous value, behind its bar.
  "[data-past]{fill:var(--maya-ghost,var(--maya-fg));fill-opacity:.12;stroke:var(--maya-ghost,var(--maya-fg));stroke-opacity:.55;stroke-dasharray:3 2;rx:var(--maya-radius);transform-box:fill-box;transform-origin:0 0;pointer-events:none}" +
  // A was tick (grouped bars): solid ink across the bar, no box.
  "[data-past][data-tick]{fill-opacity:.7;stroke:none}";

export const css =
  L +
  `@supports not (color:light-dark(#000,#fff)){:host,.maya-root{${D}}@media (prefers-color-scheme:dark){:host,.maya-root{${N}}}}` +
  ":host{display:block;position:relative;container-type:inline-size;min-height:min(200px,100%)}" +
  ".maya{display:flex;flex-direction:column;height:100%;font:var(--maya-font-size) var(--maya-font);font-variant-numeric:var(--maya-numeric,tabular-nums);color:var(--maya-fg)}" +
  ".maya-title{font-weight:var(--maya-title-weight,600);font-size:var(--maya-title-size,15px);letter-spacing:-.01em;margin:0 0 6px}" +
  ":host([data-compact]) .maya-title{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}:host([data-compact]) .maya-sub{display:none}" +
  ".maya-sub{font-size:var(--maya-subtitle-size,inherit);margin:-3px 0 8px;color:var(--maya-fg-muted);line-height:1.35}" +
  // Legend placement (slot order never changes): bottom moves it after the chart; right makes the chart a grid whose last row holds the chart and the legend side by side (up to six rows above for title, subtitle, controls and crumbs).
  ".maya[data-legend=bottom] .maya-legend{order:1;margin:8px 0 0}" +
  `${R}{display:grid;grid-template:repeat(6,auto) minmax(0,1fr)/minmax(0,1fr) max-content}${R}>*{grid-column:1/-1}${R} .maya-box{grid-area:7/1}` +
  `${R} .maya-legend{grid-area:7/2;flex-flow:column;align-items:start;align-self:start;max-width:30cqw;margin:0 0 0 12px}` +
  ".maya-legend{font-size:var(--maya-legend-size,inherit)}.maya-legend,.maya-crumbs{color:var(--maya-fg-muted);display:flex;flex-wrap:wrap;align-items:center;gap:2px 6px;margin:0 0 8px}" +
  ".maya-crumbs{min-height:1.25em;line-height:1.25}" +
  // The current crumb is where you are, not a link: ink, bold, no hover.
  ".maya-crumbs [aria-current]{padding:2px 6px;color:var(--maya-fg);font-weight:600}" +
  `.maya-legend :is(button,span),:is(.maya-crumbs,.maya-tip) button,.maya-reset,.maya-play,.maya-flip,.maya-params-btn,.maya-params-reset{display:inline-flex;align-items:center;gap:6px;${B};border-radius:6px;padding:2px 6px;transition:background .15s,opacity .2s,color .15s}` +
  ":is(.maya-legend,.maya-crumbs,.maya-tip) button:hover{background:var(--maya-grid);color:var(--maya-fg)}" +
  ".maya-legend [aria-pressed=false]{opacity:.5}.maya-legend [aria-pressed=false] i{background:none;box-shadow:inset 0 0 0 1.5px var(--c)}" +
  ":is(button,a,input,select):focus-visible,.maya-ctl :focus-visible{outline:2px solid var(--maya-focus);outline-offset:2px}:is([data-maya=sort],[data-maya=more],rect[data-maya=axis],.maya-svg):focus-visible{outline:2px solid var(--maya-focus)}.maya-ctl :focus-visible{outline-offset:-2px}" +
  "i{width:10px;height:10px;border-radius:3px;background:var(--c)}" +
  "[data-maya=ramp]{display:flex;flex-wrap:wrap;align-items:center;gap:6px}[data-maya=ramp] span{unicode-bidi:plaintext}.maya-legend b{font-weight:500;color:var(--maya-fg);unicode-bidi:plaintext}[data-maya=ramp]:dir(rtl) i{scale:-1 1}" +
  ".maya-legend [data-past] i{background:color-mix(in oklab,var(--maya-fg) 12%,transparent);outline:1px dashed var(--maya-fg-muted);outline-offset:-1px}" +
  ".maya-legend [data-past][data-line] i{width:14px;height:2px;border-radius:0;outline:0;background:repeating-linear-gradient(90deg,var(--c,var(--maya-fg)) 0 4px,#0000 4px 6px)}.maya-legend [data-past][data-tick] i{height:2px;border-radius:0;background:var(--maya-fg);outline:0}" +
  "[data-maya=ramp] circle{fill:none;stroke:var(--maya-fg-muted)}" +
  // The ramp legend is the cells' ramp (low, mid, high); quantile classes are swatches; a constellation's stars use the density ramp.
  `[data-maya=ramp] i{flex:none;width:80px;height:8px;background:linear-gradient(90deg,var(--rl),var(--rm),var(--rh))}[data-maya=ramp] i[data-q]{width:16px;background:var(--c)}.maya:has(circle[data-key^="c~"]) [data-maya=ramp] i{background:linear-gradient(90deg,var(--maya-accent),${DENS("75%")})}` +
  // Ramp floor: the background, lifted toward the accent in dark mode so low steps stay visible.
  // Declared once where the theme overrides live, not on every ramp mark (speed).
  // Ramp stops: tokens rampLow, rampMid, rampHigh; unset, the accent from 35% (--fl) over --b, the 50% mix of the two ends.
  ".maya,.maya-root{--b:light-dark(var(--maya-bg),color-mix(in oklab,var(--maya-accent) 15%,var(--maya-bg)));--rl:var(--maya-ramp-low,color-mix(in oklab,var(--maya-accent) var(--fl,35%),var(--b)));--rh:var(--maya-ramp-high,var(--maya-accent));--rm:var(--maya-ramp-mid,color-mix(in oklab,var(--rh),var(--rl)))}" +
  ".maya-reset,.maya-play,.maya-flip,.maya-params-btn,.maya-params-reset{border:1px solid var(--maya-grid);border-radius:99px;padding:3px 12px;background:var(--maya-bg);box-shadow:0 1px 3px #0000001a}.maya-reset{position:absolute;top:4px;right:4px}" +
  ".maya-ctl,.maya-play,.maya-flip,.maya-params-btn{margin:0 0 8px;align-self:flex-start}.maya-play,.maya-flip{min-height:24px}.maya-ctl{position:relative;display:inline-grid;grid-auto-flow:column;grid-auto-columns:1fr;padding:2px;border-radius:8px;background:var(--maya-grid)}" +
  ".maya-ctl::before{content:'';position:absolute;inset:2px auto 2px 2px;width:calc(100% - 4px);border-radius:6px;background:var(--maya-bg);box-shadow:0 1px 3px #0000001a;transition:transform .3s var(--maya-ease)}" +
  C +
  `.maya-ctl [role=radio]{${B};color:color-mix(in oklab,var(--maya-fg-muted),var(--maya-fg) 20%);position:relative;padding:4px 12px;border-radius:6px;transition:color .2s}` +
  ".maya-ctl [aria-checked=true]{color:var(--maya-fg);font-weight:600}" +
  // The kpi Details button is a toggle: pressed (the back face shows) it is ink on the control track.
  ".maya-flip[aria-pressed=true]{background:var(--maya-grid);color:var(--maya-fg);font-weight:600}" +
  // Controls share a row (a wrapper), the measure and stack controls side by side; a small tile tightens them and scrolls what still overflows.
  ".maya-ctls{display:flex;flex-wrap:wrap;gap:0 8px;align-items:flex-start}.maya-ctls>.maya-ctl{margin-bottom:8px}" +
  ":host([data-compact]) :is(.maya-ctl,.maya-flip,.maya-play){margin-bottom:4px;max-width:100%;overflow-x:auto;scrollbar-width:none}:host([data-compact]) .maya-ctl [role=radio]{padding:2px 8px;font-size:11px}" +
  // The card turn (kpi back): the box holds the perspective, the face hides its back; a rolled digit shows through its own clip.
  ".maya-svg{backface-visibility:hidden}.maya-box svg[data-roll]{overflow:hidden}[data-roll] text{fill:var(--maya-fg)}" +
  ".maya-err{overflow-wrap:anywhere;margin:0;padding:8px;color:var(--maya-bad);white-space:pre-wrap;font:12px monospace}" +
  ".maya-box{flex:1;min-height:0;position:relative}" +
  ".maya-box svg{display:block;overflow:visible}.maya-box svg:not([data-roll],[data-maya=panel]){width:100%;height:100%}" +
  ".maya-svg{direction:ltr;font:var(--maya-font-size) var(--maya-font);font-variant-numeric:var(--maya-numeric,tabular-nums);-webkit-user-select:none;user-select:none}" +
  ".maya-svg text{fill:var(--maya-fg-muted);unicode-bidi:plaintext}[data-maya^=axis] text{font-size:var(--maya-axis-size,11px)}" +
  "[data-maya=grid] *{stroke:var(--maya-grid);stroke-dasharray:var(--maya-grid-dash);shape-rendering:crispEdges}" +
  S +
  "[data-total],[data-tone=zero]{--c:var(--maya-fg-muted)}[data-other],[data-neu]{--c:var(--maya-neutral,var(--maya-fg-muted))}" +
  "[data-tone=good]{--c:var(--maya-good)}[data-tone=warn]{--c:var(--maya-warn,light-dark(#960,#fc3))}[data-tone=bad]{--c:var(--maya-bad)}" +
  // colorBy "sign" reads as direction (theme up, down); a waterfall's own bars take up, down, total (series 1 and 2 unset). A colors map key beats a tone (svg[data-mapped]).
  ":is(svg,[data-maya=tone])[data-sign] [data-tone=good]{--c:var(--maya-up,var(--maya-good))}:is(svg,[data-maya=tone])[data-sign] [data-tone=bad]{--c:var(--maya-down,var(--maya-bad))}" +
  "[data-way=up]{--c:var(--maya-up,var(--maya-series-1))}[data-way=down]{--c:var(--maya-down,var(--maya-series-2))}svg[data-plot] [data-way=total]{--c:var(--maya-total,var(--maya-fg-muted))}" +
  rng(8)
    .map(
      (n) => `svg[data-mapped~="${n}"] [data-s="${n}"][data-tone]{--c:var(--maya-series-${n + 1})}`,
    )
    .join("") +
  // Value ramp: low to mid at --u 0..1/2, mid to high above (two mixes); unset, mid is the 50% mix and it is one linear ramp.
  "[data-q]{--c:color-mix(in oklab,var(--rh) clamp(0%,calc(var(--u)*200% - 100%),100%),color-mix(in oklab,var(--rm) clamp(0%,calc(var(--u)*200%),100%),var(--rl)))}" +
  Q +
  "rect[data-hm]{stroke:color-mix(in oklab,var(--c) 70%,var(--maya-bg));rx:var(--maya-cell-radius,var(--maya-radius))}" +
  "[data-maya=mark]{fill:var(--c,var(--maya-series-1));rx:var(--maya-radius);transform-box:fill-box;transform-origin:0 0;opacity:var(--h,var(--d,var(--o)))}" +
  "[data-stack] rect[data-maya=mark],:not(circle)[data-depth]{stroke:var(--maya-bg);stroke-width:1}" +
  // Active mark: an ink ring, fill untouched, so in-mark labels keep their contrast.
  ":is(rect,path)[data-maya=mark][data-active]{stroke:var(--maya-fg);stroke-width:1.5}" +
  "[data-pt] circle[data-maya=mark]:not([data-active],[data-lit],[data-selected],[data-last]){fill-opacity:0;stroke-opacity:0}" +
  "[data-pt] circle[data-maya=mark]{stroke:var(--maya-bg);stroke-width:2}[data-pt] circle[data-lit]{r:4px}" +
  "circle[data-maya=mark][data-active]{filter:drop-shadow(0 0 4px color-mix(in oklab,var(--c) 70%,transparent))}" +
  "[data-maya=line]{fill:none;stroke:var(--c);stroke-width:var(--maya-line,2.25);stroke-linejoin:round;stroke-linecap:round}[data-maya=line][data-em]{stroke-width:var(--maya-line-emphasis,calc(var(--maya-line,2.25)*1.75))}" +
  "[data-maya=area]{fill:color-mix(in oklab,var(--c) 18%,transparent);stroke:none}[data-stack] [data-maya=area]{fill:color-mix(in oklab,var(--c) 45%,var(--maya-bg))}" +
  A +
  "stop{stop-color:var(--c)}" +
  // Dumbbell connector, kpi parts, y2 legend swatch.
  "circle[data-to]{--c:var(--maya-fg)}circle[data-maya=mark][data-hollow]{fill:var(--maya-bg);stroke:var(--c);stroke-width:2}" +
  "line[data-maya=link]{stroke:var(--c,var(--maya-fg-muted));opacity:1}" +
  "text[data-maya=mark]{fill:var(--maya-fg);font-weight:600}text[data-hero]{font-weight:var(--maya-hero-weight,600)}[data-maya=empty]{font-size:var(--maya-empty-size,revert-layer)}:where([data-maya=labels]) text:not([font-size]){font-size:var(--maya-label-size,inherit)}[data-kpi=track]{fill:var(--maya-grid)}[data-kpi=target]{stroke:var(--maya-fg)}" +
  "[data-maya=labels] [data-tone]{fill:var(--c)}[data-maya=labels] :is([data-kpi=period],[data-kpi=of],[data-ring],[data-tip],[data-ax],[data-v]){fill:var(--maya-fg-muted)}" +
  "[data-line] i,.maya:has([data-radar]) .maya-legend button:not([data-dash]) i{height:2px;border-radius:1px}" +
  // Direct end labels of line and area, in their series colour.
  "[data-maya=labels] [data-end]{fill:color-mix(in oklab,var(--c) 70%,var(--maya-fg));font-weight:600}[data-end] [data-v]{font-weight:400}[data-lead]{stroke:var(--c);opacity:.6}" +
  // Dashed series (spec.dash): square caps so the gaps stay open (the dash itself is the path's stroke-dasharray, in pathLength units); the legend key is the same dash. Annotations (spec.annotate) are the quiet bold; a slope rule is a faint diagonal.
  "[data-maya=line][data-dash]{stroke-linecap:butt}.maya-legend [data-dash] i{width:14px;height:2px;border-radius:0;background:repeating-linear-gradient(90deg,var(--c) 0 5px,#0000 5px 8px)}[data-ann]{font-weight:600}" +
  "line[data-slope]{stroke:var(--maya-fg-muted);stroke-width:1.25;stroke-dasharray:4 3;pointer-events:none}" +
  // Rules across the category axis (an event) and shaded value ranges (a target band): quiet, behind the data's eye.
  "[data-maya=rules] line[data-xrule]{stroke:var(--maya-fg-muted);stroke-dasharray:none}rect[data-band]{fill:var(--maya-accent);fill-opacity:.1;stroke:var(--maya-accent);stroke-opacity:.45}[data-ann=note]{font-weight:500;font-style:italic}" +
  // Break marks on a clipped Other bar; parallel tick halos and end-label leaders.
  "[data-brk]{stroke:var(--maya-bg);stroke-width:2.5;fill:none}[data-ax][data-h]{stroke:var(--maya-bg);stroke-width:3;paint-order:stroke;stroke-linejoin:round}[data-maya=grid] line[data-s]{stroke:var(--c)}" +
  // 0.2 types: ridgeline fill, radial rings, table header and row text, parallel line focus.
  "svg:not([data-stack]) [data-maya=area][data-ridge]{fill:color-mix(in oklab,var(--c) 40%,var(--maya-bg))}[data-maya=grid] circle{fill:none;shape-rendering:auto}" +
  "[data-maya=marks] text{fill:var(--maya-fg)}" +
  "[data-maya=sort]{cursor:pointer}[data-maya=sort] rect{fill:transparent}[data-maya=sort] text{font-weight:600}" +
  ":is([data-maya=line],[data-maya=area]){transition:opacity .25s;opacity:var(--h,var(--d))}[data-maya=marks][data-hot=p] path[data-maya=line]:not([data-active]){opacity:.25}" +
  // Sunburst rings: the stroke is the slice. Tint follows depth in the whole tree, so a slice
  // keeps its colour through a drill; the root disk is neutral, a drilled one its branch's.
  "circle[data-depth][data-maya]{fill:none;stroke:var(--c);transition:stroke .5s}circle[data-key=v][data-depth]{transition-duration:.83s;transition-timing-function:cubic-bezier(.25,1,.5,1)}" +
  "circle[data-depth]:focus{outline:none}circle[data-depth]:focus-visible{stroke:color-mix(in oklab,var(--c),var(--maya-fg) 22%)}" +
  'circle[data-depth="0"]:not([data-s])[data-maya]{stroke:color-mix(in oklab,var(--maya-fg) 5%,var(--maya-bg))}' +
  `[data-maya=marks][data-hot] [data-maya=mark]${DIM}{opacity:.4}svg[data-still] [data-hot] [data-maya=mark]${DIM}{opacity:1;fill-opacity:.4;stroke-opacity:.4}` +
  // A dimmed mark fades toward the page: its in-bar label flips to the page ink (tooltip.ts dim()).
  ".maya-svg [data-maya=labels] [data-in][data-dim]{fill:var(--maya-fg)}" +
  "[data-maya=marks][data-hot=r] [data-depth]{opacity:1!important}" +
  'svg[data-drill] :is([data-maya=mark],[data-maya=hit]):not([data-n]),[data-dr],circle[data-depth="0"][data-s]{cursor:pointer}' +
  "[data-maya=marks]:has([data-selected]){--o:.35}" +
  "[data-selected]{stroke:var(--maya-fg);stroke-width:2;--o:1}" +
  "[data-maya=labels],[data-maya=cross],[data-maya=band]{pointer-events:none}[data-maya=rules],[data-maya=brush],[data-ghost],[data-brk],text[data-total]{pointer-events:none}[data-maya=rules] line{stroke:var(--maya-fg);stroke-dasharray:3 3}[data-maya=cross],[data-maya=band]{opacity:0;transition:opacity .2s}" +
  "[data-on]:is([data-maya=cross],[data-maya=band]){opacity:1;transition:opacity .2s,transform .25s var(--maya-ease)}[data-maya=band]{fill:var(--maya-fg);fill-opacity:.05;rx:6px}" +
  "[data-maya=labels] text,[data-up] text{fill:var(--maya-fg);paint-order:stroke;stroke:var(--maya-bg);stroke-width:3;stroke-linejoin:round}[data-maya=labels] [data-in]{stroke:none}[data-maya=labels] [data-dark]{fill:light-dark(#12161c,var(--maya-bg))}" +
  "[data-maya=cross] line{stroke:var(--maya-fg-muted);stroke-opacity:.55}" +
  "[data-maya=brush]{fill:var(--maya-accent);fill-opacity:.12;stroke:var(--maya-accent);vector-effect:non-scaling-stroke}" +
  ".maya-svg:focus{outline:none}" +
  // A table ignores height:1px, so it grows up from the bottom: overflow above the page is not
  // scrollable, overflow below (a 1000-row table) would leave a page-long gap.
  ".maya-sr caption{position:absolute;clip-path:inset(50%)}.maya-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}table.maya-sr{table-layout:fixed;bottom:0}.maya-sr *{overflow:hidden}" +
  ".maya-probe{position:absolute;width:0;height:0;pointer-events:none;anchor-name:--maya-probe}" +
  ".maya-tip{margin:0;inset:auto;border:1px solid var(--maya-grid);padding:8px 10px;min-width:96px;background:var(--maya-tooltip-bg);color:var(--maya-tooltip-fg);border-radius:8px;box-shadow:0 1px 2px #0000000f,0 10px 28px -8px #0000004d;backdrop-filter:blur(8px);font:var(--maya-font-size)/1.4 var(--maya-font);font-variant-numeric:var(--maya-numeric,tabular-nums);pointer-events:none;opacity:0;translate:0 4px;transition:opacity .15s,translate .2s var(--maya-ease)}" +
  "@supports (anchor-name:--x){.maya-tip{position-anchor:--maya-probe;position-area:block-start;position-try-fallbacks:flip-block,block-start span-inline-start,block-start span-inline-end;margin:8px}.maya-tip[data-side]{position-area:inline-end span-block-end;position-try-fallbacks:flip-inline;margin:0 12px}}" +
  ".maya-tip.maya-open{opacity:1;translate:none}" +
  ".maya-tip button{display:block;margin:6px -4px -4px;padding:2px 4px;color:var(--maya-fg);pointer-events:auto}" +
  ".maya-tip b{display:block;margin:0 0 4px;font-weight:600}" +
  ".maya-tip div{display:flex;align-items:center;gap:8px;color:color-mix(in oklab,var(--maya-tooltip-fg) 72%,transparent)}.maya-tip i{width:8px;height:8px;border-radius:50%}" +
  ".maya-tip [data-v]{margin-inline-start:auto;padding-inline-start:12px;font-weight:600;color:var(--maya-tooltip-fg)}.maya-tip [data-on]{color:var(--maya-tooltip-fg)}" +
  // Constellation profile: a bar either side of the average (--z in standard deviations), and the neighbour note.
  ".maya-tip [data-z]{flex:none;position:relative;width:56px;height:6px;margin-inline-start:auto;border-radius:3px;background:linear-gradient(var(--maya-fg-muted),var(--maya-fg-muted)) 50%/1px 100% no-repeat,var(--maya-grid)}.maya-tip [data-z]::before{content:'';position:absolute;inset-block:0;left:calc(50% + min(0px,var(--z)*11px));width:calc(max(var(--z),-1*var(--z))*11px);border-radius:3px;background:var(--c,var(--maya-accent))}.maya-tip [data-z]+[data-v]{margin-inline-start:0;min-width:6ch;text-align:end}.maya-tip [data-note]{display:block;max-width:240px;margin-top:4px}" +
  // Constellation hover: links to the 3 nearest appear and those stars are ringed.
  "[data-maya=grid] line[data-a]{stroke:none}[data-maya=grid] line[data-a][data-lit]{stroke:var(--maya-fg);stroke-width:1.5;stroke-dasharray:none;shape-rendering:auto}circle[data-n][data-lit]{stroke:var(--maya-fg);stroke-width:2}" +
  "@media (pointer:coarse){:is(.maya-legend,.maya-crumbs) button,.maya-ctl [role=radio],.maya-reset,.maya-crumbs{min-height:24px}}" +
  "@container (max-width:320px){.maya-legend{font-size:var(--maya-legend-size,11px);gap:0 2px;margin:0 0 4px}.maya-legend :is(button,span){gap:4px;padding:1px 4px}.maya-legend :not([data-line],[data-dash])>i{width:8px;height:8px}.maya-title{font-size:var(--maya-title-size,12px)}}" +
  RADIAL +
  MEKKO +
  FLOW +
  // Tint of a parent's colour (data-lt 0..7, 0 = the parent): any mark (fill, stroke, label) reads --c.
  // Steps mix toward the ink (--maya-fg: darker on light, lighter on dark), so each step only gains contrast on the page and a base that passes 3:1 keeps it.
  rng(8)
    .map(
      (n) =>
        `[data-s="${n}"][data-lt]{--c:color-mix(in oklab,var(--maya-series-${n + 1}) var(--t,100%),var(--maya-fg))}[data-lt="${n}"]{--t:${100 - n * 7}%}`,
    )
    .join("") +
  // Nested treemap parent: a quiet frame of its branch colour behind its children.
  "rect[data-par]{fill:color-mix(in oklab,var(--c) 14%,var(--maya-bg))}" +
  // labelInk and labelInkOnFill are the inks where relative colours are missing (the fallback below and the [data-ink] base); a browser with them keeps the luminance rule,
  // because CSS cannot pick between two author colours by a channel of --c, and near-black / white are the only inks exact at the 4.5:1 threshold.
  // Label ink from the mark's own fill (the label repeats the mark's colour attributes, so --c is the fill): a neutral grey at relative luminance .0017 (near-black)
  // above Y .1831 (where both inks reach 4.5:1) and 1 (white) below it. The y channel of xyz-d65 is WCAG relative luminance itself (CIE L* is D50 and misjudges saturated blues).
  // Only near-black and white are exact at the threshold, so the inks are constants, not tokens.
  // Where relative colours are missing the dark [data-ink] rule stands, light on the fills known to be dark.
  "@supports (color:color(from red xyz-d65 x y z)){[data-maya=labels] [data-ink=a]{fill:color(from var(--c,var(--maya-series-1)) xyz-d65 calc(clamp(.0017,.0017 + (.1831 - y)*1e5,1)*.9505) clamp(.0017,.0017 + (.1831 - y)*1e5,1) calc(clamp(.0017,.0017 + (.1831 - y)*1e5,1)*1.089))}}" +
  "@supports not (color:color(from red xyz-d65 x y z)){[data-maya=labels] [data-ink=a]:is([data-other],[data-total],[data-tone]:not([data-tone=warn])){fill:var(--maya-label-ink-on,var(--maya-bg))}}" +
  HEXMAP +
  SCATTER +
  ORBIT +
  // Box plot (stats.ts): tinted box, faint row dots (whisker and median are lines).
  "[data-bx]{fill:var(--c);fill-opacity:.25;stroke:var(--c);transform-box:fill-box}" +
  // Whiskers are as light as the box outline; Tukey outliers are hollow rings.
  "rect[data-bx]~line:not([data-kpi]){stroke-width:1}circle[data-bx]~circle[data-last]{fill-opacity:0;stroke:var(--c);stroke-width:1.5}" +
  "@media (prefers-contrast:more){:host,.maya-root{--maya-fg-muted:var(--maya-fg);--maya-grid:color-mix(in oklab,var(--maya-fg) 40%,transparent)}}" +
  "@media (forced-colors:active){.maya-svg,i{forced-color-adjust:none}[data-maya=mark]:not(circle[data-depth]){stroke:CanvasText;stroke-width:1}[data-tone=bad]{stroke-dasharray:4 2}}" +
  "@media (prefers-reduced-motion:no-preference){[data-maya=mark],[data-maya=link]{transition:opacity .25s var(--maya-ease),fill .2s}[data-maya=labels] [data-in]{transition:fill .25s var(--maya-ease)}" +
  `${SCAT}circle[data-maya=mark]{transition:opacity .25s var(--maya-ease),fill .2s,stroke-width .2s,transform .2s var(--maya-ease)}` +
  "[data-pt] circle[data-maya=mark]{transition:fill-opacity .15s,stroke-opacity .15s}}" +
  // WebKit paints each per-element opacity as its own group: dense dumbbell connectors dim through the stroke.
  "[data-still] [data-hot] line[data-maya=link]{opacity:1;stroke-opacity:.08}" +
  "[data-still] *{transition:none!important}@media (prefers-reduced-motion:reduce){*{transition:none!important}}" +
  `.maya-filter,select.maya-frame{font:inherit;color:var(--maya-fg);background:var(--maya-bg);border:1px solid color-mix(in oklab,var(--maya-fg) 55%,transparent);border-radius:8px;padding:3px 8px;margin:0 0 8px;align-self:flex-start}` +
  // M5: line/area was ghost, scatter trails, frame controls, params, facet panels (wip-y: list cue).
  `path[data-past],line[data-past]{fill:none;stroke:var(--c,var(--maya-fg));stroke-opacity:.85;stroke-width:1.5}line[data-past]{stroke:var(--maya-fg-muted);stroke-width:2;stroke-dasharray:none}circle[data-trail=dot]{fill:var(--c,var(--maya-series-1));stroke:none;transform-box:fill-box;transform-origin:0 0}output.maya-frame-value{color:var(--maya-fg-muted);margin:0 0 8px 8px;align-self:flex-start}input.maya-frame{width:min(240px,100%);margin:0 0 8px;align-self:flex-start}.maya-ctl[data-maya=frame]{max-width:100%;overflow-x:auto;scrollbar-width:none}.maya-ctl[data-maya=frame]::before{display:none}.maya-ctl[data-maya=frame] [aria-checked=true]{background:var(--maya-bg);box-shadow:0 1px 3px #0000001a}.maya-params:not([popover]),.maya-params:popover-open{display:flex;flex-wrap:wrap;align-items:center;gap:4px 16px}.maya-params:not([popover]){margin:0 0 8px}.maya-param{display:grid;grid-template-columns:7em 120px 4.5ch;align-items:center;gap:8px;color:var(--maya-fg-muted)}.maya-param span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.maya-param output{text-align:end;color:var(--maya-fg);font-weight:600}${SL}{-webkit-appearance:none;appearance:none;height:16px;background:none;margin:0}${SL}::-webkit-slider-runnable-track${TR}${SL}::-moz-range-track${TR}${SL}::-webkit-slider-thumb{-webkit-appearance:none;margin-top:-5px;${TH}}${SL}::-moz-range-thumb{${TH}}.maya-params[popover]{inset:auto;margin:0;flex-direction:column;align-items:stretch;width:max-content;max-width:calc(100cqw - 16px);padding:10px 12px;border:1px solid var(--maya-grid);border-radius:8px;background:var(--maya-bg);color:var(--maya-fg);box-shadow:0 10px 28px -8px #0000004d}@supports (anchor-name:--x){.maya-params[popover]{position-area:block-end span-inline-end;position-try-fallbacks:flip-block}}svg[data-maya=panel]{overflow:hidden}svg[data-maya=panel]:focus{outline:none}svg[data-maya=panel]:focus-visible{outline:2px solid var(--maya-focus);outline-offset:3px}text[data-facet]{font-weight:600}svg[data-drill=facet] svg[data-maya=panel]{cursor:pointer}[data-maya=marks] text[data-more]{fill:var(--maya-fg-muted);font-size:12px}` +
  // M4: table filter, scrolling table, show-more row, open-row sub-chart, heatmap column drill and Total margins.
  ".maya-filter{padding:3px 10px;min-width:9em;max-width:100%}.maya-filter::placeholder{color:var(--maya-fg-muted)}" +
  ".maya-box:has(svg[data-scroll]){overflow:auto;max-height:100%}.maya-box svg[data-scroll]{height:auto}" +
  "svg[data-maya=expand]{overflow:hidden}" +
  "svg[data-xdrill] [data-maya=axis-x] text[data-key]{pointer-events:auto;cursor:pointer}svg[data-xdrill] [data-maya=axis-x] text[data-key]:hover{text-decoration:underline}" +
  ".maya-crumbs[data-axis=x]{margin-top:-4px}" +
  // A heatmap Total sits outside the ramp: a quiet neutral fill (the label's ink follows it), bold value.
  "[data-hm][data-sum]{--c:color-mix(in oklab,var(--maya-fg) 12%,var(--maya-bg))}text[data-hm][data-sum]{font-weight:700}" +
  // Table: the header owns a page-coloured ground and its rule (the element pins it over scrolled rows); the open row's chevron; a diverging column's centre line; strip squares.
  "[data-maya=thead]>rect[data-bg]{fill:var(--maya-bg);pointer-events:none}[data-maya=thead]>line{stroke:var(--maya-grid);stroke-width:1}" +
  "[data-maya=marks] text[data-chev]{fill:var(--maya-fg-muted);font-size:10px}[data-maya=grid] line[data-centre]{stroke:var(--maya-fg-muted);stroke-opacity:.5}" +
  "[data-way=zero]{--c:var(--maya-fg-muted)}rect[data-way][data-maya=mark]:not([data-s]){rx:2px}rect[data-nil]{fill:none;stroke:var(--maya-fg-muted);stroke-opacity:.4;rx:2px}" +
  // Table: the Show more row.
  "[data-maya=more]{cursor:pointer}[data-maya=more] text{fill:color-mix(in oklab,var(--maya-accent),var(--maya-fg) 30%);font-weight:600}[data-maya=more]:is(:hover,:focus-visible) text{text-decoration:underline}" +
  // List: bold headline over muted body, the value in its own weight, evidence names muted.
  "[data-maya=marks] text tspan[data-num]{fill:var(--maya-fg-muted)}[data-maya=marks] text tspan[data-hd]{font-size:14px;font-weight:600}" +
  "[data-maya=marks] text[data-v]{font-size:14px;font-weight:600}[data-maya=marks] text[data-body],[data-maya=marks] text[data-ev=name]{fill:var(--maya-fg-muted)}" +
  // Parallel brush and beeswarm peers (M2).
  // Parallel brush: lines outside every range fade; the range is a band on its axis (the cross group is hidden by default).
  "[data-off]{opacity:.12}" +
  "[data-maya=cross]:has([data-range]){opacity:1}" +
  "rect[data-range]{fill:var(--maya-accent);fill-opacity:.2;stroke:var(--maya-accent);pointer-events:none}" +
  "rect[data-maya=axis]{cursor:ns-resize;touch-action:none}" +
  // Beeswarm select { peers }: the peers keep their ink, the rest step back; their mean is a dashed rule with a label.
  "[data-maya=marks]:has([data-peer-on]) [data-peer]:not([data-peer-on]){opacity:.3}" +
  "[data-peer-on]{stroke:var(--maya-fg);stroke-width:1.5;--o:1}" +
  "[data-maya=grid] line[data-peer-mean]{stroke:var(--maya-fg);stroke-width:1.25;stroke-dasharray:4 3;pointer-events:none}";
