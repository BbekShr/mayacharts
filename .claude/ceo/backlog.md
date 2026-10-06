# mayaCharts, open backlog

Single tracker for open work the CEO can pick up. One bullet per item: what, where, why, owner. Delete resolved items (git history keeps them). Every entry is a snapshot of when it was written: verify before acting.

## Needs a decision from the human

- **Employer name in README.** `README.md:496` and `:622` name the employer product and its SDK calls (security MEDIUM-2, 2026-10-05). Remove or generalise until a signed release exists, or decide it is acceptable. Owner: human.
- **Apply the approved size budgets** (approved 2026-10-05, second round): index 31488, element 44544, hierarchy 4096, global 53760 bytes (30.75, 43.5, 4.0, 52.5 KB). The guard hook blocks agents from editing `mayaSize`. Owner: human.
- **Unnamed scatter keys are row indexes**, so prepending data moves a selection to another dot. Changing it is a key contract change. Owner: human, then core engineer.

## Open

- **First full compare run after the dependency move** (`compare/package.json`): only `compare:bundle` and `compare:size` were run. Watch the next `compare.yml` run. Owner: core engineer.
- **Waterfall Total label** overlaps the last step bar at 400 px wide (dark mode screenshot, 2026-10-05). Owner: chart designer.
- **Demo bar at 360 px**: with value labels on, neighbouring labels wider than their bars overlap ("18.9K 19.8K"). Owner: chart designer.
- **Sankey drill tile at 360 px**: item names overlap their flows. Owner: chart designer.
- **Parallel identity**: end labels drop on collision, so on the gallery data only one of four lines is named. Nudge apart with leader lines, or a legend. Owner: chart designer.
- **Roll-up bar clip mark**: the Other bar runs to the plot edge with no visual sign it is clipped. Owner: chart designer.
- **Radial first bar** reads "Jan 21.6M" while the others show only the value. Owner: chart designer.
- **Hexmap hover ink**: the hovered hex's own label can fall to about 3.5 to 1. Needs a hover rule that tells the active cell from the dimmed ones. Owner: chart designer.
- **Sunburst centre hold** assumes the centre text is the last two labels; a sunburst without a centre label keeps two ring names for half a second during a drill. Owner: element engineer.
