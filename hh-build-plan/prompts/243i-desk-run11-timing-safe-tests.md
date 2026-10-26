---
id: "243i"
kind: build
phase: improbability-drive
slice: Forty-Two
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
review_checkpoint_embedded: false
depends_on: ["243h"]
title: "Timing-safe tests: four suites that time out or race under full-suite load on Windows"
---

# 243i. Tests that wait on wall-clock time pass reliably under full-suite load

## Why
243h (b6071b7b on desk-run11-fixes) fixed the Windows temp-dir cleanup errors. Its first gate passed twice (two full `pnpm test` runs green). The second gate, run straight after on the same code with nothing else heavy on the PC, went red twice, each time in different tests, and every failure is a wall-clock timeout or a race, not a wrong value. Typecheck and lint are clean. Logs: C:\Users\lucid\Desktop\desk-e2e-run11\hh-driver11\logs\gate-243h2-test1.log and gate-243h2-test2.log. Failures seen:

- packages/qa test\elevate-loop.test.ts:376 "every regressing pick is refused and nothing is kept": test timed out after 60000ms
- packages/qa test\elevate-rounds-243.test.ts:546 "the loop stops at the round limit when scores keep rising": test timed out after 90000ms
- packages/app test\server.test.ts:891 "hh app prints a loopback URL and hh sessions prints the command table": "hh app did not print a URL" thrown from the timer at server.test.ts:988 after about 38 s
- packages/app test\site-build-034b.test.ts:283 "two Resume posts start one run and the button is held while it is live": at :335 'failed' !== 'passed' after about 89 s

The same tests passed in the two runs just before, so these depend on how fast the machine is at that moment.

## Do
1. For each test above, find what it actually waits on (real sleeps, polling intervals, real child processes, real gate runs, startup of `hh app` through `pnpm`/`node --experimental-strip-types`, backoff delays) and remove the dependence on wall-clock speed: inject the clock or delay function, use fake timers or a zero-delay option the code already has, use tiny fixtures, or await the real event (the child's stdout line, the run's settle promise) instead of a fixed timer. For site-build-034b, find why the run settled as 'failed' (read its run log or the error it records) and fix the real cause, whether a race in the Resume hold logic (production) or a slow nested step in the test.
2. For server.test.ts, the URL wait must wait for the child's output or exit, and on failure report the child's stderr and exit code in the error so a future failure is diagnosable.
3. Search the other packages' tests for the same pattern (a real loop of rounds, real backoff, or a fixed-timer wait on a spawned process) and fix the ones that run longer than about 10 s.
4. Production code may change only to add an injectable clock/delay or to fix a real race; say exactly what changed and why.
5. Do not loosen, skip, `todo` or delete any assertion or test. Do not add `--test-retry` or similar. Do not raise a test timeout as the fix; if a timeout stays, the test must finish far below it.
6. Run `pnpm -r typecheck`, `pnpm lint` and the full `pnpm test` from the repo root twice in a row and make sure both are green; report the durations of the four tests above before and after.

## Done when
- The four tests above each finish in a few seconds and do not depend on machine speed.
- Two full `pnpm test` runs in a row pass on this PC with typecheck and lint clean.
- No assertion was loosened or skipped.

## Commit
```
test(qa,app): timing-safe elevate-loop, elevate-rounds, hh app URL and Resume-hold tests (243i)
```