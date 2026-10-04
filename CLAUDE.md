# mayaCharts

Zero-dependency SVG chart library: a pure `render(spec) -> SVG string` core plus a `<maya-chart>` custom element. Thesis: the browser is the chart engine (Popover + CSS anchor positioning for tooltips, Web Animations API for updates, CSS custom properties for theming, Declarative Shadow DOM for SSR). Built for enterprise hosts: strict CSP with Trusted Types, WCAG 2.2 AA, RTL, localisable strings, SSR, sandboxes that only run pasted JS.

Owner: Bibek Shrestha (GitHub BbekShr). MIT, forever. See STABILITY.md for what is public API.

## Licensing and commercial policy

- The core library stays MIT. Never relicense it, add a source-available or copyleft tier, or move existing features behind a paywall.
- Any revenue comes from things that are not part of the MIT core: support and SLA contracts, hosted services, and separately licensed add-ons. State this plan publicly before acting on it.
- Keep all work on personal equipment, accounts and time. Never use employer code, data, designs or confidential knowledge.
- Do not sell or announce paid offerings until a signed written release from the employer covers open-source and commercial use. A sale to the employer needs disclosure, independent approval and market pricing.
- Accept outside contributions only under a contributor agreement, so ownership stays clear for enterprise buyers.

## Commands

- `npm test` - Vitest (node + one happy-dom file). ~440 tests incl. fuzz, hostile-string, property, perf and leak suites.
- `npm run typecheck` - strict TS 7 (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `erasableSyntaxOnly`: no enums, no parameter properties). Imports use `.ts` extensions.
- `npm run build` - six Vite lib builds (index, element, hierarchy, flow, geo, global IIFE) then `tsc` declarations.
- `npm run size` - gzip budgets from `package.json` `mayaSize`; CI fails when over. Also checks the license banner and that the global build has no top-level `var maya`.
- `npm run e2e` - Playwright on chromium, firefox, webkit, mobile-webkit (interactions only). Builds and serves `site/` itself.
- `npm run dev` - demo site (`/` and `/gallery.html`).
- `npx prettier --check .` runs in CI. No ESLint by design.

Screenshot baselines live in `e2e/__screenshots__/{darwin,linux}/<browser>/`. CI runs in `mcr.microsoft.com/playwright:v1.63.0-noble`; regenerate Linux baselines in that image:
`docker run --rm --ipc=host -v "$PWD":/work -w /work mcr.microsoft.com/playwright:v1.63.0-noble bash -c "npm ci >/dev/null && npm run build >/dev/null && npx playwright test e2e/charts.spec.ts e2e/global.spec.ts --project=chromium --update-snapshots"` then `npm ci` on the host.

## Where things are

- `src/core/render.ts` - the DESIGN NOTE at the top is the contract: pipeline, SVG groups, hydration attributes (`data-maya`, `data-key`, `data-c`, `data-s`, `data-y`, `data-x`, `data-tone`, `data-q`, `data-plot`), key grammar, shell slot order, CSS hooks, keyboard priority. Read it before touching core or element.
- `src/core/types.ts` - the spec (`ChartSpec`), one JSDoc line + example per field. `validate.ts` - all validation, error catalogue, `ONLY` table of field-to-type rules, `HINTS`. `shape.ts` - aggregate, sort, limit (Other bucket), window, hidden, in that order. `format.ts` - per-field Intl formatting (UTC dates). `layout.ts` - `frame()`: axes, ticks, grid, margins, label thinning. `a11y.ts` - title/desc/data table. `registry.ts` - mark registry on a version-keyed global symbol. `strings.ts` - every user-visible string (`spec.text` overrides).
- `src/core/marks/*.ts` - bar (also waterfall), line (also area), scatter, heatmap. Each is a `Mark { noun, axes?, check?, draw }` using only `MarkCtx` closures (`fmt label tone q agg fail t`).
- `src/hierarchy.ts`, `flow.ts`, `geo.ts` - optional modules (treemap/sunburst, sankey, US hexmap). They may import only `registry.ts`, `svg.ts`, `scale.ts`, `ticks.ts` and types; never render/validate/shape/format (they are bundled separately).
- `src/element/` - `maya-chart.ts` (element, events, `view`/`selected`, keydown dispatcher), `animate.ts` (key diff, transform-only WAAPI), `tooltip.ts`, `html.ts` (Trusted Types policy `mayacharts`), and the interactions `measure.ts`, `drill.ts`, `select.ts`, `zoom.ts` as pure reducers plus `mount(host)` handlers.
- `src/styles/theme.ts` - the whole stylesheet as one string (budget 2.45 KB gzip). Tokens `--maya-*`.
- `site/` - demo and gallery (synthetic data in `site/data.ts`; never copy data from elsewhere). `docs/spec.html`, `site/errors.html` (one anchor per error code; error messages link here).
- `schema.json`, `llms.txt` - kept in sync with `types.ts` by `test/schema.test.ts`.

## Rules

- Ponytail: smallest mechanism that works; no abstraction with one implementation; mark every deliberate ceiling with `// ponytail:` and a line in NON-FEATURES.md "Known ceilings".
- No runtime dependencies. No function-valued spec options. No inline `style=` attributes in the element path (CSSOM property writes are fine). Every HTML sink goes through `html()`.
- Every value that reaches markup goes through `esc()`. Data-keyed structures use `Map`; spec-map lookups use `Object.hasOwn`. CSS values from the spec pass the allowlist in `validate.ts`.
- Animation is transform/opacity only, keyed by `data-key`; never animate SVG geometry or CSS `d`.
- Core stays pure: no `window`/`document` (a test deletes them and imports core).
- `x` is always the category and `y` the value, whatever the orientation. `format` and `titles` are keyed by field.
- Changing the spec means updating, together: `types.ts` JSDoc, `validate.ts` (`ONLY`/`HINTS`), README spec tables, `schema.json`, `llms.txt`, `docs/spec.html`, CHANGELOG. `test/schema.test.ts` catches drift.
- New chart types are a `Mark` in core or a module; they never get a plugin API (`register` is internal).
- Prose in docs: plain sentences, no em or en dashes, no emojis, no eyebrow labels.

## Working with agents

Milestones are planned in `~/.claude/plans/` and executed by parallel sub-agents with one owner per file. Contracts (types, validate, registry, stubs) are written first by one serial task so fan-out never edits the same file. Model routing the owner prefers: Opus for contracts and reviews, Sonnet for implementation and tests, Haiku for docs and config (verify Haiku's facts).

## Release

Tags `v*` trigger `.github/workflows/release.yml`: typecheck, test, build, size, `npm publish --provenance`, SRI hash of `dist/maya.global.js` in the step summary. Not yet published to npm. Deploy of `site/` to GitHub Pages happens on every push to main.
