# 121 Review — prompt 120

Verdict: **ESCALATE**

Reviewed: 2026-10-07. Fresh session. No fix commit. No new feature. Prompt 122 is not started.

Prompt 120, "Run the drive loop against a fixture spawn", holds. Each of its must-have truths has a test name and a file line. The checkpoint verdict is ESCALATE because Improbability Drive success criterion 5 is false, and the missing wire is a new prompt. It is outside prompt 120's file list. This session does not add it.

`pnpm --filter @hitchhiker/orchestrator test` exited 0: 230 pass, 0 fail. `pnpm -r test` exited 0. `pnpm exec tsc -b --pretty false` exited 0.

## History

One build commit, on top of `728914a` (the 119 review). The message matches the prompt commit line. It has one parent. History was not rewritten. This session does not push.

| Order | Commit | Parent | Message | Prompt commit line |
| --- | --- | --- | --- | --- |
| 1 | `8b7f309` | `728914a` | `test(orchestrator): run the drive against a fixture spawn` | same, prompt 120 |

HEAD at review start was `8b7f309`. The working tree was clean. No commit sits between the 119 review and this one.

The diff adds only the two files the prompt names:

- `packages/orchestrator/src/fixture-run.ts`
- `packages/orchestrator/test/fixture-run.test.ts`

477 insertions. No other path. No package was added. No library was swapped. `@theatre/studio` is absent.

## 120 Run the drive loop against a fixture spawn

### Truths

- CI can run the drive loop without SuperGrok. `runFixture` spawns through the injected `spawnImpl` (`packages/orchestrator/src/fixture-run.ts` lines 220–263). `buildRequest` sets `bin` to `fixture-spawn`, `model` to `DEFAULT_MODEL` (`grok-4.7`), `maxTurns` to 24, and the effort from `effortForTier("Heart of Gold")` (lines 125–136). `guardSpawn` throws `Fixture spawn must not be grok.` when argv[0] is `grok` (lines 106–122). The module imports `node:fs` and `node:path` and the local drive modules. It does not import `node:http`, `node:https`, `node:dns`, or `node:child_process`. Test `a flaky first failure retries, passes, and leaves no running item` (`packages/orchestrator/test/fixture-run.test.ts` line 82) injects the spawn, requires every bin to differ from `grok`, and requires four calls: one `error TS2322` failure, then three exits of 0. Test `fixture-run wires the drive seams and does not import a network client` (line 196) reads the source and rejects those network modules, `child_process`, and `bin: "grok"`. `.github/workflows/ci.yml` runs `pnpm -r test` with `HH_CASSETTE: replay` and no API key. This session's orchestrator run and the workspace run exited 0 with no live credential.

- Approval, retry, and queue state meet in one test. The same flaky test (line 82) calls `withDrive(true)`, which writes `.hitchhiker/drive-approval.json` with `approved: true` (lines 51–59), then asserts `retried === 1`, efforts `["high", "xhigh", "high", "high"]`, four `passed` rows, no `running` row, `lastGoodCommit` matching `/^[0-9a-f]{7,40}$/`, and `nextAction` `Drive idle`. `runFixture` reads that file in `readApproved` (fixture-run.ts lines 56–71) and passes the boolean to `preflight` (lines 227–237) before `saveQueue` or `runPrompt`. A false boolean throws `Drive is not approved.` and never reaches the spawn. Prompt step 7 puts that negative in a second test: `an unapproved drive throws before spawn` (fixture-run.test.ts line 140) requires `FixtureRunError`, that exact message, zero spawn calls, and `loadQueue` still null. The retry itself is `decideTriage` on a `build-failed` verdict, then a second `runPrompt` at the bumped effort (`runBuild`, fixture-run.ts lines 194–212). `classifyRun` of stderr `error TS2322` with a non-zero exit is `build-failed` (`packages/orchestrator/src/sensors.ts` lines 40 and 75–78). Heart of Gold starts at `high` and one bump is `xhigh` (`packages/orchestrator/src/effort.ts` lines 27 and 46–49).

