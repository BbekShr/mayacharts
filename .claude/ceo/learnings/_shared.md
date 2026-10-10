# mayaCharts CEO, shared learnings

Durable lessons every specialist applies without relearning them. `## Active` is read into every brief: short imperative bullets, about 40 lines at most. Long stories go under `## Archive`. Demote, do not delete.

## Active

- Tween any arc that changes angle as a pathLength circle dash, never a `d` morph: CSS moves A endpoints along the chord and the arc leaves its track (gauge, 2026-10-09).
- Make banded zones lightness steps, not hues at equal alpha (they land near 1:1 against each other); add a 1 px edge tick.

**Bar**

- Beat the strongest reference of the same chart type, not our previous version. The owner supplied an ECharts sankey and a D3 radial as the bar on 2026-10-04 and Plotly's sunburst drill as the motion floor; name the reference in every visual brief.
- A reader gets the main number without hovering: totals, shares and values on the chart, the tooltip adds detail.
- Colour encodes one thing. In flows, the outer column is neutral and colour follows the branch (level-1 category); source-to-target gradients read muddy.

**Verification**

- axe passes non-text contrast it cannot compute (SVG fills, ramps). Compute 1.4.11 contrast from rendered fills for any new ramp or density view.
- An edge probe (every type times empty, one row, all null, zeros, negatives, 1e-300, 1e300, a yDomain that excludes data) found three bugs 947 tests missed; rerun it after any mark or format change. Check rendered text and coordinates, not just throws.
- Feed every new numeric input the extremes (0, 8.64e15, 1e300, NaN-producing dates) before shipping; a loop guarded by `t > max` never ends on NaN.

- Run the e2e baseline in apply runs and open every failing diff: a Firefox-only duplicate title from the late data table hid behind CI retries (2026-10-05).
- Agents sharing one scratchpad overwrite each other's baselines: give every agent its own scratch subdirectory.
- Price a new spec field with a scratch build before promising it: `rules` was estimated at 250 B and measured 950 B.
- Screenshot every visual change at 2x in light, dark, hovered, 360px and one hostile case, and open the files. Agent-reported screenshots have been mislabelled; look at the chart yourself before shipping.
- Motion is verified by frames (0, 120, 270 ms, landed) in chromium AND webkit, never by unit tests alone.
- Playwright per-pixel tolerance let a full sunburst recolour pass against the old baseline. Regenerate changed baselines on purpose, darwin locally and linux in the CI image, then `npm ci`.
- Probe a browser assumption in all three engines with a 10-line Playwright script before building on it (stroke-dash hit testing and CSS `r` animation were probed this way).

**Motion**

- Keys are identity: a key that changes between views re-enters instead of morphing. Keep keys absolute across drills (sankey level in the whole path, hierarchy keys hold the full path).
- Omit opacity in an end keyframe so it lands on the CSS value; animating to 1 flashes translucent marks.
- A coherent zoom has no stagger, clips to the plot, and fades value labels in only after the marks land; axes swap at once.
- Pointer actions focus the chart, keyboard actions focus a mark. Programmatic focus after a click can match `:focus-visible`; never draw a bounding box around an arc.

**Scoping**

- `data-depth` is shared by sunburst rings and sankey nodes; scope sunburst rules and checks with `circle[data-depth]` or `spec.type`.
- A click handler that treats "not a mark" as empty space must list every interactive part (`BUSY` in `drill.ts`).

**Fan-out**

- A theme change lands in index and global too (the core bundle embeds the stylesheet): price theme bytes three times.
- The auto-mode classifier blocks budget and tsconfig edits even from the shell; ask the owner once with the measured numbers, never retry the edit.
- Before matching unkeyed text by position in an update, match by content: axis titles and ticks swap otherwise (2026-10-07).

- Parallel editors in one tree: one owner per file, no builds from editors, temporary `src/styles/wip-<name>.ts` parts for `theme.ts`, folded in by the CEO.
- The element bundle contains core; check every bundle with `npm run size` after merging fan-out work, not per agent.
- Size budgets are the human's call: report an overage with the cut that would fix it. Ponytail trims of repeated code save almost nothing in gzip; quote the feature's real cost instead.
- Haiku docs drafts invent plausible facts (0.4: claimed a bare year "2024" is a date, labelled `data-t` as tone, added a second CHANGELOG section). Diff every Haiku doc against the source before committing.
- Give an agent that needs its own build `isolation: "worktree"`; everyone else shares the tree and never builds.
- A worktree editor runs `npm ci`, never a node_modules symlink: `.gitignore` used to match directories only, a symlink got committed, and merging it replaced the main tree's node_modules with a self-loop (2026-10-09).
- Repeat a timing-sensitive e2e 15 times with 6 workers on the branch and on main before calling a failure a flake: the clamped-tooltip fix failed 3 of 30 there and 0 of 60 on main.
- A fade that ends early on one side of a crossfade needs the other side on the same clock, or the frame washes out (zoomed exits at 0.35, 2026-10-09).
- `isolation: "worktree"` branches from `main`, not the run branch: tell a worktree editor to `git reset --hard <run branch>` as its first step when the run branch has commits.
- Before any e2e run, free port 4173 (`lsof -i :4173`): Playwright reuses a running preview server, so a stale one silently tests an old build.
- Two editors that each need `theme.ts` in separate worktrees still collide on its rules: read both theme diffs together when folding (2026-10-05: one set light-mode ink dark, the other light, for the same hexmap steps).

**Process**

- Probe load jank with per-frame viewBox and animation-clock logs in chromium and webkit before blaming the library: the 2026-10-08 Scale jerk was the demo's own resize timer.
- Editors in one tree race on `git commit` (staged files get swept into another's commit, and the token hook restages README): give concurrent editors separate worktrees.
- Regenerate baselines with `--update-snapshots=all`; plain `--update-snapshots` rewrote 1 of 20 changed images.

- The builder's ThoughtSpot code tab was built from public ThoughtSpot docs only (owner, 2026-10-06). Do not re-flag it as employer knowledge; flag only new host-specific content.

- In gallery runs, let critics walk a worktree pinned to the run branch; editors' live edits reload Vite mid-probe (2026-10-06).
- A theme `transform-origin` on a mark breaks the FLIP's 0 0 contract; set any other origin inside the WAAPI keyframes instead.
- Check a CSS hook beats `[data-maya=labels] text{fill}` before trusting a wip rule: the end-label colour lost on specificity after folding.

- Defaults that vary by chart type go in `resolve()` (`validate.ts`), not as type checks in `render.ts`.
- Changing a spec default is a docs change too: `types.ts`, README, `schema.json` if described, `llms.txt`, `site/docs.html`, CHANGELOG.
- A release that adds a type or moves a budget changes every quoted count and KB in README, site/index.html and CLAUDE.md: grep them in the release run, not later.

## Archive

- 2026-10-04, sunburst drill rebuild: slices became stroked circles with `pathLength` 360 so `r`, `stroke-width` and the dash tween as CSS properties through WAAPI. Dash gaps are not hit-testable in any engine, so the stroke itself is the hit target. Exiting slices fold to the nearer edge of the zoomed span; the centre disk carries the drilled branch's key so the clicked slice grows into it.
- 2026-10-04, other drillable charts: sankey drilled into its level number (keys `n~lv~name` read as the branch), line and area clicks hit keyless band hits, and the treemap showed no names in drill mode. All were invisible to the unit suite and found by clicking every chart in a browser.
