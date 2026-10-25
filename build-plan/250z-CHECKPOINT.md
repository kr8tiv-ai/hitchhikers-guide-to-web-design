# 250z checkpoint

Recorded: 2026-10-25 10:38:37 America/Costa_Rica (Windows zone Central America Standard Time, UTC-6, no daylight saving).

HEAD before this checkpoint (no code fixes): `60dd7077db2d1ab7de859d62ec738cc46bc157a3`  
`chore(lint): make the lint job run eslint with a minimal rule set (250f)`

Working tree was clean. Commands ran from `C:\Users\lucid\Desktop\hh-fix250-wt` with `HH_CASSETTE=replay`. Playwright e2e was not run. `vendor/` was not part of the workspace (`pnpm-workspace.yaml` is `packages/*` only).

## Unit tests

`pnpm -r --no-bail test`  
Exit code: **0**  
Wall clock: 223.31s  
pnpm scope: 12 of 13 workspace projects. The twelve packages below each printed `Done`. The workspace root is the project left out of that scope. Its `test` script is still `pnpm -r test` (see gates). Including it would recurse.

Node's test runner counts. `packages/qa` runs two processes (the parallel `test/` files, then `test-serial/` at concurrency 1). Those two rows are summed in the package total.

| Package | Tests | Pass | Fail | Skip | Duration |
| --- | ---: | ---: | ---: | ---: | ---: |
| app | 431 | 431 | 0 | 0 | 53.3s |
| assets | 131 | 130 | 0 | 1 | 14.0s |
| cli | 170 | 170 | 0 | 0 | 120.5s |
| crawler | 80 | 80 | 0 | 0 | 2.6s |
| deploy | 164 | 164 | 0 | 0 | 27.4s |
| engine | 1032 | 1031 | 0 | 1 | 35.2s |
| grok-plugin | 9 | 9 | 0 | 0 | 15.6s |
| knowledge | 77 | 77 | 0 | 0 | 2.9s |
| orchestrator | 272 | 271 | 0 | 1 | 24.0s |
| qa (`test/`) | 447 | 447 | 0 | 0 | 50.5s |
| qa (`test-serial/`) | 2 | 2 | 0 | 0 | 93.9s |
| qa total | 449 | 449 | 0 | 0 | |
| templates | 57 | 57 | 0 | 0 | 78.3s |
| voice | 59 | 59 | 0 | 0 | 1.8s |
| **Total** | **2931** | **2928** | **0** | **3** | |

The three skips are the existing live gates. Each one passed its guard test and skipped the paid or real-CLI body. They are not failures. This checkpoint does not run a real Grok build, so they stayed skipped.

- `packages/engine`: `live smoke returns a two-field object` — `set HH_LIVE=1 to call the installed grok CLI`
- `packages/assets`: `one low-cost still under a ten cent cap` — `set HH_LIVE=1 and XAI_API_KEY to call Imagine`
- `packages/orchestrator`: `real Grok builds the towel sample into dist and reviews it` — `set HH_REAL_GROK_E2E=1 to run a real Grok build`

The orchestrator guard that did run, and passed, is `the real Grok e2e is skipped without the flag and scope defaults to 3 prompts and 60 minutes`.

`packages/cli` excludes `pack-243.test.ts` with `--test-skip-pattern`, so that file is not in the 170. README says the pack smoke is not part of `pnpm test` (it packs the CLI). It was not run here. The runner reported skip 0 for cli.

## Typecheck

`pnpm exec tsc -b --pretty false` with `HH_CASSETTE=replay`  
Exit code: **0**

## Lint

`pnpm lint` (`pnpm -r run --if-present lint`) with `HH_CASSETTE=replay`  
Exit code: **0**  
Every package eslint script finished `Done` (app, assets, cli, crawler, deploy, engine, grok-plugin, knowledge, orchestrator, qa, templates, voice).

## LocalTests gates

| Gate | Result |
| --- | --- |
| Root `test` script is still `pnpm -r test` | **Pass.** `package.json` scripts.test is `pnpm -r test`. |
| Nothing under `vendor/` or `.hh-driver/` changed since `d529dde5` | **Pass.** `git diff --name-only d529dde5 HEAD -- vendor .hh-driver` printed nothing. The full name list since `d529dde5` has no path under either directory. |
| `README.md` lost no lines since `d529dde5` | **Pass.** `git diff --numstat d529dde5 HEAD -- README.md` printed nothing. The file is identical, so the line count is unchanged. |

Ten commits sit between `d529dde5` and `60dd7077`.

## Fixes

None. The suite, typecheck, and lint were already green. No test was skipped, deleted, retried, or env-guarded by this checkpoint. No failing assertion to quote.

## Still red

Nothing. Fail count is 0 in every package. No failing test names.
