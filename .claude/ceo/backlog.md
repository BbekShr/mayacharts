# mayaCharts, open backlog

Single tracker for open work the CEO can pick up. One bullet per item: what, where, why, owner. Delete resolved items (git history keeps them). Every entry is a snapshot of when it was written: verify before acting.

## Needs a decision from the human

- **Size headroom** (2026-10-10 follow-up): the owner approved raising index, element, radial and global to the measured sizes plus about 64 B (index 40560, element 58260, radial 4780, global 77930). Applied on the owner's instruction the same day. Other bundles: theme 31 B, units 3 B, flow 7 B, hierarchy 33 B, stats 70 B. Owner: human.
- **Line charts anchored at zero** (design critic M7): a deliberate ceiling (`line.ts`); FT and Datawrapper nice-pad a line's extent and keep zero for area. About +20 B core and a default change (docs too). Owner: human.
- **Percent labels mix precision in one chart** ("10%" beside "15.9%", share bar and marimekko): the formatter is per value; one precision per chart needs the data or a fixed decimal. Contract question. Owner: human, then core engineer.

- **`frame: "<field>"` playback** (2026-10-06 showcase): folds the 21 to 23 line host loop of each motion tile into one spec line. About +200 B index, +500 B element and global. Needs a budget decision and the SSR frame choice (audit suggests the last frame). Owner: human, then core and element engineers.
- **New types in an opt-in `mayacharts/stat` module**: donut, funnel, then box plot and histogram (about 400 to 600 B each, own budget). 100% stack (`stack: "percent"`, about 100 B core) and per-field `aggregate` / `cumulative: true` (50 to 70 B) also wait on budget. Owner: human.
- **Bar race label placement**: values centred in one-colour bars read as a default; a Flourish-style race needs value-at-tip labels. Owner: human, then chart designer.

- **Unnamed scatter keys are row indexes**, so prepending data moves a selection to another dot. Changing it is a key contract change. Owner: human, then core engineer.

- **Zero rows reject treemap, sunburst, sankey and chord** (`non-positive-value`). One 0 in a BI extract fails the whole chart; skipping zeros like nulls changes the error contract. Owner: human, then core engineer.

- **Columnar input past 4M rows** (2026-10-08): at 10M nine-field rows the host's row objects take about 7 GB, more than a browser tab gets, so the limit is the data, not the chart. Typed arrays per field is the only change that moves it, and it is a spec change. Measured: 1M 1.5 GB, 2M 2.6 GB, 3M 3.9 GB, 5M 4.4 GB, 10M 7 GB peak RSS (Node, eleven Scale specs). Wait for a real user. Owner: human, then core engineer.

## Open

- **README gauge picture**: the README gallery grid has no gauge (needs `scripts/readme-shots.mjs`). Owner: chart designer.
- **README size figures are not checked**: `test/docs-facts.test.ts` (2026-10-10) checks counts, the module table, option type lists, tokens and error ids, but the KB figures need a build; a check in `scripts/size.mjs` against `dist/` (within 0.2 KB) would close it. That file is a guarded quality gate. Owner: human, then core engineer.

- **High-cardinality bar row pass** (2026-10-08; motion critic measured a 5.6 s main-thread freeze on the Scale bar-ids tile at 1M in chromium, 0.73 s in webkit): a bar with one category per row costs about 5 objects per category in `group()` (`core/shape.ts`), so first draw is 1.3 s at 1M, 2.8 s at 2M, 4.0 s at 3M, 62 s at 10M, mostly GC. Typed-array totals when there is no series and no y2 should be 2 to 3 times faster. Its resize refolds the rolled-up categories into Other (300 to 450 ms at 3M); running totals over the sorted order would make that a lookup. Scatter's first resize at 10M (10 s) was not profiled. Tried and no gain: a numeric-key cache in `group()`, a plain loop for bar totals. Owner: core engineer.

- **Calendar at 360 px**: cells shrink to about 3 px (hexmap now prints values only when they are readable, 2026-10-07). Owner: chart designer.
- **Memory delta labels**: with `was`, a signed delta at the bar tip ("value (+12%)") so the change reads without hovering (design critic M1). Measured +40 B core; needs budget. Owner: human, then chart designer.
- **Orbit update motion** (motion critic M1, 2026-10-07): trails and labels jump at t=0 while planets glide, planets cut through the sun, and a speed-bucket change restarts the rotation. Fix in animate.ts (translate the label group with its planet) and theme (rescale currentTime by period ratio). Owner: element engineer, chart designer.
- **Brush zoom does not read as a zoom** (motion critic M2): #zoom is only set for a drill, so leaving points shrink in place and the old and new lines crossfade at different scales. Pass a box zoom for a window change. Owner: element engineer.
- **Units swarm**: colour carries nothing and one outlier squeezes the dots; a labelled median rule (units at 98.8% of budget). Owner: chart designer.
- **Stats and hierarchy keep local width estimates**: switching to `tw()` cost bytes in those two bundles (code-point spread), so they still use `length * 7.2`. Revisit if either budget moves. Owner: chart designer.
- **Heatmap and hexmap ink cut is tuned to the default accent**: a host accent with a different lightness can fail 4.5:1 on a step. Owner: chart designer.
- **tokens.mjs and the README token block** are personal tooling in the repo (ponytail audit). Owner: human.

