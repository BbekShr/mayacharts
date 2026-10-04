---
name: maya-release
description: Cut a mayaCharts release to npm. Version bump, CHANGELOG date, gate, tag, watch the publish workflow, verify the package. Use only when the human explicitly asks to release or publish a version (e.g. "release 0.4.0", "/maya-release 0.4.0"). Never run it on the CEO's initiative.
---

# mayaCharts release

A pushed `v*` tag runs `.github/workflows/release.yml`: typecheck, test, build, size, `npm publish --provenance --access public`, and the SRI hash of `dist/maya.global.js` in the step summary. A published version can be deprecated but never replaced, so every step before the tag is a gate, not a formality.

## Preconditions (stop and report if any fails)

- The human asked for this release in this conversation, with a version or a bump level. A previous request does not carry forward.
- On `main`, clean tree, up to date with `origin/main`, last CI on `main` green (`gh run list --branch main --limit 1`).
- The version is new: `npm view mayacharts versions --json` does not contain it, and `git tag` has no `v<version>`.
- Semver pre-1.0: new defaults, new spec fields or visual redesigns are a minor bump; fixes only are a patch. If the CHANGELOG's top section is headed with a different version than the one asked for, ask which is right before renaming it.

## Steps

1. Gate on this machine, each redirected to a file with its exit code: `npm run typecheck`, `npm test`, `npx prettier --check .`, `npm run build`, `npm run size`, `npm run e2e`. Any failure stops the release.
2. On a branch `release/v<version>`: set `version` in `package.json` (`npm version <version> --no-git-tag-version`, which also updates the lockfile), and change the top CHANGELOG heading from "Unreleased" to `## <version> - YYYY-MM-DD` (today, from `date +%F`). Check `STABILITY.md` if a public API changed.
3. Commit (`Release <version>: <one-line summary>`), push, open a PR, wait for CI, merge it (the human asked for the release, which covers this merge).
4. Tag the merge commit on `main`: `git tag v<version> && git push origin v<version>`.
5. Watch the run: `gh run watch $(gh run list --workflow release.yml --limit 1 --json databaseId -q '.[0].databaseId')`. If it fails before `npm publish`, fix forward on a new patch version; do not move the tag.
6. Verify: `npm view mayacharts@<version> version dist.integrity`, and that the package page shows provenance. Copy the SRI line from the run summary into the report.

## Never

- Never publish from this machine (`npm publish` locally). The workflow's provenance is the point.
- Never delete or move a pushed tag, and never `npm unpublish`.
- Never announce, price or sell anything as part of a release (CLAUDE.md licensing and commercial policy).

## Report

Version, PR and merge commit, tag, workflow run URL and result, `npm view` output, the SRI line, and anything skipped with the reason.
