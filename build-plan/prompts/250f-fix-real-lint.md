---
id: "250f"
kind: build
phase: mostly-harmless
slice: Forty-Two
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
review_checkpoint_embedded: false
depends_on: []
time_cap_min: 90
title: "Make lint real: eslint per package plus a root config"
---

# 250f. CI Lint actually lints (time box 90 min)

Evidence (REVIEW.md §1, §4 Tooling, P2 #9): root `lint` is `pnpm -r run --if-present lint`, but no package has a `lint` script, so the CI "Lint" job (`.github/workflows/ci.yml:47`, `release.yml:73`) is a no-op. `eslint.config.js` holds a single `no-restricted-imports` rule and eslint is not installed.

## Do
1. Add `eslint` and `typescript-eslint` (pinned exact versions, as root devDependencies; update `pnpm-lock.yaml` with `pnpm add -D -w`). Keep it a flat config in the root `eslint.config.js`.
2. Minimal rule set for `packages/*/src/**/*.ts` and `packages/*/test/**/*.ts`: keep the existing `no-restricted-imports` boundary rule; add `typescript-eslint` parser plus `@typescript-eslint/no-floating-promises` (type-aware, only on `src`), `@typescript-eslint/no-explicit-any` (warn is NOT enough; error, but allow the 2 existing uses with a line disable and a reason), `no-debugger`, `no-unused-vars` via the TS rule with `_` ignore pattern. Ignore `vendor/**`, `**/dist/**`, `node_modules`, generated files, and `packages/templates/**` starters.
3. Add `"lint": "eslint src test"` (or the correct dirs) to every package `package.json` that has TS source, so `pnpm -r run --if-present lint` runs eslint in each package and fails on errors. Do not change the root `test` script.
4. Fix the violations. Where a fix is risky (behavior change), add a narrow `// eslint-disable-next-line <rule> -- reason` instead. For `no-floating-promises`, an intentional fire-and-forget gets `void` plus a handler that records errors; do not change behavior otherwise.
5. Prove it is real: a test (e.g. `packages/engine/test/lint-250f.test.ts`) that asserts every TS package has a `lint` script and the root config includes the rules above; and show in the report that introducing a floating promise makes `pnpm lint` exit non-zero (try it, then revert that scratch change).

## Acceptance
- `pnpm lint` runs eslint in every TS package and exits 0. All package tests still green (run `pnpm -r test` with HH_CASSETTE=replay for packages you edited), typecheck green.

## Commit
```
chore(lint): make the lint job run eslint with a minimal rule set (250f)
```
## Rules (all 250 fixes)
- Work only inside `C:\Users\lucid\Desktop\hh-fix250-wt` (or the lane worktree you were started in). Never read-write, check out, or run anything in `C:\Users\lucid\Desktop\hh-fix-wt`, `C:\Users\lucid\Desktop\hh-library-wt`, `C:\Users\lucid\Desktop\kr8tiv-ai-wt`, `C:\Users\lucid\hh-desk-*`, `C:\Users\lucid\Desktop\desk-e2e-run11` or the main checkout. Never run `git worktree`, `git checkout <other branch>`, `git reset --hard`, `git clean`, `git push`, or anything with `--force` or `--no-verify`.
- Test first: write the new test(s) first, run them, and confirm they FAIL on the current code for the reason in this prompt. Then fix, and confirm they pass. Quote the failing assertion (one or two lines) in your final report.
- Do not loosen, skip, delete, retry-wrap or env-guard any existing test (the only allowed env guard is the one 250i asks for). Do not touch `vendor/`, `.hh-driver/` or `build-plan/` (250z alone writes its report there). Only add to README.md; never shorten it.
- Never start or stop anything on ports 4175, 4188 or 4210 (a desk test may be running). Never run the full Playwright suite. Never run `hh brief --approve`, publish, or deploy. Do not run a real Grok build.
- Verify with `$env:HH_CASSETTE='replay'`: the touched package tests (`pnpm --filter ./packages/<name> test`), `pnpm exec tsc -b --pretty false`, and `pnpm lint`. All must be green before you commit.
- Use PowerShell syntax (`;`, not `&&`). Nobody can answer questions: make the reasonable choice, note it in your report, keep going.
- One commit with the exact message in the Commit section (the `(250x)` tag is how the driver finds it). Leave the tree clean. Do not push; the driver never pushes.
- Source: `build-plan/REVIEW.md` (full code review, 2026-10-23). Line numbers there are for `d529dde5`; re-find the code if it moved.
