# mayaCharts, open backlog

Single tracker for open work the CEO can pick up. One bullet per item: what, where, why, owner. Delete resolved items (git history keeps them). Every entry is a snapshot of when it was written: verify before acting.

## Needs a decision from the human

- **Unnamed scatter keys are row indexes**, so prepending data moves a selection to another dot. Changing it is a key contract change. Owner: human, then core engineer.

## Open

- **First full compare run after the dependency move** (`compare/package.json`): only `compare:bundle` and `compare:size` were run. Watch the next `compare.yml` run. Owner: core engineer.
- **Calendar and hexmap at 360 px**: calendar cells shrink to about 3 px, hexmap drops its values so colour alone carries them (RI 1.82:1). Owner: chart designer.
- **Single-series line or area shows no value without hovering** (end labels need 2 or more series). Owner: core engineer.
- **Chord at 360 px**: the Accessories arc label collides and is dropped. Owner: chart designer.
- **Waffle share change**: cells keyed by name slide through each other (about 8% overlap mid-flight); key by grid position and let the fill transition carry the change. Owner: chart designer.
- **Treemap rank swaps**: tiles that change order cross mid-flight (15 to 36% overlap). Keep order stable or record a ceiling. Owner: chart designer.
- **WebKit area crossfade** dips to about 75% coverage mid-flight (motion M12). Owner: element engineer.
- **Labels blink on fast streaming bar updates** (hbar, kpi under 500 ms spec swaps): crossfade in place when keys are unchanged. Owner: element engineer.
- **Enter after an arrow key mid-zoom** following a keyboard drill-out does nothing (tooltip blur clears the active mark). Owner: element engineer.
- **Builder snippet SRI** and quoted keys in generated code (security L-2, L-3). Owner: release manager, core engineer.
