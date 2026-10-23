---
id: "250b"
kind: build
phase: mostly-harmless
slice: Forty-Two
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
review_checkpoint_embedded: false
depends_on: []
time_cap_min: 75
title: "Fail loudly when grok is missing or no build runner is installed"
---

# 250b. A build never "starts" silently (time box 75 min)

Evidence (REVIEW.md F1, F3, P1 #3):
- `packages/engine/src/guide/site-build.ts:759` `ensureSiteBuild` returns `Promise.resolve()` when `runnerFor(projectDir)` is null. `brief-desk.ts:260 startBuild` calls it as `void ensureSiteBuild(...)`, so a build can show as started and do nothing.
- In the review's real walk, queue item 001 failed only later with "grok is not on PATH. Run hh doctor." and the desk had already said the build started.

## Do
1. Tests first (engine, plus app if the desk view changes):
   - No runner installed: starting a build returns/records a clear desk error ("The build could not start: no build runner is installed. Run hh doctor.") and `buildStarted` stays false. No silent resolve.
   - grok not resolvable (inject an env with an empty PATH / a fake `resolveGrokCommand` failure): the pre-flight check fails before `buildStarted: true`, with the GrokMissingError message plus "Run hh doctor." shown on the desk (brief-desk view `error` field or the existing build status line).
   - The live runner (`installLiveBuildRunner`) still returns code 127 for a missing grok, and the queue item records that message (keep current behavior, now covered).
2. Fix: make `ensureSiteBuild` reject (or return a typed failure) when no runner exists; add a pre-flight `grok` resolve in `startBuild` before marking the build started; surface the message in the desk view. Keep `void` call sites from swallowing the rejection (attach a handler that records the error on the desk).

## Acceptance
- New tests fail before, pass after. engine and app tests green, typecheck and lint green.

## Commit
```
fix(engine): fail loudly when grok or the build runner is missing (250b)
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
