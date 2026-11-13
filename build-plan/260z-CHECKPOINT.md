# 260z checkpoint

Recorded: 2026-11-12 15:54 CST.

Branch: `feat/imagine-first-design`. Base of the chain: `922fd750`. Commands ran from the repo root with `HH_CASSETTE=replay`. Playwright e2e was not run. `vendor/` is not part of the workspace (`pnpm-workspace.yaml` is `packages/*` only).

The green suite is at `42627699` (`fix(templates): pin starters to pnpm 10.32.1`), before this report. The plan commit `edafff48` added the spec, the 260 prompt queue, and `build-plan/run-260.sh`. It is the start of the chain. The deliveries below are 260a through 260g.

## End-to-end

`packages/orchestrator/test/imagine-first-260z.test.ts` restores `samples/towel-day.hhproject` into a temp directory and walks the Imagine-first chain with fake providers, a fake think, and a fake build spawn.

The sample brief is unapproved and names no second page. Brief approval writes the prompt files, and a later sitemap edit does not regenerate prompts that already exist. The harness answers the interview with the golden-path towel sentence and approves a fixture brief whose pages line is `Home, Visit.`

What the test checks:

- Design lock, then three views (desktop, desktop-long, mobile) times K candidates. `design.comps.long` is true. Each fake draw uses the configured model, `n` 1, and a prompt that says `No readable text`.
- One change request, `Raise the towel stack and keep the green stitch.`, redraws only the home mobile view and is stored on the candidate prompt and in `comps.json`.
- Every required view is approved through `approveComp`, which copies the candidate onto `reference/renders/`.
- A motion clip is drafted for the home hero (`MOTION.md` marks it motion-led) and approved.
- The home page prompt, the home hero layout prompt, and the Visit page prompt name the approved comps (`Match this:` and the render paths). The home prompts also name the approved clip.
- The fake shooter mismatches the home page prompt on its first desktop round, then matches. The Visit page prompt stays mismatched. Every other prompt, including art prompts, compares clean. Think returns one blocking desktop fault only on a mismatch round.
- The home page prompt is `passed` after one fix spawn. The hero layout prompt is `passed`. The Visit page prompt is `paused` with queue reason `comp-mismatch` and composite `qa/compare/<visit>/desktop.jpg`. Home metrics are `"clean": true`. Visit metrics are `"clean": false`.

A finished prompt is stored as `passed`. That is the done state.

The harness uses the existing desk hook (`setPageRenderRunner`, `onDesignLocked`, `draftKeyPageRenders`). `goldenPathFixtureHtml` comes from the orchestrator source. `cassetteHeroVariant` is not exported, so the test reads `.hitchhiker/design/variants.json` itself. `STACK-DECISION.md` is overwritten to vite-react after the prompts exist, the same way the golden path does. Prompts were generated for the stack written at plan approval. Fix turns are read from the session `--prompt-file` body (`Comp compare failed.`) because `spawnPrompt` writes a new run record before the spawn callback sees the recovery text.

## What the driver saw, then the fix

The first `pnpm -r --no-bail test` exited 1. Twelve packages passed. `@hitchhiker/templates` failed one test:

- `packages/templates/test/templates.test.ts` — `each starter builds and the blank bundle omits unused libraries`
- `pnpm install --frozen-lockfile` exited 1 with `ERR_PNPM_IGNORED_BUILDS` for `esbuild@0.28.2`.

A scaffolded starter sits outside this repo. Corepack then selected pnpm 12.18.0, the default on this machine. pnpm 12 exits 1 when an install script is not approved. Inside the repo, `packageManager` is `pnpm@10.32.1`, and that version warns and continues. A copy of `astro-default` with the same pin installed and built.

`42627699` adds `"packageManager": "pnpm@10.32.1"` to `packages/templates/astro-default/package.json`, `packages/templates/next-app/package.json`, and `packages/templates/vite-react-world/package.json`. The templates package then passed 57/57. No test was skipped, deleted, or env-guarded. The check still requires the install and the build to exit 0.

The 250z flakes did not fail, so they were not re-run:

- `packages/qa/test/elevate-rounds-243.test.ts` (ENOSPC on `ROUND-3.md`)
- `packages/qa/test/visual-bench-239.test.ts` (`process.exit(2)` vs Windows status `3221226505`, later fixed in `bench/visual/run.ts`)
- `packages/engine/test/site-build-034.test.ts` (spawn timeout under load)
- `packages/engine/test/summary-249b.test.ts` (first card timed out)
- `packages/cli/test/supervise.test.ts` (ancestor push failed)

## What each 260 prompt delivered

### 260a — Imagine client (`abf39feb`)

Multi-reference image edits and reference-to-video on the existing client and provider chain. The edit quote is `quoteEdit` in `prices.ts`. `media-budget.ts` is unchanged.

- `packages/assets/src/imagine-http.ts`
- `packages/assets/src/index.ts`
- `packages/assets/src/prices.ts`
- `packages/assets/src/section-generate.ts`
- `packages/assets/test/imagine-edits-260a.test.ts`

