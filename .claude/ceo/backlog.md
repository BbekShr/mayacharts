# mayaCharts, open backlog

Single tracker for open work the CEO can pick up. One bullet per item: what, where, why, owner. Delete resolved items (git history keeps them). Every entry is a snapshot of when it was written: verify before acting.

## Needs a decision from the human

- **Size budgets after the 2026-10-06 gallery run**: index 31.15, element 44.68, global 53.59 KB gzip, over the current and the 2026-10-05 approved budgets. Suggested 32000, 45824, 54912 bytes, or the cuts listed in reports/2026-10-06-gallery.md. Owner: human.
- **Builder "ThoughtSpot" tab** (security L-1, policy): confirm it uses public docs only, or make it a generic host snippet. Owner: human.
- **Line legend toggle**: 2 to 8 series lines and areas now drop the legend for end labels, so they lose legend toggling. Confirm or keep both. Owner: human.
- **Apply the approved size budgets** (approved 2026-10-05, second round): index 31488, element 44544, hierarchy 4096, global 53760 bytes (30.75, 43.5, 4.0, 52.5 KB). The guard hook blocks agents from editing `mayaSize`. Owner: human.
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
