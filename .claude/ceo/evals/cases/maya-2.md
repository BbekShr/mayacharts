---
id: maya-2
agent: maya-core-engineer
kind: fix-the-bug
base: a2bf357
---

## Task

Bug report: "I keep a rolling window of the last 50 points in one array. Each tick I `shift()`
the oldest row and `push()` a new one, then set the spec again. The chart's numbers stop
changing after the first render." Fix it in the core, with a proving test.

## Expected

The row cache `memo` in `src/core/svg.ts` must invalidate when the array's first or last row
changes, not only its length (6b5eca6). A test renders a spec, mutates the same array in place
(shift and push), renders again, and asserts the new values appear. `npm run typecheck` and
`npm test` stay green; the docs comment on `memo` says what still needs a new array (an edit of a
middle row).

## Rubric

- Finds the cause in `memo` rather than patching a mark (0-2)
- The fix heals shift/push and a replaced last row, keeping the cache for unchanged arrays (0-2)
- The proving test fails on base and passes after the fix (0-2)
- Smallest change, no new spec option, comment updated (0-2)