- Push stays denied. The flaky test builds `["git", "-C", dir, "push", "origin", "main"]` and requires `evaluateCommand` to return `deny` with reason `git push is denied` (fixture-run.test.ts lines 129–136). It does not call the spawn with that argv. `guardSpawn` also runs `evaluateCommand` on every spawn argv and throws the deny reason before `spawnImpl` (fixture-run.ts lines 113–116). The policy is the existing one: phrase `["git", "push"]` in `packages/orchestrator/src/policy.ts` line 68. Test `git push is denied` (`packages/orchestrator/test/policy.test.ts` line 38) and test `git -C path push is denied` (line 56) cover the same function. The fixture does not add a policy.

### Key link

`runFixture` calls the four seams in one loop. `insertReviews` builds the queue (`fixture-run.ts` line 239). `saveQueue` and `loadQueue` persist it (lines 240 and 90). `runPrompt` is the runner seam (line 171). `decideTriage` decides retry, stop, or rollback (lines 173–181 and 197–206). Test `fixture-run wires the drive seams and does not import a network client` requires those call names in the source. The flaky test is the run that makes the calls: three builds, one retry, one phase-end review, queue and STATE written under a temp project that `withDrive` deletes.

### Also checked

- Schedule shape. Three ids in one phase produce one review, because the third prompt is both the third build and the phase end. Test `three prompts in one phase gain one review` (`packages/orchestrator/test/schedule.test.ts`) locks that rule. The flaky test requires four passed rows and last id `review-after-003` with kind `review`.
- The review row does not spawn. `stubReview` returns `PASS` (fixture-run.ts lines 75–77 and 245–258). Spawn count is 4, which is three builds plus one retry. No browser.
- An always-failing stub stops. Test `an always-failing stub stops on rollback and does not loop` (fixture-run.test.ts line 161) requires three spawn calls, message `Rollback to hh/backup-2026-10-07`, queue item 0 `escalated`, item 1 still `queued`, `lastGoodCommit` still `""`, and blockers `["001"]`. `decideTriage` returns `rollback` on rule 1 attempt 3 (`packages/orchestrator/src/triage.ts` lines 96–98). `stopFailed` stores that as `escalated`, the only terminal failure status on `QueueFile`, and throws (fixture-run.ts lines 139–156). `SPAWN_CAP` is 12 (line 39) and is not what stops this case.
- Temp directories. `withDrive` uses `os.tmpdir()` and `node:path`, and the `finally` block deletes the directory and asserts it is gone (fixture-run.test.ts lines 51–73).
- `lastGoodCommit` on a pass is the fixture string `abc1234` (fixture-run.ts line 36), passed to `advance`. The prompt requires the field to be set. The test checks the sha shape. The fixture does not call `commitPrompt` and does not create a git object.
- Approval hashes. The test writes `prd`, `context`, and `promptPackage` yeses with sha256 fields. `readApproved` returns true when `approved === true` and does not call `assertDriveAllowed`. That function lives in `packages/engine/src/spec/approve-drive.ts` and is not exported from `packages/engine/src/index.ts`. The orchestrator package export is the barrel only, so a deep import would leave the public surface. Prompt 120's signature has no expected-hash argument, and step 7 defines the negative as `approved: false` throwing before spawn. The boolean gate is `preflight`. This review does not add a second approval policy.
- No `any`. No exclamation mark in the fixture error strings the tests check. No host adapter. No Mostly Harmless gate. No push.

## Live model calls

Prompt 120 forbids a live grok call. The product path is `runPrompt` with `bin: "fixture-spawn"` and the test's spawn. There is no `think()` call and no 011 adapter on this path. The stub is the prompt's spawn, not a stand-in for a live call Matt asked this prompt to make. This session did not set `HH_LIVE=1`. The engine suite still skips `live smoke returns a two-field object`. The assets suite still skips `one low-cost still under a ten cent cap`.

## UI

Prompt 120 did not create or change a file under `packages/app/`. No screen was opened. No 375 or 1440 screenshot. No visual pass is claimed.

## Improbability Drive phase gate