- **First full compare run after the dependency move** (`compare/package.json`): only `compare:bundle` and `compare:size` were run. Watch the next `compare.yml` run. Owner: core engineer.
- **Waffle share change**: cells keyed by name slide through each other (about 8% overlap mid-flight); key by grid position and let the fill transition carry the change. Owner: chart designer.
- **Treemap rank swaps**: tiles that change order cross mid-flight (15 to 36% overlap); colours are now stable (first-appearance slots, 2026-10-09), positions still re-pack by size. Keep order stable or record a ceiling. Owner: chart designer.

- **Design critic deferrals** (2026-10-08 deep): orbit labels sit on the trails (the halo covers glyph edges only) and "+x%" is dropped at 360; chord labels collide at 1280 and two vanish at 360; heatmap at 360 rounds labels into false ties; line value labels float between points with no marker; funnel weakest step is colour only (1.4.1); empty space and an extra nice step (calendar tile height, drift x to 800K, beeswarm from 10%). Owner: chart designer.
- **Grouped bars at 320 drop labels unevenly** (2026-10-08): home grouped shows North and some West values, no South. An all-or-nothing rule per series would read cleaner. Owner: chart designer.
- **Hexmap legend low end** starts at accent 36% while the lowest hex is 48%. About +40 B theme. Owner: chart designer.
- **Motion leftovers** (2026-10-08): axes and grid dip on a data update (old ghost fades from 0, new fades in after 160 ms); diverging labels run a 250 ms fill transition on resize; labels faded twice in the intro (cost only); arrow-key steps glide the tooltip (contract question: the DESIGN NOTE allows it). Owner: element engineer.
- **Stack seed scans siblings** per entering rect (quadratic in segments per column). A per-svg baseline attribute from bar.ts would save about 50 B net. Owner: element engineer with core.
- **Number format edges** (core review 2026-10-08): ticks mix scientific and plain around 1e-6 and 1e21 (decide per axis). Owner: core engineer (kpi: chart designer).
- **Contributor agreement** (security LOW): CLAUDE.md requires one before outside contributions; no CONTRIBUTING, CLA or PR template exists. Owner: human.

- **Gallery run leftovers** (2026-10-09): ridgeline tile reads as flat slabs and peak labels sit in the next ridge (a shared min-to-max rescale was tried and squashed Northeast under Midwest; rejected), owner chart designer; hbar drill exit ghost at 270 ms (the early exit fade washed treemap drills to 40% coverage and was reverted; fade the entrance on the same short clock, about +35 B), owner element engineer; waterfall "Tot…" at 360 and heatmap column cuts ("Oute…"), owner core engineer; time-line at 360 falls back to first and last date while time-bar gets month ticks, owner core engineer; active ring on dumbbell, beeswarm, units and dense-scatter cells (+16 B), `.maya-err` overflow at 360, owner chart designer; orbit short-form retry has no unit test, owner chart designer.
- **KPI and gauge follow-ups** (2026-10-09 kpi-bi): dark warn #fc3 reads louder than bad but the theme is at 4799 of 4800 B (needs an owner budget call), owner chart designer; `was` on a multi-measure kpi is rejected (one field cannot belong to several measures; a per-measure map would need a contract), owner core engineer; gauge and kpi each format their change line (share it only if a third mark needs it), owner chart designer.

- **Gauge leftovers** (design critic 2026-10-10; warn label and zero dot shipped in the follow-up): the target label clips at 360 px with currency cents (move it under the dial or format the dial labels compact, about +30 B); the target tick over a filled bar is 2.1:1 in dark (a background underlay, about +20 B each in radial and kpi); the keyboard tooltip covers the target label (element). Owner: chart designer, element engineer.
- **KPI and gauge wording**: the tooltip says "above target" while the tile says "On track" (the strings live in the element path); the headline uses a hyphen minus while change lines use U+2212; adjacent lines mix K and M. The last two fold into the percent precision contract question above. Owner: chart designer, core engineer.
- **Treemap labels** sit centred in large tiles with no share; FT and Datawrapper put the name top-left with the share (hierarchy has 33 B). Owner: chart designer.
- **Dumbbell value labels collide with the dots** when the two values are close (TX, NY and CA on the gallery tile, and FL loses one); the gallery tile keeps labels off until the mark places them beside the dot. Owner: chart designer.
- **Sankey drill labels**: node labels are keyed and leftovers fade on the UI clock, but the old labels still overlap the new ones for about 200 ms. Owner: element engineer.
- **Firefox flake**: "bar hover column sits under an unevenly spaced bar" failed 4 of 16 on base and 2 of 12 on the branch under load. Owner: element engineer.
- **Hexmap sums aliases** ("CA" and "California" add up regardless of `aggregate`). Rare; document or leave. Owner: chart designer.
- **Select clears on any document click**, including a host's own button outside the chart; document it in the select docs. Owner: core engineer.
