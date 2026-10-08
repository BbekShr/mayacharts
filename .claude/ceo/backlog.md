# mayaCharts, open backlog

Single tracker for open work the CEO can pick up. One bullet per item: what, where, why, owner. Delete resolved items (git history keeps them). Every entry is a snapshot of when it was written: verify before acting.

## Needs a decision from the human

- **`frame: "<field>"` playback** (2026-10-06 showcase): folds the 21 to 23 line host loop of each motion tile into one spec line. About +200 B index, +500 B element and global. Needs a budget decision and the SSR frame choice (audit suggests the last frame). Owner: human, then core and element engineers.
- **New types in an opt-in `mayacharts/stat` module**: donut, funnel, then box plot and histogram (about 400 to 600 B each, own budget). 100% stack (`stack: "percent"`, about 100 B core) and per-field `aggregate` / `cumulative: true` (50 to 70 B) also wait on budget. Owner: human.
- **Bar race label placement**: values centred in one-colour bars read as a default; a Flourish-style race needs value-at-tip labels. Owner: human, then chart designer.

- **Unnamed scatter keys are row indexes**, so prepending data moves a selection to another dot. Changing it is a key contract change. Owner: human, then core engineer.

- **Zero rows reject treemap, sunburst, sankey and chord** (`non-positive-value`). One 0 in a BI extract fails the whole chart; skipping zeros like nulls changes the error contract. Owner: human, then core engineer.

- **Columnar input past 4M rows** (2026-10-08): at 10M nine-field rows the host's row objects take about 7 GB, more than a browser tab gets, so the limit is the data, not the chart. Typed arrays per field is the only change that moves it, and it is a spec change. Measured: 1M 1.5 GB, 2M 2.6 GB, 3M 3.9 GB, 5M 4.4 GB, 10M 7 GB peak RSS (Node, eleven Scale specs). Wait for a real user. Owner: human, then core engineer.

## Open

- **Scale page sankey keeps the narrow draw** (2026-10-08, also on 0.10.0): after the 8 px nudge the sankey tile's box is 1206 px wide but its svg viewBox stays 1198 in Firefox, so the restore frame did not redraw. Check whether the second ResizeObserver delivery lands inside the 1 px tolerance or is coalesced with the first. Owner: element engineer.
- **High-cardinality bar row pass** (2026-10-08): a bar with one category per row costs about 5 objects per category in `group()` (`core/shape.ts`), so first draw is 1.3 s at 1M, 2.8 s at 2M, 4.0 s at 3M, 62 s at 10M, mostly GC. Typed-array totals when there is no series and no y2 should be 2 to 3 times faster. Its resize refolds the rolled-up categories into Other (300 to 450 ms at 3M); running totals over the sorted order would make that a lookup. Scatter's first resize at 10M (10 s) was not profiled. Tried and no gain: a numeric-key cache in `group()`, a plain loop for bar totals. Owner: core engineer.

- **Calendar at 360 px**: cells shrink to about 3 px (hexmap now prints values only when they are readable, 2026-10-07). Owner: chart designer.
- **Memory delta labels**: with `was`, a signed delta at the bar tip ("value (+12%)") so the change reads without hovering (design critic M1). Measured +40 B core; needs budget. Owner: human, then chart designer.
- **Orbit update motion** (motion critic M1, 2026-10-07): trails and labels jump at t=0 while planets glide, planets cut through the sun, and a speed-bucket change restarts the rotation. Fix in animate.ts (translate the label group with its planet) and theme (rescale currentTime by period ratio). Owner: element engineer, chart designer.
- **Brush zoom does not read as a zoom** (motion critic M2): #zoom is only set for a drill, so leaving points shrink in place and the old and new lines crossfade at different scales. Pass a box zoom for a window change. Owner: element engineer.
- **2D brush selects axis text** in Chromium (motion critic M4): `.maya-svg{user-select:none}` in theme.ts (theme has 7 B headroom). Owner: chart designer.
- **Table value cells jump on re-sort** (text marks have no geo()). Owner: element engineer.
- **Live region reads raw tabs and newlines** from multi-line data-f (tooltip.ts). Owner: element engineer.
- **Exiting sunburst rings still read getComputedStyle in the write loop** (animate.ts exit path). Owner: element engineer.
- **Units swarm**: colour carries nothing and one outlier squeezes the dots; a labelled median rule (units at 98.8% of budget). Owner: chart designer.
- **Stats and hierarchy keep local width estimates**: switching to `tw()` cost bytes in those two bundles (code-point spread), so they still use `length * 7.2`. Revisit if either budget moves. Owner: chart designer.
- **Heatmap and hexmap ink cut is tuned to the default accent**: a host accent with a different lightness can fail 4.5:1 on a step. Owner: chart designer.
- **Builder HTML snippet uses an inline style attribute** (security L), which fails under style-src without unsafe-inline. Owner: chart designer.
- **tokens.mjs and the README token block** are personal tooling in the repo (ponytail audit). Owner: human.

- **First full compare run after the dependency move** (`compare/package.json`): only `compare:bundle` and `compare:size` were run. Watch the next `compare.yml` run. Owner: core engineer.
- **Waffle share change**: cells keyed by name slide through each other (about 8% overlap mid-flight); key by grid position and let the fill transition carry the change. Owner: chart designer.
- **Treemap rank swaps**: tiles that change order cross mid-flight (15 to 36% overlap). Keep order stable or record a ceiling. Owner: chart designer.
