---
id: "241j"
kind: build
phase: improbability-drive
slice: Forty-Two
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
review_checkpoint_embedded: false
depends_on: ["241i"]
title: "Fix Windows EPERM rename flake in app test 'two change requests start one revise and return while it is still running'"
---

# 241j. Fix the Windows EPERM rename flake (packages/app/test/brief-030.test.ts)

## Why
CI run 39387184610 (241c, commit c9714e7e) failed on Windows only: `not ok 55 - two change requests start one revise and return while it is still running`, error EPERM on rename. Rerunning the failed job passed with no code change. That is a race: on Windows a file that is still open (or held by antivirus/indexer) cannot be renamed over, so an atomic write-then-rename fails intermittently. Flaky CI cost us a manual rerun and will keep blocking the chain.

## Do
1. Find the code path the test exercises that does write-temp-then-rename (and any other fs.rename / renameSync in packages/app used for atomic writes). Find the root cause: an unclosed handle, or two concurrent writers to the same target.
2. Fix it properly in product code. Make sure handles are closed before rename, serialize concurrent writes to the same target, and add a small bounded retry on EPERM/EACCES/EBUSY for Windows (for example 5 tries with backoff, under 1s total). Use one shared helper; don't scatter retries.
3. Make the test wait deterministically for the running revise to settle, not on timers.
4. Add a unit test for the helper that simulates EPERM on the first N rename attempts.
5. Run the full app test suite 5 times locally on Windows; all must pass. Then run the repo's normal checks.

## Done when
CI is green on all OSes, the helper is used everywhere atomic renames happen in packages/app, and nothing else changes. Leave the tree clean.

## Commit
```
fix(app): Windows EPERM rename flake, shared atomic rename with retry (241j)
```

