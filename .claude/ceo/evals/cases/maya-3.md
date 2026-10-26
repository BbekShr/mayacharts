---
id: maya-3
agent: maya-chart-designer
kind: fix-the-bug
base: 3ec4358
---

## Task

Bug report: "In a treemap or sunburst, when I update the data and two top-level branches swap
rank, they swap colours too, so readers lose track of which branch is which." Fix it in the
hierarchy module, with a proving test.

## Expected

`src/hierarchy.ts` assigns colour slots in size order (`tops` sorted by `big`), so a rank change
re-slots colours. Slots must follow first appearance (`root.children` order) instead (d3f6ae7).
`test/hierarchy.test.ts` asserts a branch keeps its slot when its size rank changes. A good
answer also notes that the drill hue in core must use the same slots (a one-line request to the
core engineer, the follow-up commit), and checks the change in the gallery in light and dark.

## Rubric

- Finds the size-ordered slot assignment in `src/hierarchy.ts` (0-2)
- Switches slots to first appearance without breaking neighbour contrast for the initial render (0-2)
- Proving test that fails on base (0-2)
- Flags the matching drill-hue change outside its perimeter as a request, not an edit (0-2)
