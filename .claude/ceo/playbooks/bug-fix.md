# Bug fix

## Method

1. **Reproduce first** on your branch's base with `/maya-verify`. No repro, no fix: report
   CAN'T REPRODUCE with what you tried.
2. **Write the failing test** that captures the bug, and watch it fail for the reported reason.
3. **Find the root cause**, not the symptom: why was the wrong value possible at all? Check every
   caller of the function you're about to change.
4. **Smallest fix** that makes the test pass. No drive-by refactors.
5. **Look for siblings**: the same mistake elsewhere (grep the pattern). Fix them in scope, or list
   them as `FACT:` lines for new backlog items.
6. Re-run the repro: it must now behave correctly, with evidence.

## In this project

- Unit tests are Vitest in `test/<area>.test.ts` (node; `test/element.test.ts` is the one happy-dom file). A regression in a mark or module goes in that type's file (`test/bar.test.ts`, `test/hierarchy.test.ts`); core in `test/render.test.ts` or `test/validate.test.ts`; element behaviour in `test/element.test.ts`, `test/motion.test.ts` or `test/drill.test.ts`.
- happy-dom runs no real animation or layout. A motion, focus, hover or tooltip bug is proven in `e2e/interactions.spec.ts` or `e2e/interactions-drill.spec.ts` (Playwright), in chromium AND webkit.
- Fixtures are synthetic: `site/data.ts` and the inline specs in tests. Never copy data from anywhere else.
- Hostile cases (`__proto__`, empty data, one row, nulls, 1e300, huge epoch ms) are where this library has broken before: try them while looking for siblings. `test/hostile.test.ts` and `test/fuzz.test.ts` are the shared nets.
