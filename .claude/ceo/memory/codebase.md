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

## Recurring classes (a second occurrence becomes a P item at a stronger layer)

- WebKit differs from Chromium on motion and SVG (stale `url(#id)` binding, CSS interpolation, 8x timing). Seen 2026-10-07, 2026-10-10, 2026-10-13. Enforced today by review and e2e on four projects.
- Screenshot baselines hide colour changes under per-pixel tolerance. Seen 2026-10-06 and 2026-10-09. Enforced today by the release manager's baseline check (review layer).

## Clean audits (so discovery skips these grounds)
