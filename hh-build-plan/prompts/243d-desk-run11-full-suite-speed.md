---
id: "243d"
kind: build
phase: improbability-drive
slice: Forty-Two
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
review_checkpoint_embedded: false
depends_on: ["243c"]
title: "Desk Run 11: the full pnpm test is still red after 243c on desk response-time tests"
---

# 243d. Make the full gate green after 243a-243c

## Why
After 243c (945c6685) typecheck and lint pass, but the independent full `pnpm test` from the repo root is red. A clean run with no other test processes on the machine (log: C:\Users\lucid\Desktop\desk-e2e-run11\hh-driver11\logs\gate-243c-test3.log) failed in packages/app:
- test\brief-027.test.ts:91 "draft, review, approve, and a second approve stays one build" (4446 ms): assert.ok(Date.now() - started < 1000) at line 124
- test\brief-030.test.ts:71 "two change requests start one revise and return while it is still running" (7159 ms): assert.ok(Date.now() - started < 1000) at line 104
Earlier runs (gate-243c-test.log, gate-243c-test2.log) also failed "a 30s Guide call leaves GET / and the session route under a second" (GET / took 2573 ms) in packages/app, and in packages/engine test\summary-249b.test.ts ("next card timed out after 2000ms", "first card timed out after 2000ms") and test\site-build-034.test.ts (three tests timed out after 10000ms). Your own 243c report said some of these pass only when run one at a time. A test that passes alone but fails in the full suite is still a red gate.

## Do
1. Establish a baseline: in a temporary git worktree of 80bcb1fc (main), run the same failing files under the full package suite (`pnpm --filter @hitchhiker/app test` and `pnpm --filter @hitchhiker/engine test`) and compare timings with HEAD. Remove the worktree when done.
2. Find the root cause of the slow responses. Look for work that 243a, 243b or 243c put on the request path or the event loop: synchronous file reads or writes, sync scans or JSON work over big files, awaited model or summary calls before a response is sent, retries with real sleeps, locks or renames that wait, timers or child processes that tests leave running and that slow later tests, or a route that awaits a background job (revise, build, recap, suggested host) instead of starting it and returning.
3. Fix the cause in the source so these routes answer well under their limits inside the full suite on this Windows machine. Keep every 243a, 243b and 243c behavior and its tests passing.
4. Do not change, loosen, skip, retime or reorder any existing test, and do not raise any timeout or threshold or lower test concurrency to hide slowness. You may add tests that pin the fast path.
5. Run `pnpm run typecheck`, `pnpm run lint` and the full `pnpm test` from the repo root. All must pass, and the full `pnpm test` must pass twice in a row. Before each full run, make sure no test processes from an earlier run are still alive (only stop processes you started). Commit with message `fix(app,engine): keep desk routes and Guide turns fast in the full suite after 243a-243c (243d)`. Never use --no-verify and do not push.

## Commit
```
fix(app,engine): keep desk routes and Guide turns fast in the full suite after 243a-243c (243d)
```