1. TRUE. Each site prompt can be launched as a fresh headless session with model, effort, and a turn cap. `buildArgv` emits `-m`, `--effort`, `--max-turns`, and `--output-format streaming-json`, and it omits `--resume` and `--continue` (`packages/orchestrator/src/runner.ts` lines 186–210). Test `argv carries the headless flags and the assembled prompt` (`packages/orchestrator/test/runner.test.ts` line 62) requires model `grok-4.7`, effort `high`, `--max-turns` `24`, and those resume flags absent. Test `two uuid runs keep the caller ids and those ids differ` (line 152) requires each `runPrompt` to pass the caller's own `--session-id`. Test `maxTurns under 1 or over 80 throws, and the edges spawn` (line 195) locks the cap. The fixture uses that seam with `fixture-spawn`, alias mode, and a turn cap of 24. Alias mode does not send `--session-id` (runner test line 91). A caller that has a uuid supplies a new one per run. The module does not mint one and does not resume.

2. TRUE. Marvin retries a Rule 1 failure in a new spawn and refuses to swap a package that failed to install. `decideTriage` returns `retry` with bumped effort on rule 1 attempts 1 and 2 (`triage.ts` lines 96–97). Test `rule 1 attempts 1 and 2 retry with bumped effort` (`packages/orchestrator/test/triage.test.ts` line 85). The fixture's flaky test is that retry as a second `runPrompt`: stderr `error TS2322`, then exit 0, effort `high` then `xhigh`. Test `a TypeScript error with a non-zero exit is build-failed, which outranks a crash` (`packages/orchestrator/test/sensors.test.ts` line 90) classifies `error TS2322`. Test `a failed install escalates and does not suggest another package` (triage.test.ts line 52) requires type `escalate` and the reason `Do not swap the package.` Test `rule 4 escalates and packageFailed wins over an ok verdict` (line 66) requires the same escalate when the log is green. The fixture passes `packageFailed: false` because its failure is the TypeScript string, not an install.

3. TRUE. Zaphod can return PASS, PASS_WITH_KNOWN_ISSUES, FIX, or ESCALATE, and the screenshot list includes 375 and 1440. `decideReview` returns that union (`packages/qa/src/verdict.ts` lines 82–120). Test `a clean input passes at every allowed round` (`packages/qa/test/verdict.test.ts` line 55). Test `a MISSING truth at round 0 with boots true is FIX` (line 63). Test `a booting site with a MISSING truth at round 2 is a known issue` (line 75). Test `a BLOCKER escalates at round 0 even when the site boots` (line 85). Test `boots false escalates even when every other field passes` (line 109). `REVIEW_WIDTHS` is `375, 768, 1440, 1920` (`packages/qa/src/screenshots.ts` line 5). Test `captureAll requests 375, 768, 1440, and 1920 in order` (`packages/qa/test/screenshots.test.ts` line 10). Checkpoint 119 wrote the 375 and 1440 notes because prompts 116 and 118 changed `packages/app/`. This checkpoint's UI note is the other branch: prompt 120 changed no UI. `decideReview` returns the verdict object and does not write the review file. The written review is the checkpoint file.

4. TRUE. The orchestrator checks the deny list and the secret paths, and a tool install runs only after a yes. `evaluateCommand` is the second gate because hooks fail open (`policy.ts` lines 1–8 and 21–44). Test `policy source is the second gate and does not run commands` (`policy.test.ts`). Test `git push is denied`. `commitPrompt` calls `assertAllowed` on the add and commit argv before the runner (`packages/orchestrator/src/git-flow.ts` lines 84–85). `assertAllowed` calls `evaluateCommand` and throws on deny (lines 163–167). `isSecretPath` matches `.env`, `.pem`, `credentials.json`, and `.hitchhiker/config.json` (git-flow.ts lines 128–160). Test `assertNoSecrets blocks env, pem, credentials, and guide config`. Test `install without a yes runs nothing` (`packages/cli/test/tools.test.ts` line 125) requires exit 1, `Nothing was installed`, and an empty runner log. The fixture calls `evaluateCommand` before its stub and the flaky test denies `git push`. Site-prompt `protected` arrays are stored on the skeleton. The drive loop does not diff those paths after a spawn. Prompt 098 defined the protected paths the orchestrator checks as the secret files above.

