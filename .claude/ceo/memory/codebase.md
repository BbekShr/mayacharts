# mayaCharts: verified facts

Read by every agent at boot. One dated bullet per fact, with evidence:
`- YYYY-MM-DD (<run or PR>): claim. file:line`
Delete a fact the moment it's falsified: a stale fact is worse than none. Keep this file around
~120 lines; merge duplicates and drop the least load-bearing. Facts that hold across many runs
and that agents keep needing get promoted into CLAUDE.md (human-approved).

## Baseline (adopted into the agent-org layout, 2026-10-25 @14dede5)

- 2026-10-25 (adopt): `npm run typecheck` exit 0; `npm test` exit 0, 74 files, 1822 tests, 20 s. Build, size and e2e were not re-run at adoption; the last green full bar is PR #105's CI.
- 2026-10-25 (adopt): npm publishes only `dist`, `schema.json` and `llms.txt` (`package.json` `files`), so `CLAUDE.md` and `.claude/` never reach users. package.json
- 2026-10-25 (adopt): two hooks guard this repo. `.claude/hooks/guard.mjs` blocks gate-file and `mayaSize` edits and typechecks once per edit batch at Stop; `.claude/hooks/org_guard.py` blocks forbidden git and gh commands and edits to org control files. .claude/settings.json
- 2026-10-25 (adopt): the dev server is `npm run dev` on http://localhost:5173/mayacharts/ (gallery at `gallery.html`, million rows at `scale.html`), pinned in `.claude/launch.json`.
- 2026-10-25 (adopt): `dist/` is shared per tree; two concurrent builds clobber it. Agents that must build or run Playwright beside editors get `isolation: "worktree"`.

## Deep run 2026-10-27 (ceo/auto-2026-10-27)

- 2026-10-27 (deep): every chart's svg carries empty `g[data-maya=axis-x]` and `g[data-maya=axis-y]`, so testing for those groups does not tell axis charts apart; test for children. src/core/render.ts:~1615
- 2026-10-27 (deep): the mark registry lives on `Symbol.for("mayacharts.marks@" + MAJOR)`, so importing two copies of the library into one process renders both with the last-loaded modules. src/core/registry.ts:17
- 2026-10-27 (deep): a drill that adds or removes the crumb row glides `.maya-box` by its top only (`box.animate([{translate}], ZOOM)`), so bottom- or centre-anchored marks see the height change. src/element/maya-chart.ts:~554
- 2026-10-27 (deep): `drill.ts` `BUSY` is read by select's empty-space clear and by drillOut; every new clickable part (more, sort, axis strips) must be in it. src/element/drill.ts:107
- 2026-10-27 (deep): the kpi tone tspan treats the first character of a change line as the arrow, so templates keep the arrow outside `{n}` slots. src/core/marks/kpi.ts:~173
- 2026-10-27 (deep): `host.js` sits at its 810 B budget and `radial.js` within 10 B of 6340; any edit there needs a cut or the owner's budget call. package.json mayaSize
- 2026-10-27 (deep): firefox fails to launch on the owner's machine ("Could not find profile folder"); CI firefox is green. Local e2e verdicts cover chromium, webkit and mobile-webkit only until fixed.
- 2026-10-27 (deep): `npm run e2e -- --project=X` does not restrict projects (the script names all four); use `npx playwright test --project=X`. package.json
- 2026-10-27 (deep): `npm test` at this commit is 74 files, about 1847 tests; perf.test.ts and beeswarm.test.ts wall-clock budgets fail under host load above about 100 and pass alone.

## Recurring classes (a second occurrence becomes a P item at a stronger layer)

- WebKit differs from Chromium on motion and SVG (stale `url(#id)` binding, CSS interpolation, 8x timing). Seen 2026-10-07, 2026-10-10, 2026-10-13. Enforced today by review and e2e on four projects.
- Screenshot baselines hide colour changes under per-pixel tolerance. Seen 2026-10-06 and 2026-10-09. Enforced today by the release manager's baseline check (review layer).
- A fix that edits a test from "shown" to "absent" or moves it to another size to pass hides a regression. Seen 2026-10-27 twice (gauge warn label, band margin test). Enforced today by the regression and correctness lenses; candidate for a guard check on assertion flips (review layer, process item).
- A layout or motion shift gated on a presence check that is always true. Seen 2026-10-27 (efc8b08). Review layer.

## Clean audits (so discovery skips these grounds)
