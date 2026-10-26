---
id: maya-4
agent: maya-element-engineer
kind: fix-the-bug
base: 0e05168
---

## Task

Bug report: "When I update the spec of a focused bar chart so that its description changes (new
totals), keyboard focus jumps off the bar I was on, and the bars snap instead of animating their
fill." Fix it in the element, with a proving test.

## Expected

In `src/element/animate.ts` the old `<desc>` stayed first in the node pool, so every kept group
was moved in front of it, which cancels running transitions and drops focus; and `sync()`
removed the `tabindex` the element had set on the focused mark (1edbdc6). The fix removes stale
children before the reorder and keeps `tabindex` in `sync()`. The proving test is an e2e test in
`e2e/interactions.spec.ts` (happy-dom can't see focus or transitions): focus a mark, change the
spec so the description changes, and assert the marks group node and `activeElement` are the same.

## Rubric

- Finds the reorder in front of the stale `desc` as the cause of lost transitions and focus (0-2)
- Finds that `sync()` strips `tabindex` from the focused mark (0-2)
- Proving test in Playwright, not happy-dom, and it fails on base (0-2)
- Checks chromium and webkit, and keeps animation within the transform/opacity contract (0-2)