5. FALSE. The Drive dashboard does not read queue state from disk, the page a user opens does not show progress or cost, and Pause does not pause the queue. `loadQueue` reads `.hitchhiker/queue.json` (`packages/orchestrator/src/queue-file.ts` lines 159–172). Nothing under `packages/app/` calls `loadQueue` or mentions `queue.json`. `renderDashboard` in `packages/app/src/dashboard.ts` (line 360) takes an in-memory `{ items }` and returns HTML. Its cost line calls `formatCost` (lines 225–234). Its only script toggles day and night (lines 336–354). The Pause button is `data-action="pause"` (lines 126–128) and has no click handler. `pauseQueue` (queue-file.ts lines 180–186) flips `running` to `paused`, and production code never calls it. `hh pause` writes `nextAction` on STATE.md (`packages/cli/src/main.ts` lines 137–146) and does not change queue status. `advance` refuses a queue that already contains `paused` (`packages/orchestrator/src/progress.ts` lines 83–85), which no dashboard action produces. The served route is a different function: `packages/app/src/server/routes.ts` lines 620–622 call the local `renderDashboard(token)` at lines 897–923. That document's heading is `/hh-dashboard`, the phase mark is `01` / `Don't Panic`, and the body says the queue is empty. It does not read a queue file and it does not show a cost line. `queue-file.ts` line 4 says "The dashboard reads this file." The app does not. Review 119 recorded the unwired route as a file-list conflict on prompt 116 and passed that prompt's own truths. The phase criterion is the stronger sentence, and it is false. Prompt 120 does not own `routes.ts` or `dashboard.ts`. Wiring the route, `loadQueue`, and `pauseQueue` plus `saveQueue` is a new prompt. This review does not start it and does not start prompt 122.

The phase does not close.

## Known issues

- Criterion 5, above. Needs a prompt that serves `renderDashboard` from the on-disk queue and persists Pause through `pauseQueue` and `saveQueue`. The page must not launch grok.
- The fixture approval check is the preflight boolean. The three file hashes in the test object are not compared with `assertDriveAllowed`.
- `lastGoodCommit` in the fixture is the constant `abc1234`. The loop does not call `commitPrompt`.
- The fixture retry prompt text is `Build fixture prompt ${id}.` The TypeScript stderr is classified and is not copied into the next prompt.
- `hh pause` and `pauseQueue` are different operations. Only the second one matches the status `advance` treats as a paused drive.

## Conflicts recorded

- `queue-file.ts` says the dashboard reads the queue file. The dashboard renderer accepts an object, and the HTTP route does not load the file.
- v2 section 11.4 lists a stream, screenshots, verdicts, spend, and pause on the dashboard. Prompt 116 step 7 says not to fetch. The renderer labels session, frames, and Lighthouse empty. Review 119 already recorded that. Criterion 5 still fails on disk, progress, cost, and pause for the served page.
- `assertDriveAllowed` is the three-yes gate from prompt 093. It is not on the engine barrel export. The fixture follows preflight, which is what prompt 120 can call without a new package surface.

## File list

From `728914a` through `8b7f309`: 2 files, 477 insertions. They match prompt 120. No file outside that list.

## Verification

`Test-Path hh-build-plan/reviews/121-REVIEW.md` is true once this file is written.

| Command | Exit | Result |
| --- | --- | --- |
| `pnpm --filter @hitchhiker/orchestrator test` | 0 | 230 pass, 0 fail. Includes `a flaky first failure retries, passes, and leaves no running item`, `an unapproved drive throws before spawn`, `an always-failing stub stops on rollback and does not loop`, and `fixture-run wires the drive seams and does not import a network client`. |
| `pnpm -r test` | 0 | knowledge 40 pass; crawler 80 pass; voice 43 pass; engine 542 tests, 541 pass, 1 skipped (`live smoke returns a two-field object`); cli 37 pass; qa 83 pass; app 105 pass; assets 123 tests, 122 pass, 1 skipped (`one low-cost still under a ten cent cap`); orchestrator 230 pass; templates 36 pass. `packages/grok-plugin` and `packages/deploy` are `process.exit(0)`. |
| `pnpm exec tsc -b --pretty false` | 0 | No diagnostics. |

## Verdict

ESCALATE. Prompt 120's three truths hold, the file list matches, and the commands above exited 0. Improbability Drive success criterion 5 is false. Closing the phase would require a new prompt to connect the served dashboard to the queue on disk and to persist Pause. That change is outside this checkpoint's file list and would touch the app server surface. No fix commit. No test was weakened. No push, no deploy, no remote. Prompt 122 is not started.
