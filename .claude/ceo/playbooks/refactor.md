# Refactor

## Method

1. **No behaviour change, provably.** Before touching code, make sure tests pin the current
   behaviour of everything you'll move. If they don't, write those tests first, as their own
   commit.
2. **Small, mechanical steps**, each one green. Rename, move, extract, inline. Never rewrite.
3. **No new features, no bug fixes** in the same diff. Found a bug? Write it down as a `FACT:`
   line and leave it.
4. **The diff should shrink or hold steady.** A refactor that adds net lines needs a reason.
5. Gates green after every step, and the same public behaviour (outputs, API, UI) at the end.

## In this project

- Import boundaries: optional modules may import only `registry.ts`, `svg.ts`, `scale.ts`, `ticks.ts` and types (they are bundled separately). Core never touches `window`/`document` (`test/no-window.test.ts`).
- Duplicated contracts that change together: the spec docs (`types.ts`, `validate.ts`, README, `schema.json`, `llms.txt`, `site/docs.html`), and the hydration attributes in the `src/core/render.ts` DESIGN NOTE versus `src/element/`.
- Pin behaviour first with snapshot-free assertions on rendered SVG (`render(spec)` string checks), then move code. A refactor that moves bytes must show the size table.
