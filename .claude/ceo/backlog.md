# mayaCharts, open backlog

Single tracker for open work the CEO can pick up. One bullet per item: what, where, why, owner. Delete resolved items (git history keeps them). Every entry is a snapshot of when it was written: verify before acting.

## Needs a decision from the human

- **Version of the next release.** The CHANGELOG top section is "0.3.1 - Unreleased" but holds a redesign of seven chart types, new defaults and a new spec field; 0.4.0 fits semver better. Owner: human, then `/maya-release`.
- **Size budgets.** Raised on 2026-10-04 to fit the redesign (global 46, element 37.5, theme 4, hierarchy 3.75, flow 3.5 KB gzip). If the human wants them back down, the cheapest cuts are the sankey one-line label fallback (about 0.1 KB) and the scatter axis value pills. Owner: human.

## Open

- **Chord drill is inert.** A chord has two levels, so one drill leaves nothing to draw; clicks are ignored. Either draw the drilled branch as a one-level radial breakdown or reject `drill` for chord in `validate.ts` with a hint. Owner: core engineer (validation) or chart designer (drawing).
- **Radial tip totals do not show in the gallery tile.** The stacked tile is too small for them, so the feature is invisible on the demo site. Consider a taller tile or a single-series example. Owner: chart designer.
- **Drill motion for points.** Dumbbell dots and line points use the default pop or fade in a drill, not the rect zoom. Owner: element engineer.
- **Drilled treemap is one flat hue.** Children keep the branch colour (correct) but have no tint variation, so tiles separate only by gaps and labels. Owner: chart designer.
- **Dark text on saturated fills.** Labels on the sunburst inner ring and the radial's in-bar names use the foreground colour; white on dark fills would read better. Owner: chart designer.
- **Dense scatter at 360px.** The radius stays at 5, so 50 points overlap heavily. A density-based radius would help. Owner: chart designer.
- **Gallery has no drillable bar or sankey example.** Drill on those types is only reachable by editing a spec. Owner: chart designer.
- **Release workflow actions are not pinned to commit SHAs** (`# TODO pin to commit SHA` in `.github/workflows/release.yml`). Supply-chain hygiene for a provenance-signed package. Owner: core engineer.
