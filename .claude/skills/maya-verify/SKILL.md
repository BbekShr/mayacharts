---
name: maya-verify
description: How to run, drive, and inspect mayaCharts for real, so agents verify their own changes and reproduce bugs instead of guessing from the code. Covers setup, rendering a spec in Node, the dev server and gallery, driving charts in Playwright (chromium and webkit), screenshots and motion frames, timing and memory measurement, and teardown. Load before any verification, reproduction, perf claim, or visual check.
---

<!-- The org's control skill: the eyes and hands agents use on the running library. The CEO
     maintains it: every time an agent flails at running or driving a chart, the fix lands here
     as a concrete step. -->

# Verify mayaCharts for real

"The code looks right" is not verification. Render it, drive it, look at what it actually does,
and attach the evidence.

## Setup (in the worktree you were given; never the main tree if another agent is working there)

- A fresh worktree needs `npm ci` (Node from `.nvmrc`). Never symlink `node_modules`: a committed
  symlink once replaced the main tree's `node_modules` with a self-loop.
- Playwright browsers: `npx playwright install chromium webkit` if a launch fails.
- One build per tree at a time: `dist/` is shared.

## Start it

- **Pure output** (no server): `node --experimental-strip-types -e "import('./src/index.ts').then(m => console.log(m.render({ type: 'bar', data: [{ x: 'a', y: 1 }], x: 'x', y: 'y' })))"`
  prints the SVG string. Use it for wrong numbers, labels, validation errors and SSR output.
- **Gallery and demo**: `npm run dev`, then http://localhost:5173/mayacharts/ (`/`,
  `/gallery.html`, `/scale.html` for a million rows). The port is pinned in `.claude/launch.json`.
  If a server already answers on 5173, reuse it, but first confirm it serves THIS checkout
  (`lsof -i :5173` and the process's cwd); an old server from another worktree is the classic
  false result.
- **Built output** (what e2e tests): `npm run build`, then Playwright serves `site/` on port 4173.
  Free 4173 first (`lsof -i :4173`): Playwright reuses a running preview server, so a stale one
  silently tests an old build.

## Drive it

- Throwaway script in the repo root, `.agent-<topic>.mjs` (gitignored, can import `playwright`),
  deleted when done. Launch `chromium` AND `webkit`; WebKit is where CSS interpolation, SVG
  `url(#id)` binding and timing differ.
- Charts live in shadow roots: `el.shadowRoot.querySelector("[data-maya=marks]")`. Marks carry
  `data-key`; hydration attributes are listed in the `src/core/render.ts` DESIGN NOTE.
- Update: `el.spec = { ...el.spec, data: newData }`. Drill: click a mark; out by Back, Escape, the
  sunburst centre, or empty space. Keyboard: focus the chart, then arrows, Enter, Escape.
- Themes and widths: `newPage({ colorScheme: "dark", deviceScaleFactor: 2 })`; narrow by setting
  the tile's width to 360px through CSSOM.
- Reduced motion: `newPage({ reducedMotion: "reduce" })`; nothing may move.
- The ThoughtSpot host path is `src/host.ts`; reproduce it with the host test fixtures in
  `test/host.test.ts`, never with a real ThoughtSpot instance.

## Inspect it (runtime eyes)

- **Screenshots**: per chart, light, dark, hovered, keyboard-focused, 360px and one hostile case,
  at deviceScaleFactor 2. Open every file with Read.
- **Motion**: frames at 0, 120, 270, 400 ms and after landing, in both engines (`page.screenshot`
  after `page.waitForTimeout`, or pause animations with `document.getAnimations()`).
- **Contrast**: compute WCAG 1.4.3 and 1.4.11 from rendered fills (`getComputedStyle`), because
  axe cannot read SVG fills. `npx playwright test e2e/a11y.spec.ts --project=chromium` for axe.
- **CSP**: `npx playwright test e2e/csp.spec.ts --project=chromium` (Trusted Types enforced).
- **Timing**: `test/perf.test.ts` envelopes; `node bench/million.mjs` after a build for 1M rows in
  Chromium; `bench/stress.ts` for every type in Node. For a main-thread freeze, record a Chromium
  performance trace (`context.tracing.start({ screenshots: true })`) and report the long tasks.
- **Memory**: `test/leak.test.ts`; peak RSS via `process.memoryUsage()` over the row counts.
- **Size**: `npm run build && npm run size`, each bundle against `package.json` `mayaSize`.
- Not available: no real ThoughtSpot, no mobile device (mobile-webkit is emulated), no Windows.

A performance claim needs a measurement (median and spread over N runs), not a code read. A
memory claim needs a measured delta. A visual claim needs a screenshot at every required state.

## Evidence to attach

- Output bugs: the spec and the relevant SVG fragment, before and after.
- Visual: before and after screenshot paths for every state above.
- Motion: frame paths per engine, and the probe steps so the CEO can re-run them.
- Perf: the command, N, median and spread, before and after, and the bundle size table.

## Teardown

Stop any server you started (`kill` the pid you launched, never a server you found running),
free 4173 and 5173 if you took them, delete your `.agent-*.mjs` scripts and screenshots outside
the scratch directory, and remove your worktree (`git worktree remove <path>`).
