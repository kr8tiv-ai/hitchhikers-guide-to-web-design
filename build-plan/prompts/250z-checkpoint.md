---
id: "250z"
kind: checkpoint
phase: mostly-harmless
slice: Forty-Two
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
review_checkpoint_embedded: false
depends_on: []
time_cap_min: 120
title: "Checkpoint: full tests, typecheck, lint and the LocalTests gate"
---

# 250z. Checkpoint (time box 120 min)

Run, from the worktree root, with `$env:HH_CASSETTE='replay'`:
1. `pnpm -r --no-bail test` (the full unit suite of every package; not the Playwright e2e suite).
2. `pnpm exec tsc -b --pretty false`
3. `pnpm lint`
4. The LocalTests gate rules: root `test` script is still `pnpm -r test`; nothing under `vendor/` or `.hh-driver/` changed since `d529dde5` (`git diff --name-only d529dde5 HEAD`); README.md lost no lines since `d529dde5`.

If anything is red: find the root cause and fix it in the code or the test that is wrong (rules below apply: no skips, no loosening). Re-run until green, or until the time box ends.

Then write `build-plan/250z-CHECKPOINT.md` (this is the one file you may write under build-plan/): date/time (America/Costa_Rica), HEAD before your fixes, per-package pass/fail/skip counts, typecheck/lint exit codes, the gate results, what you fixed, and anything still red with the failing test names. Commit it (with any fixes) as one commit.

## Commit
```
chore(checkpoint): full tests, typecheck and lint for the 250 chain (250z)
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
