---
id: "243h"
kind: build
phase: improbability-drive
slice: Forty-Two
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
review_checkpoint_embedded: false
depends_on: ["243g"]
title: "Windows-safe test temp-dir cleanup: no EPERM or EBUSY from rmSync or unlink after a test passes"
---

# 243h. Test temp folders clean up reliably on Windows

## Why
The full `pnpm test` gate for 243g (branch desk-run11-fixes at 7490754f) went red twice on this Windows PC, each time in a different test and always in test cleanup, never in an assertion. Typecheck and lint are clean. Logs: C:\Users\lucid\Desktop\desk-e2e-run11\hh-driver11\logs\gate-243g-test1.log, gate-243g-test2.log, gate-243g2-test1.log, gate-243g2-test2.log. Failures seen:

- packages/grok-plugin test\commands.test.ts:444 "grok inspect lists the installed skills": EPERM on rmSync of %TEMP%\hh-plugin-inspect-*
- packages/qa test\elevate-rounds-243.test.ts:507 and :670: EPERM on rmSync of %TEMP%\hh-elevate-loop-* and %TEMP%\hh-elevate-extra-*
- packages/assets test\three-d.test.ts:632 "Tripo and Meshy poll to a GLB only after a yes, and errors record no charge": EBUSY on unlink of %TEMP%\hh-3d-*\tripo-task_1.glb
- packages/engine test\build-start-250b.test.ts:91 "no build runner records a desk error and does not mark the build started": EPERM on rmSync of %TEMP%\hh-250b-norunner-*

On Windows a file or folder stays locked for a moment after a handle closes, a child process exits, or antivirus/indexing touches it, so a plain `rmSync(dir, { recursive: true, force: true })` or `unlinkSync` in teardown fails intermittently. The same suites pass on other runs, so this is flaky teardown, not a product bug.

## Do
1. Add one shared test cleanup helper (for example `removeTempDir(dir)` in a small shared test-utility module the packages can import, or one per package if cross-package imports in tests are not set up; pick the simplest option that fits the repo's layout and say which in the report). It calls `fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })` (or the async `fs.promises.rm` with the same options), and if it still gets EPERM, EBUSY, EACCES or ENOTEMPTY after retries it logs one short line and returns without throwing, since the test's assertions have already run. Any other error still throws. A missing path is fine.
2. Replace every test-teardown `rmSync`/`rm`/`unlinkSync` of a temp directory or temp file (`os.tmpdir()`, `mkdtemp*`) across all packages' test folders with the helper. Search the whole repo, not just the five tests above.
3. In the tests above, and any others you find doing the same, make sure every file handle, stream, watcher, server, timer and child process the test opened is closed or awaited (`close`, `await once(child, 'exit')`, `server.close()`, `watcher.close()`) before cleanup runs. For three-d.test.ts, make sure the GLB write stream or file handle is closed before the test ends.
4. Do not change production code unless a production function leaks a handle that a test exposes; if so, fix the leak and say so.
5. Do not loosen, skip, `todo` or delete any assertion or test. Do not add `--test-retry` or similar retry-the-test flags. Do not change the test timeout to hide anything.
6. Add a unit test for the helper itself: a stubbed `rmSync` that throws EPERM on the first calls then succeeds is retried; one that always throws EBUSY does not fail the caller; one that throws a different error (for example EINVAL) does throw.
7. Run `pnpm -r typecheck`, `pnpm lint` and the full `pnpm test` from the repo root twice in a row and make sure both runs are green; mention the results in the report.

## Done when
- No test teardown in the repo calls a bare `rmSync`/`unlinkSync` on a temp path.
- Two full `pnpm test` runs in a row pass on this PC with typecheck and lint clean.
- No assertion was loosened or skipped.

## Commit
```
test(all): Windows-safe temp-dir cleanup with retries, close handles before teardown, helper test (243h)
```