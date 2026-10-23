---
id: "250h"
kind: build
phase: mostly-harmless
slice: Forty-Two
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
review_checkpoint_embedded: false
depends_on: []
time_cap_min: 60
title: "De-flake supervise.test.ts: no wall-clock assertions, Windows-safe temp git"
---

# 250h. supervise.test.ts is deterministic (time box 60 min)

Evidence (REVIEW.md §4 Flaky areas, P3 #15): `packages/cli/test/supervise.test.ts` (923 lines) uses real `git`, a retry loop, and wall-clock assertions (around lines 750-759, e.g. `assert.ok(Date.now() - started < 10_000)` after `runBoundedProcess` with `timeoutMs: 300`). Earlier chains hit flaky reds on Windows (`C:\Users\lucid\Desktop\hh-pending-243\BLOCKED-249f-flaky.md`, read only). Also check `packages/engine/test/supervise.test.ts` for the same pattern.

## Do
1. First show the flake: run the file 5 times in a row on this Windows box (`node --experimental-strip-types --test test/supervise.test.ts` in packages/cli, with HH_CASSETTE=replay) and under CPU load if you can do it safely (e.g. two runs in parallel). Note any failures in the report. A test that asserts the new seams (below) must fail before the change.
2. Replace timing assertions with behavior: assert `timedOut === true`, that the child pid is gone (process exit observed), and that the kill-tree path was called (inject the clock/kill function into `runBoundedProcess` or `supervise` if needed; add the seam in `src`, default unchanged). No `Date.now()` deltas in asserts.
3. Temp git: make one helper that creates a temp repo with `git init -q`, sets local `user.name`/`user.email`, `core.autocrlf=false`, `core.fsync`-safe defaults, `commit.gpgsign=false`, uses `-c init.defaultBranch=main`, never touches global config, and removes the dir with `rmSync(..., { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })` (Windows locks). Use it everywhere in the file. Keep the existing skip-without-git behavior.
4. Keep every existing case's intent; do not delete cases.

## Acceptance
- The file passes 5 runs in a row on this box. cli (and engine if touched) tests green, typecheck and lint green.

## Commit
```
test(cli): make supervise tests deterministic on Windows (250h)
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
