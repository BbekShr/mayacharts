# Run retros

One line per run: `- YYYY-MM-DD <mode/ID>: <friction observed> → <fix made or P-item filed>`

Runs before 2026-10-25 kept their retro in each board report under `reports/`.

- 2026-10-25 adopt: hand-built org moved into the agent-org layout (standard, 9 agents, L1); friction: agent-org's guard and the existing guard.mjs both want the gate-file and Stop typecheck jobs → kept guard.mjs for those, registered only org_guard.py bash and edit; learnings `## Active` was 64 lines, over the doctor's limit of 60 → demoted the 15 lessons that the agent files and RULES.md already state; 36 lines left.
- 2026-10-27 deep: two review rounds were needed because fix dispatches went out before the first board finished and editors flipped tests to pass; brief editors that an edited assertion needs the CEO's OK, and give each motion fix a t=0-vs-before acceptance check. Machine load (up to 310) and a broken local firefox made every local gate noisy.
- 2026-11-05 light: the unit gate went red three times from another project's Playwright load (photobari) on wall-clock tests the diff never touched; alternating full runs of the branch and main cleared it, and a process item now asks for polling and ratio budgets. Brief Haiku editors that their own commit trailer is fine (one asked to amend).
