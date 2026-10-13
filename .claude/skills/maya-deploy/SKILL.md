---
name: maya-deploy
description: Bring docs, gallery and size figures in line with what ships, merge the current branch's PR into main, confirm the GitHub Pages deploy, then publish the next version to npm through maya-release. Use when the owner says "deploy", "merge and deploy", "ship it" or "/maya-deploy". In this repo "deploy" always includes the npm publish.
---

# mayaCharts deploy

"Deploy" means four things, in order: the docs and site describe what ships, the PR is merged, the site is live on Pages, and the package is on npm. Asking for a deploy is the explicit release request that `maya-release` requires.

## 0. Docs and site

Before merging, check the branch against what it ships (`git diff main...HEAD`, and the unreleased CHANGELOG section). Fix gaps on the branch, commit and push, then merge. The npm README is frozen per version, so a gap found after the publish costs a patch release.

- **Spec docs**: every new or changed field is in `types.ts` JSDoc, README spec tables, `schema.json`, `llms.txt`, `site/docs.html` and CHANGELOG. `test/schema.test.ts` catches most drift; read the CHANGELOG lines against `site/docs.html` for the rest.
- **Gallery**: every new chart type and every new user-visible variation (a new `form`, `stack`, `arc`, control, drill or table feature) has a tile in `site/gallery.html` / `site/gallery.ts` on synthetic data. `e2e/a11y.spec.ts` runs axe on the gallery, so an untiled feature is also an unscanned one. Missing tiles go to the chart designer.
- **Counts and sizes**: run `npm run build && npm run size` and compare every KB figure and type count in `README.md` (headline, "Small" bullet, type table, module table, signature-types line) and `site/index.html` (meta description, hero, stat list) with the measured gzip. A figure off by more than 0.2 KB, or a stale count, is a gap.
- **Builder**: a new type has a sample in `site/builder-kit.ts` and a place in its groups.

## 1. Merge

- Find the PR for the current branch: `gh pr list --head <branch> --json number,url`. None: stop and ask whether to open one.
- Wait for its CI (`gh run watch <id> --exit-status`). On failure, read `gh run view <id> --log-failed`:
  - "The job was not acquired by Runner" or cancelled with no steps run: a GitHub runner shortage, `gh run rerun <id>` and wait again.
  - A perf or screenshot test that passed on the previous run with no `src/` change since: CI noise. Fix the bound or baseline on the branch, push, wait again.
  - Anything else is a real failure: stop and report.
- `gh pr merge <n> --merge` (this repo uses merge commits), then `git checkout main && git pull`.

## 2. Pages

The push to main starts `Deploy site`, `CI` and `E2E (all browsers)`. Watch all three. Deploy must succeed; CI and E2E must be green before the release in step 3 (its precondition).

## 3. Publish

- Version: the top CHANGELOG heading `## <version> - Unreleased`. If the top section is already dated (nothing unreleased), skip the publish and say so. If there is no version heading, propose one by semver (pre-1.0: new spec fields, defaults or visuals are minor, fixes are patch) and ask.
- Run the `maya-release` skill with that version and follow it fully.

## Report

One short block: docs and site gaps found and fixed (or "none"), PR and merge commit, Pages URL (`https://bbekshr.github.io/mayacharts/`) and deploy result, then the maya-release report (version, tag, workflow URL, `npm view` output). Name anything skipped and why.
