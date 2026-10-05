# mayaCharts, open backlog

Single tracker for open work the CEO can pick up. One bullet per item: what, where, why, owner. Delete resolved items (git history keeps them). Every entry is a snapshot of when it was written: verify before acting.

## Needs a decision from the human

- **Employer name in README.** `README.md:496` and `:622` name the employer product and its SDK calls (security MEDIUM-2, 2026-10-05). Remove or generalise until a signed release exists, or decide it is acceptable. Owner: human.
- **Apply the approved size budgets** from the 2026-10-05 deep run (index 30720, element 43878, hierarchy 4096, global 52838 bytes); the guard hook blocks agents from editing `mayaSize`. Owner: human.
- **Rival libraries in the root devDependencies.** The release job no longer holds the token while they install, but CI and dev installs still pull 317 packages. Moving the compare harness to its own package.json would shrink that. Owner: human (scope), then core engineer.

## Open

- **Bubble chart has no series or colour key.** With a `size` field the size key replaces the normal legend; render.ts (~531) should append it instead. About 30 B gzip. Owner: core engineer.
- **Axis thinning at 360 px drops category names** (heatmap shows 2 of 4 columns, bar-y2 likewise, time-line one tick). Never thin 8 or fewer categories; truncate instead. Owner: core engineer (layout.ts).
- **Sankey at 360 px loses big leaf labels** (Parka, Tops) now that the last two columns share slots, and "Sweater" clips at the bottom. Consider labels inside tall nodes. Owner: chart designer.
- **Hexmap value labels measure 2.66 to 2.90** (value line opacity .8 on mid steps). Owner: chart designer.
- **Design critic MEDIUM items left:** waterfall labels at 360 lose the Total; radial repeats the year on every month; league "Other" sets the bar scale; calendar weekday order and cell shape; line value labels sit on the stroke; parallel lines carry no identity. Owner: chart designer.
- **Design critic LOW items:** heatmap and calendar ramp legends lack the field name; monthly-line tooltip blank series cell; kpi "Dec" caption floats; synthetic margin is constant per family (beeswarm and bubble rows flat); ridgeline near-flat on a shared zero scale; demo page opens on plain bars. Owner: chart designer.
- **Sunburst of only slivers** collapses into one "Other (n)" ring. Owner: chart designer.
- **Sunburst centre text** fades with the old labels 220 ms into a drill, leaving a blank disc until 480 ms. Owner: element engineer.
- **Unnamed scatter keys are row indexes**, so prepending data moves a selection to another dot. Changing it is a key contract change. Owner: core engineer.
- **Gallery has no drillable sankey example.** Owner: chart designer.
- **Attribute versus property precedence** on `<maya-chart>` (a property set wins over later attribute changes) is undocumented. Owner: element engineer.