### 260b — Comp sets (`e17e1297`, finish `43264d09`)

Desktop, tall, and phone comps, K candidates, approvals, and the consistency chain. Drafting still goes through the page-render runner.

- `packages/engine/src/config.ts`
- `packages/engine/src/guide/site-build.ts`
- `packages/engine/src/index.ts`
- `packages/engine/src/spec/comps.ts`
- `packages/engine/src/spec/page-renders.ts`
- `packages/engine/test/comps-260b.test.ts`
- `packages/engine/test/desk-run11-245i.test.ts`

### 260c — Motion references (`0e12b32a`)

Optional clips from approved comps for motion-led sections, plus approximate section bands.

- `packages/engine/src/config.ts`
- `packages/engine/src/index.ts`
- `packages/engine/src/mood/analyze.ts`
- `packages/engine/src/spec/comps.ts`
- `packages/engine/src/spec/motion-refs.ts`
- `packages/engine/test/motion-refs-260c.test.ts`

### 260d — Desk comps stage (`176f51e3`)

Pick, change, upload, and approve comps on the existing design-stage desk. `designReadyForBuild` requires the approved comps.

- `packages/app/e2e/brief-027.spec.ts`
- `packages/app/e2e/comp-provider-260d.ts`
- `packages/app/e2e/comps-260d.spec.ts`
- `packages/app/e2e/design-then-build.ts`
- `packages/app/e2e/desk-run8-242d.spec.ts`
- `packages/app/e2e/new-project-242a.spec.ts`
- `packages/app/src/design/components.css`
- `packages/app/src/server/comp-provider.ts`
- `packages/app/src/server/design-stage-desk.ts`
- `packages/app/src/server/reference-desk.ts`
- `packages/app/src/server/routes.ts`
- `packages/app/src/server/server.ts`
- `packages/app/test/comps-desk-260d.test.ts`
- `packages/app/test/site-build-031.test.ts`
- `packages/cli/test/site-build-031.test.ts`
- `packages/engine/src/index.ts`
- `packages/engine/src/spec/comps.ts`
- `packages/engine/src/spec/design-stages.ts`
- `packages/engine/test/build-start-250b.test.ts`
- `packages/engine/test/design-gate-242b.test.ts`
- `packages/engine/test/desk-run11-245a.test.ts`
- `packages/orchestrator/src/golden-path.ts`
- `packages/orchestrator/test/real-grok-e2e-250i.ts`

### 260e — Prompts carry the comps (`35edf89e`)

Approved comps and clips are the visual target. `VISUAL-TRUTH.md` and a `Match this:` line land on page and section prompts.

- `packages/engine/src/guide/site-build.ts`
- `packages/engine/src/index.ts`
- `packages/engine/src/spec/comps.ts`
- `packages/engine/src/spec/design-language.ts`
- `packages/engine/src/spec/site-prompts.ts`
- `packages/engine/src/spec/visual-truth.ts`
- `packages/engine/test/prompts-carry-comps-260e.test.ts`

### 260f — Compare gate (`3471f70b`)

Side-by-side COMP/BUILD, metric floors, one vision pass, a fix turn, then a pause. Reason `comp-mismatch`. Motion compare is a note unless `design.compare.motionBlocking` is true.

- `packages/engine/src/config.ts`
- `packages/engine/src/guide/site-build.ts`
- `packages/engine/src/index.ts`
- `packages/engine/src/queue-file.ts`
- `packages/engine/src/spec/comp-gate.ts`
- `packages/engine/src/spec/comps.ts`
- `packages/engine/src/spec/visible-copy.ts`
- `packages/engine/test/comp-gate-260f.test.ts`
- `packages/orchestrator/src/comp-close.ts`
- `packages/orchestrator/src/golden-path.ts`
- `packages/orchestrator/src/index.ts`
- `packages/orchestrator/src/progress.ts`
- `packages/orchestrator/test/queue-pause-237.test.ts`
- `packages/qa/src/beauty-gate.ts`
- `packages/qa/src/comp-compare.ts`
- `packages/qa/src/driver-plan.mjs`
- `packages/qa/src/index.ts`
- `packages/qa/test/comp-compare-260f.test.ts`

### 260g — Docs, config, and the key (`4dd3a9e3`)

The flow, the files, the config defaults, the provider order, the 5-page API arithmetic, and where a key may live. `hh doctor` names the comp provider and does not print a secret.

- `CHANGELOG.md`
- `README.md`
- `docs/design-library.md`
- `docs/desk.md`
- `docs/imagine-first.md`
- `docs/secrets.md`
- `packages/cli/src/doctor.ts`
- `packages/cli/test/doctor.test.ts`

## Unit tests

`pnpm -r --no-bail test`  
Exit code: **0**

Node's test runner counts. `packages/qa` runs two processes (the parallel `test/` files, then `test-serial/` at concurrency 1). Those two rows are summed in the package total. `pnpm` reported `Scope: 13 of 14 workspace projects`. The thirteen packages below all have a `test` script and all ran. The root `test` script is `pnpm -r test` and is the recursive entry, so it is not a fourteenth package run.

