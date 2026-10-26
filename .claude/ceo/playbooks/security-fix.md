# Security fix

## Method

1. **Write the exploit as a test first**: the failing input (injection string, cross-user id,
   hostile file) that demonstrates the hole. It must fail before the fix.
2. **Fix at the boundary**, using the project's canonical helper (validator, sanitizer, auth
   check). Never invent a new one, and never fix only the one call site you were shown: grep for
   every path that reaches the same sink.
3. **Fail closed** unless `CLAUDE.md`/`RULES.md` documents a deliberate fail-open.
4. **No secrets in the test, the commit, or the report.** Use obvious fakes.
5. The security engineer re-reviews the diff before it ships, whatever the gates say.

## In this project

- Canonical helpers: `esc()` for every value reaching markup (`src/core/svg.ts`, used by `el()`); `html()` for every HTML sink in the element (`src/element/html.ts`, Trusted Types policy `mayacharts`); the CSS value allowlist in `src/core/validate.ts`; `Map` for data-keyed structures and `Object.hasOwn` for spec-map lookups.
- Sinks to grep: `innerHTML`, `insertAdjacentHTML`, `outerHTML`, template literals that build markup outside `el()`, `setAttribute("style"`, `.style =`, and any new key lookup on a plain object.
- Tests: add the exploit to `test/hostile.test.ts` (or the type's file), and run `npx playwright test e2e/csp.spec.ts --project=chromium` for anything touching the element.
- There are no documented fail-open exceptions.
