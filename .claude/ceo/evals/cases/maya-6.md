---
id: maya-6
agent: maya-repro
kind: triage
base: 1edbdc6
---

## Task

Bug report against 0.12.0: "When I update the spec of a focused bar chart so that its description
changes, keyboard focus jumps off the bar I was on, and the bars snap instead of animating."
Reproduce it on current main (here: the base commit) and give a verdict.

## Expected

`ALREADY FIXED in 1edbdc6`: on the base the hbar tile keeps its marks group node and focus after
a spec update that changes the description (the e2e test "a changed description keeps the marks
group and focus on a mark" passes), and `git log -S` on the `tabindex` change in
`src/element/animate.ts` names 1edbdc6.

## Rubric

- Drives the real element in a browser rather than reading code (0-2)
- Verdict ALREADY FIXED with the commit named (0-2)
- Evidence: the probe steps and their output (0-2)
- No edits to the main tree; the worktree is removed (0-2)
