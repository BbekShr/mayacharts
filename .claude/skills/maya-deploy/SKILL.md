---
name: maya-deploy
description: Merge the current branch's PR into main, confirm the GitHub Pages deploy, then publish the next version to npm through maya-release. Use when the owner says "deploy", "merge and deploy", "ship it" or "/maya-deploy". In this repo "deploy" always includes the npm publish.
---

# mayaCharts deploy

"Deploy" means three things, in order: the PR is merged, the site is live on Pages, and the package is on npm. Asking for a deploy is the explicit release request that `maya-release` requires.

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

One short block: PR and merge commit, Pages URL (`https://bbekshr.github.io/mayacharts/`) and deploy result, then the maya-release report (version, tag, workflow URL, `npm view` output). Name anything skipped and why.
