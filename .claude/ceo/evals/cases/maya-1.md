---
id: maya-1
agent: maya-reviewer
kind: find-the-bug
base: a2bf357
---

## Task

Review `src/core/svg.ts` (the `memo` row cache) and its callers in `src/core/render.ts` on the
correctness lens. Hosts often keep one data array and update it in place between renders (a
ring buffer that shifts and pushes, or a replaced last row). Report any defect with a failure
scenario.

## Expected

`memo` keys its cache on the array identity, the key and `data.length` only. A host that shifts
one row off and pushes one on (same length) or replaces the last row gets the stale row pass:
old totals, old extents, old labels. The fix (6b5eca6) also drops the entries when the first or
last row changes, and a test in `test/render.test.ts` renders after an in-place shift and push.

## Rubric

- Names `memo` in `src/core/svg.ts` and the (array, key, length) cache key (0-2)
- Gives the same-length in-place update as the failure scenario, with the stale output it causes (0-2)
- Proposes a fix that heals shift/push and a replaced last row without a new array (0-2)
- Proposes a proving test that fails before the fix (0-2)
