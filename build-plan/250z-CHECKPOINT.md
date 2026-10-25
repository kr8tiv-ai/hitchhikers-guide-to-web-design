# 250z checkpoint

Recorded: 2026-10-25 11:06:28 America/Costa_Rica (Windows zone Central America Standard Time, UTC-6, no daylight saving).

HEAD before this attempt's fix: `5aebe54c1043b4d8c9c182e947fa001757bcaa9a`  
`chore(checkpoint): full tests, typecheck and lint for the 250 chain (250z)`

That commit is attempt 1, which recorded a green suite. The driver's later check of `packages/qa` exited 1. Commands for this attempt ran from `C:\Users\lucid\Desktop\hh-fix250-wt` with `HH_CASSETTE=replay`. Playwright e2e was not run. `vendor/` is not part of the workspace (`pnpm-workspace.yaml` is `packages/*` only).

## What the driver saw

`build-plan/logs/250z-tests/qa-full.log` (qa only): 447 tests, 445 pass, 2 fail.

- `packages/qa/test/elevate-rounds-243.test.ts` — `the loop stops at the round limit when scores keep rising`  
  `ENOSPC: no space left on device` opening `ROUND-3.md` under `%TEMP%\hh-elevate-loop-*`.
- `packages/qa/test/visual-bench-239.test.ts` — `the runner refuses to start without --run`  
  `3221226505 !== 2`

`build-plan/logs/250z-tests/qa-full-rerun.log` failed only the visual-bench assertion. The elevate test passed on that rerun.

## Fix

`bench/visual/run.ts` called `process.exit(2)` when `--run` was missing. On Node v24.13.1 for Windows that races libuv shutdown: `uv_async_send` hits a handle already marked `UV_HANDLE_CLOSING` (`src/win/async.c` line 76) and the process aborts with status `3221226505` (`0xC0000409`). stderr still contains `bench/visual refuses to start without --run.`

Before the edit, 12 spawns of `node --experimental-strip-types bench/visual/run.ts` returned status 2 eleven times and `3221226505` once, with:

```
Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 76
```

The runner now sets `process.exitCode = 2` and returns. The same probe was then 40/40 status 2, and 32 parallel spawns were 32/32 status 2, with no libuv assertion. The existing test still requires status 2 and `/without --run/` on stderr. No test was skipped, deleted, retried, or env-guarded.

The elevate `ENOSPC` was the disk. During this attempt drive C had about 3.2 GB free. Four leftover scaffold directories in `%TEMP%` from earlier runs (`hh-starters-TXkdle`, `hh-next-1643`, `hh-pack-243-MKZcPM`, `hh-pack-246a`, each more than 40 hours old) were removed. Most of that size is pnpm store hardlinks, so free space moved only to about 3.3 GB. The elevate test was not changed. It passed in the green run below.

## Unit tests

`pnpm -r --no-bail test`  
Exit code: **0**

One earlier run in this attempt, while the machine was under the first suite, failed three tests that then passed alone and passed again in the run recorded here:

- `packages/engine/test/site-build-034.test.ts` — `a throw while spawning the next prompt fails that prompt` timed out at 10000 ms (221 ms alone).
- `packages/engine/test/summary-249b.test.ts` — `the next turn waits for a pending summary before it builds a prompt` threw `first card timed out after 2000ms` (passed alone in 581 ms).
- `packages/cli/test/supervise.test.ts` — `an ancestor check failure is a failed push` threw `fatal: Could not read from remote repository.` on the local bare-repo setup push (passed alone).

Node's test runner counts for the green run. `packages/qa` runs two processes (the parallel `test/` files, then `test-serial/` at concurrency 1). Those two rows are summed in the package total.

| Package | Tests | Pass | Fail | Skip | Duration |
| --- | ---: | ---: | ---: | ---: | ---: |
| app | 431 | 431 | 0 | 0 | 53.2s |
| assets | 131 | 130 | 0 | 1 | 12.3s |
| cli | 170 | 170 | 0 | 0 | 173.3s |
| crawler | 80 | 80 | 0 | 0 | 1.6s |
| deploy | 164 | 164 | 0 | 0 | 21.8s |
| engine | 1032 | 1031 | 0 | 1 | 23.4s |
| grok-plugin | 9 | 9 | 0 | 0 | 11.2s |
| knowledge | 77 | 77 | 0 | 0 | 2.8s |
| orchestrator | 272 | 271 | 0 | 1 | 28.0s |
| qa (`test/`) | 447 | 447 | 0 | 0 | 49.5s |
| qa (`test-serial/`) | 2 | 2 | 0 | 0 | 128.8s |
| qa total | 449 | 449 | 0 | 0 | |
| templates | 57 | 57 | 0 | 0 | 124.6s |
| voice | 59 | 59 | 0 | 0 | 1.7s |
| **Total** | **2931** | **2928** | **0** | **3** | |

The three skips are the existing live gates. Each one passed its guard test and skipped the paid or real-CLI body. This checkpoint does not run a real Grok build, so they stayed skipped.

- `packages/engine`: `live smoke returns a two-field object` — `set HH_LIVE=1 to call the installed grok CLI`
- `packages/assets`: `one low-cost still under a ten cent cap` — `set HH_LIVE=1 and XAI_API_KEY to call Imagine`
- `packages/orchestrator`: `real Grok builds the towel sample into dist and reviews it` — `set HH_REAL_GROK_E2E=1 to run a real Grok build`

`packages/cli` excludes `pack-243.test.ts` with `--test-skip-pattern`, so that file is not in the 170. README says the pack smoke is not part of `pnpm test`. It was not run here. The runner reported skip 0 for cli.

## Typecheck

`pnpm exec tsc -b --pretty false` with `HH_CASSETTE=replay`  
Exit code: **0**

## Lint

`pnpm lint` (`pnpm -r run --if-present lint`) with `HH_CASSETTE=replay`  
Exit code: **0**  
Package eslint scripts finished `Done` (app, assets, cli, crawler, deploy, engine, grok-plugin, knowledge, orchestrator, qa, templates, voice).

## LocalTests gates

| Gate | Result |
| --- | --- |
| Root `test` script is still `pnpm -r test` | **Pass.** `package.json` scripts.test is `pnpm -r test`. |
| Nothing under `vendor/` or `.hh-driver/` changed since `d529dde5` | **Pass.** `git diff --name-only d529dde5 HEAD -- vendor .hh-driver` printed nothing. This attempt's diff is `bench/visual/run.ts` and this report. |
| `README.md` lost no lines since `d529dde5` | **Pass.** `git diff --numstat d529dde5 HEAD -- README.md` printed nothing. The file is identical. |

## Still red

Nothing in the green run. Fail count is 0 in every package.
