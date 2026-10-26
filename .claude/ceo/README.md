# mayaCharts org: operator notes

The org follows the agent-org layout (github.com/BbekShr/agent-org), adopted on 2026-10-25 from
the hand-built org. The CEO is the `/maya-ceo` skill (`.claude/skills/maya-ceo/SKILL.md`). It
runs as the main loop, delegates to the agents in `.claude/agents/`, and ships behind a PR. This
folder holds its state.

| Path                  | What                                                                                                 | Tracked?                          |
| --------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------- |
| `org.json`            | machine-readable org config (roster, gates, protected paths, skills, policy); read by the doctor     | yes                               |
| `RULES.md`            | the org's rules: verification bar, protected paths, critical rules                                   | yes                               |
| `backlog.md`          | the ONE tracker for open work                                                                        | yes                               |
| `memory/codebase.md`  | verified facts (dated, with file:line evidence) and recurring defect classes                         | yes                               |
| `memory/retros.md`    | one line per run                                                                                     | yes                               |
| `memory/scorecard.md` | every org PR's fate: the evidence for autonomy promotions                                            | yes                               |
| `AUTONOMY.md`         | the trust curve: what each level unlocks, promotion and demotion rules                               | yes                               |
| `PRINCIPLES.md`       | the rules and the incidents behind them                                                              | yes                               |
| `playbooks/`          | how each kind of change (bug fix, perf, feature, refactor, security, upgrade, test gap) is done here | yes                               |
| `evals/cases/`        | known-answer cases mined from git history, for `/org-eval`                                           | yes                               |
| `learnings/`          | `_shared.md` + one file per agent; only `## Active` enters briefs                                    | yes                               |
| `reports/`            | one board report per run                                                                             | yes (this repo keeps them in git) |
| `upstream.md`         | template findings for agent-org itself; local, never sent (feedback is off)                          | yes                               |
| `bin/org_doctor.py`   | the org health check, vendored so runs never depend on the plugin                                    | yes                               |
| `PAUSE`               | **kill switch**: if it exists, every mode aborts                                                     | no                                |
| `DEMOTED`             | a pending demotion the CEO wrote; the human folds it into `org.json`                                 | no                                |
| `.cache/`             | the run-active marker and hook stamps                                                                | no                                |

## Run it

| Command                   | Does                                                                    |
| ------------------------- | ----------------------------------------------------------------------- |
| `/maya-ceo audit`         | read-only board report, zero writes (safe anytime)                      |
| `/maya-ceo`               | light: assess, fix the top 1 to 3, verify, PR                           |
| `/maya-ceo deep`          | every specialist, all findings, fixes batched by owner, PR              |
| `/maya-ceo <ID>`          | one backlog item through the full pipeline, PR                          |
| `/maya-ceo request "..."` | describe a change in plain words: spec, then PR                         |
| `/maya-ceo triage "..."`  | reproduce a bug report on current main: fixed, file it, or fix it       |
| `/maya-ceo gallery`       | live walk of every gallery chart: find, fix, re-drive, PR               |
| `/maya-verify`            | how to run, drive and inspect the library (agents load it; you can too) |
| `/maya-release <version>` | cut an npm release, only when the owner asks                            |

Stop everything: `touch .claude/ceo/PAUSE`. Resume: `rm .claude/ceo/PAUSE`.
Check the org's health: `python3 .claude/ceo/bin/org_doctor.py .` (or `/org-doctor` with the
agent-org plugin installed).

## Guards

`.claude/hooks/guard.mjs` blocks edits to gate files and the `mayaSize` budgets, and typechecks
once per edit batch at Stop. `.claude/hooks/org_guard.py` blocks `gh pr merge --admin`, plain
force pushes and `--no-verify` always; during a CEO run it also blocks merges below L3, pushes to
`main` and `git stash`; it always blocks edits to `org.json`, `AUTONOMY.md`, `DEMOTED`,
`.claude/settings.json` and `.claude/hooks/`. Gate files have no agent override: when one must change, the item goes under "Needs a decision
from the human" and the owner edits it.

## Scheduling

Scheduling unlocks at L2 (see `AUTONOMY.md`). The org is at L1.