| Package | Tests | Pass | Fail | Skip | Duration |
| --- | ---: | ---: | ---: | ---: | ---: |
| app | 462 | 462 | 0 | 0 | 35.6s |
| assets | 152 | 151 | 0 | 1 | 7.8s |
| cli | 177 | 175 | 0 | 2 | 37.9s |
| crawler | 86 | 86 | 0 | 0 | 0.7s |
| deploy | 164 | 164 | 0 | 0 | 4.3s |
| design-system | 29 | 29 | 0 | 0 | 2.1s |
| engine | 1266 | 1264 | 0 | 2 | 39.8s |
| grok-plugin | 9 | 9 | 0 | 0 | 2.5s |
| knowledge | 77 | 77 | 0 | 0 | 2.5s |
| orchestrator | 275 | 274 | 0 | 1 | 3.8s |
| qa (`test/`) | 485 | 485 | 0 | 0 | 37.5s |
| qa (`test-serial/`) | 2 | 2 | 0 | 0 | 72.4s |
| qa total | 487 | 487 | 0 | 0 | |
| templates | 57 | 57 | 0 | 0 | 28.8s |
| voice | 59 | 59 | 0 | 0 | 1.2s |
| **Total** | **3300** | **3294** | **0** | **6** | |

The six skips are existing guards. Each one passed its guard and skipped the body. This checkpoint does not run a real Grok build or a paid Imagine call.

- `packages/engine`: `live smoke returns a two-field object` — `set HH_LIVE=1 to call the installed grok CLI`
- `packages/engine`: `a Windows batch shim receives the prompt as an argument` — `cmd.exe is the Windows shim` (this host is Linux)
- `packages/assets`: `one low-cost still under a ten cent cap` — `set HH_LIVE=1 and XAI_API_KEY to call Imagine`
- `packages/cli`: `the evaluation can spawn pnpm on this platform (EINVAL regression)` and `spawning pnpm.cmd with the shell off fails on Windows (documents the bug)` — Windows-only
- `packages/orchestrator`: `real Grok builds the towel sample into dist and reviews it` — `set HH_REAL_GROK_E2E=1 to run a real Grok build`

`packages/cli` excludes `pack-243.test.ts` with `--test-skip-pattern`, so that file is not in the 177. README says the pack smoke is not part of `pnpm test`. It was not run here. The runner's skip count for cli is the two Windows tests above.

`packages/app/e2e/comps-260d.spec.ts` is Playwright. `pnpm test` does not run it. It was not run here.

## Typecheck

`pnpm typecheck` (`tsc -b --pretty false`) with `HH_CASSETTE=replay`  
Exit code: **0**

## Lint

`pnpm lint` (`pnpm -r run --if-present lint`) with `HH_CASSETTE=replay`  
Exit code: **0**  
Package eslint scripts finished `Done` (app, assets, cli, crawler, deploy, design-system, engine, grok-plugin, knowledge, orchestrator, qa, templates, voice).

## Still open

- No live Imagine call and no real Grok build in this checkpoint. The three live gates stayed skipped.
- The desk comps Playwright spec was not run.
- A pnpm 12 binary that ignores `packageManager` still exits 1 on an unapproved esbuild install script. Corepack honors the pin.
- `imagineBudgetUsd` defaults to 0, so an API motion quote does not fit and the clip is skipped until the cap is raised. The signed-in CLI path is the default desk path and is not on the price card.
- Motion compare writes a note. `design.compare.motionBlocking` defaults to false.
- The still compare blocks. Out of rounds pauses the queue. There is no advise-only switch for that compare.

## Open questions for Matt

The code already has an answer for each of these. They are still Matt's calls for the first real run.

1. **Key storage.** `readApiKey` uses `XAI_API_KEY` first, then the OS keychain service `hitchhikers-guide` account `xai` (`packages/assets/src/keychain.ts`). A project file is never a source. The default sketch path is the signed-in Grok CLI and does not attach a key. `docs/secrets.md` also says a gitignored `.env.local` is a place for a local secret. Is env-then-keychain the storage to keep?
2. **Default K.** `design.comps.candidates` defaults to 3. The parser accepts integers from 1 to 4.
3. **Cost cap.** `imagineBudgetUsd` defaults to 0. The parser rejects a value outside 0 to 1000 (`IMAGINE_BUDGET_USD_MAX`). Docs price one 5-page API draft at $5.40 when every sketch is an edit at the five-source cap, or $0.90 when each sketch is a plain still. Motion at the site cap adds $0.36 and has to fit under the budget. What cap should the first real run use?
4. **Long comp.** `design.comps.long` defaults to true, so each primary page gets the tall desktop sketch as well as the fold and the phone.
5. **Compare gate on the first real run.** A miss before the last round is one fix spawn, then a reshoot. Out of rounds (`design.compare.rounds` defaults to 2) pauses the queue with reason `comp-mismatch` and the composite paths. Should that still block on the first real run, or should it advise until the floors are trusted?
