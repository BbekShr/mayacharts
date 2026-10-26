# Upgrade

## Method

1. **Read the upstream changelog and migration guide** for every version you cross, and list the
   breaking changes that touch this repo (grep for each API).
2. **One dependency (or one coupled group) per PR.** Never batch unrelated upgrades.
3. **Upgrade, then fix what broke**, applying the migration guide literally. No opportunistic
   rewrites.
4. **Full bar plus a real run** with `/maya-verify`. Tooling and runtime upgrades break things
   no unit test covers.
5. Lockfile committed. Note the rollback (the previous version) in the PR body.

## In this project

- npm with `package-lock.json`. There are no runtime dependencies and there never will be; devDependencies are TypeScript 7, Vite, Vitest, happy-dom, Playwright and Prettier.
- Playwright is pinned to the CI image `mcr.microsoft.com/playwright:v1.63.0-noble`: a Playwright bump also changes the image in CI and regenerates the Linux baselines in it (command in `CLAUDE.md`), then `npm ci` on the host.
- TypeScript strictness flags (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `erasableSyntaxOnly`) make a TS bump the likeliest to break; `tsconfig.json` is a guarded gate file.
