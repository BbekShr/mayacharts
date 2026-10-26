# Feature

## Method

1. **Restate the acceptance criteria** from the item. Each one maps to a test or a verifiable
   check before you write code. A criterion you can't test goes back to the CEO.
2. **Find the existing pattern**: the closest existing feature is the template. Reuse its helpers,
   structure, and naming. New infrastructure needs a reason in the report.
3. **Smallest version that meets the criteria.** No speculative options, flags, or abstractions.
4. **Build and test together**, one criterion at a time.
5. **Verify it for real** with `/maya-verify`: run the feature the way a user would, at
   every required viewport or environment. Attach the evidence.
6. Docs, if the feature is user-visible and the project documents features.

## In this project

- A new chart type is a `Mark` in `src/core/marks/` or a module (`src/hierarchy.ts` and siblings), never a plugin API. The closest existing type is the template.
- A spec change is a contract change: the core engineer lands `types.ts` JSDoc, `validate.ts` (`ONLY`/`HINTS`), README tables, `schema.json`, `llms.txt`, `site/docs.html` and CHANGELOG together first, then the marks fan out. `test/schema.test.ts` catches drift.
- New user-visible text goes in `src/core/strings.ts`, overridable by `spec.text`.
- Done means: unit test plus gallery tile, light and dark, 1280 and 360 wide, hover and keyboard, SSR output equal to the hydrated one, and the size table in the report.
- Every deliberate ceiling gets a `// ponytail:` comment and a line in `NON-FEATURES.md` "Known ceilings".
