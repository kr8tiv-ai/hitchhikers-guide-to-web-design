---
id: "250g"
kind: build
phase: mostly-harmless
slice: Forty-Two
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
review_checkpoint_embedded: false
depends_on: []
time_cap_min: 45
title: "pushcheck: SSH Permission denied (publickey) is auth, not a file lock"
---

# 250g. pushcheck does not retry an auth failure as a lock (time box 45 min)

Evidence (REVIEW.md §4 Flaky areas, P3 #14): `packages/cli/src/improve/pushcheck.ts:17-21` `gitTextIsFileLock` matches `/permission denied/i`, so `git@github.com: Permission denied (publickey).` / `fatal: Could not read from remote repository.` is treated as a Windows loose-object lock and retried `GIT_LOCK_ATTEMPTS` (10) times with backoff.

## Do
1. Tests first (cli): `gitTextIsFileLock` returns false for SSH/HTTPS auth failures (`Permission denied (publickey)`, `Could not read from remote repository`, `Authentication failed`, `403`), and true for real lock text (`unable to write file .git/objects/..: Permission denied`, `index.lock`, `unable to write new index file`). The push path retries 0 extra times on auth failure and reports an auth error ("Push was refused: SSH key or credentials. Check your git login.") instead of a lock message.
2. Fix: add `gitTextIsAuthFailure(text)` checked first; narrow the lock regex so plain `permission denied` only counts with a file/object/index context.

## Acceptance
- New tests fail before, pass after. cli tests green, typecheck and lint green.

## Commit
```
fix(cli): treat SSH permission denied as an auth failure, not a lock (250g)
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
