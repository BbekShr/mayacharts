# Test gap

## Method

1. **Test the invariant, not the current behaviour.** A test that mirrors whatever the code does
   today is not a guard. Write what _should_ be true, from the docs, the contract, or the item.
2. **Prove each test has teeth**: break the code on purpose (in your worktree only), watch the test
   fail, then restore it. A test that can't fail is decoration.
3. **Behaviour over shape.** A test against a stub that doesn't execute the behaviour (ordering,
   filtering, auth, caching) proves a call was made, not that it's right. Prefer real fixtures.
4. **Fast and deterministic**: no network, no wall-clock sleeps, no order dependence.
5. Wire the new tests into the gate that CI runs, or they don't exist.

## In this project

- Vitest, one file per area in `test/`; Playwright specs in `e2e/` on four projects (chromium, firefox, webkit, mobile-webkit); screenshot baselines in `e2e/__screenshots__/{darwin,linux}/<browser>/`.
- CI runs `npm test` and the e2e suite on every PR. New files under `test/` and `e2e/` are picked up by the existing configs, so wiring needs no gate edit; `vitest.config.ts` and `playwright.config.ts` are guarded gate files.
- Docs facts (counts, module table, option lists, tokens, error ids) are tested in `test/docs-facts.test.ts`; README KB figures are not (see the backlog).
