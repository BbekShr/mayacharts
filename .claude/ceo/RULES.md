# mayaCharts org rules

Read by every agent at boot, after `CLAUDE.md`. This file holds the org's rules so that
`CLAUDE.md` stays the project's own. Changes here are rule changes: the CEO proposes them, the
human merges them.

This repo runs an agent org in the agent-org layout (adopted 2026-10-25). The CEO is
`/maya-ceo`; agents live in `.claude/agents/`; state lives in `.claude/ceo/` (see its README).
Kill switch: `touch .claude/ceo/PAUSE`.

**Verification bar for ANY change:** `npm run typecheck` and `npx prettier --check .` and
`npm test` and `npm run build` and `npm run size`, plus `npm run e2e` (four browser projects)
when `src/`, `site/` or `e2e/` changed, plus the feature check from the brief. Never weaken a
gate to pass: no skipped tests, loosened assertions, raised size budgets or gate-config edits.

**Cheap gates** (safe in a parallel worktree, no port, no `dist/`): `npm run typecheck`,
`npx prettier --check <files>`, `npx vitest run <files>`. Build, size and e2e are serial and
belong to the release manager (or the CEO); two builds in one tree clobber `dist/`.

**Protected paths** (a PR touching one names the path and why in its body; the human merges it):

- `CLAUDE.md`, `LICENSE`, `STABILITY.md` (public API promise)
- `package.json` (the `mayaSize` budgets, `files`, and the zero-dependency promise)
- Gate files: `tsconfig.json`, `vitest.config.ts`, `playwright.config.ts`, `scripts/size.mjs`,
  `test/theme.test.ts`, `.prettierrc`, `.prettierignore` (blocked by `.claude/hooks/guard.mjs`)
- `.github/workflows/**` (release and Pages deploy), `.githooks/**`
- Org control files: `.claude/ceo/org.json`, `.claude/ceo/AUTONOMY.md`, `.claude/settings.json`,
  `.claude/hooks/**` (blocked by `.claude/hooks/org_guard.py`)
- `.claude/skills/maya-release/**`, `.claude/skills/maya-deploy/**` (they publish to npm)

**User-data paths:** none. The library holds no end-user data.

**Critical rules** (each with its reason; the full list is in `CLAUDE.md`):

- MIT forever: never relicense, never add a paid or source-available tier, never move a feature
  behind a paywall. The owner's commercial policy in `CLAUDE.md` is binding.
- Nothing from the owner's employer: no code, data, designs, names or confidential knowledge in
  `src/`, `site/`, tests or docs. The `ts-object-*` skills are gitignored and stay out of git.
- No runtime dependencies, ever. A new devDependency needs a reason in the PR.
- Every value reaching markup goes through `esc()`; every HTML sink in the element goes through
  `html()` (Trusted Types policy `mayacharts`); no inline `style=` in the element path. Hosts
  run under strict CSP, so one slip breaks every enterprise embed.
- Core stays pure (no `window`/`document`): SSR and sandboxes import it.
- Animation is transform and opacity only, keyed by `data-key`, with the three exceptions named
  in `CLAUDE.md`. Anything else tweens geometry and breaks the motion contract.
- A spec change updates `types.ts`, `validate.ts`, README tables, `schema.json`, `llms.txt`,
  `site/docs.html` and CHANGELOG together; `test/schema.test.ts` catches key drift only.
- Never raise a size budget, merge, tag or publish without the owner's instruction in this run.
  Releases go through `/maya-release`, and only when the owner asks.
- Prose: plain sentences, no em or en dashes, no emojis, no eyebrow labels.

**Memory:** `CLAUDE.md` = rules (human-approved changes only) · `.claude/ceo/backlog.md` = tasks ·
`.claude/ceo/memory/` + `learnings/` = facts. Agents may propose rule changes; only the human
merges them.
