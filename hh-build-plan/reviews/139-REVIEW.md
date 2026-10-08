# 139 Review — prompt 138

Verdict: **ESCALATE**

Reviewed: 2026-10-08. Fresh session. No fix commits. No new feature. Prompt 140 is not started.

Prompt 138's four must-have truths hold. Each one below has a test name and a file line. The phase does not close. Success criteria 3, 4, and 5 are FALSE, and each one needs a new prompt. Wiring them would be a new surface (a drive caller, a phase-start mount, or a cassette replay). That is outside this checkpoint's file list and outside the two-fix limit.

## History

The required build message is present. Two later commits sit on top of it. They are not a squash, and they do not hide a failed 138 truth. History was not rewritten. At review start `main` was ahead of `origin/main` by these three commits, so they were not published. This session does not push.

| Order | Commit | Parent | Message | Role |
| --- | --- | --- | --- | --- |
| 1 | `558cbc9` | `cc5438c` (137 review) | `feat(cli): add mostly-harmless and elevate commands` | prompt 138, matches the commit line |
| 2 | `3571dfa` | `558cbc9` | `fix(types): before-we-jump write-back and card state types` | two type lines, outside the file list |
| 3 | `eed978e` | `3571dfa` | `test(cli): drop the deep qa import from the mostly-harmless test` | boundary fix inside the 138 test file |

HEAD at review start was `eed978e`. The working tree was clean. `.hitchhiker-dev/summaries` is absent, so the commit bodies are the summaries. No package was added. `@theatre/studio` is absent.

`558cbc9` touches only the four files the prompt lists: `packages/cli/src/main.ts`, `packages/cli/test/mostly-harmless.test.ts`, `packages/qa/src/report.ts`, `packages/qa/test/report.test.ts`.

`3571dfa` changes `packages/engine/src/phases/write-back.ts` (annotate the spread as `Record<string, unknown>`) and `packages/app/src/before-jump/cards.ts` (call `waitForChange` directly). `waitForChange` returns at once unless `session.screen` is `"settling"` (`cards.ts` lines 346–350). The old check was dead under the narrowed type. Rendered markup and CSS are unchanged. Reverting it would bring back the type errors the commit names. It is not a new feature. This review leaves it.

`eed978e` stops the CLI test from importing `packages/qa/src/report.ts`. That static import fails `the repo has no deep imports and no package escapes` (`packages/engine/test/boundaries.test.ts` line 90). The test now asserts the section lines the real renderer prints. It still requires `## Phone`, the injected score, `real mobile`, `Total: 86.5`, and `Status: PASS`.

## 138 Add hh mostly-harmless and hh elevate commands with the QA report

### Truths

- QA commands exist and are safe by default. `parseQaArgs` starts `yes` at false and throws `--yes is rejected for mostly-harmless.` (`packages/cli/src/main.ts` lines 184 and 197–199). `runElevatePlan` pushes `Elevate does not run without --yes.` and returns exit 2 before `apply` when `yes` is false (lines 273–275). `routeElevate` returns that same sentence, and does not call the round command, when `--pick` is anything other than `none` or `--approve` is present without `--yes` (lines 338–352). Test `parseQaArgs reads the project and leaves yes off` (`packages/cli/test/mostly-harmless.test.ts` line 21). Test `--yes on mostly-harmless is rejected` (line 50) requires exit 2 and an apply stub that is not called. Test `elevate without yes does not apply` (line 71) requires exit 2, zero apply calls, the planned line, and the exact refusal sentence. Test `a pick does not run without yes` (line 150). Test `the safe elevate command is what hh elevate runs` (line 162). Test `doctor, pause, and resume still parse` (line 183).

- The phase stops before deploy. `runQa` resolves the project, then calls `runElevatePlan` or `runMostlyHarmless` (`main.ts` lines 307–325). Neither function builds a deploy argv. The source from `export async function runQa` through `isRoundElevate` contains no `deploy`. Test `runQa source does not construct a deploy argv` (mostly-harmless.test.ts line 140) reads that slice and `runQa.toString()`. Test `elevate without yes does not apply` requires the stdout to omit `deploy`. No host adapter was added. So Long is not started.

- The report does not hide a blocker. `overallStatus` returns `BLOCKER` when phone, accessibility, or weight is not `PASS`, or when `juryStatus` is not `PASS` (`packages/qa/src/report.ts` lines 73–78). An empty blocker list becomes the line `no detail` (lines 40–49 and 57–69). A passing phone section is the only place `real mobile` is printed (lines 40–43). `runMostlyHarmless` exits 1 when the input blocks or the Overall section contains `BLOCKER` (`main.ts` lines 224–237 and 298–299). With no injected report, `blockedReport` is phone, accessibility, and weight `BLOCKER` plus jury `FAIL` (lines 213–221). Test `a single blocker flips overall and keeps every section` (`packages/qa/test/report.test.ts` line 74). Test `a jury fail flips overall when the other gates pass` (line 91). Test `empty blocker reasons still block and say no detail` (line 103) requires `no detail` in Phone and Overall, and requires `real mobile` to be absent. Test `mostly-harmless exits 1 when the report is a blocker` (mostly-harmless.test.ts line 122).

- It is generated from structured results. `renderQaReport` takes `QaReportInput` and returns markdown with headings Phone, Accessibility, Weight, Jury, and Overall (`report.ts` lines 12–18 and 86–96). Jury total is one decimal (lines 52–55 and 93). `<`, `$`, and `!` are stripped, not escaped as HTML (lines 22–24). Test `a passing report names the real mobile run and the four scores` (report.test.ts line 51) requires `real mobile`, Performance, Accessibility, Best Practices, SEO, `Total: 86.5`, and Overall `PASS`, and rejects `$`, `!`, `<`, and `award`. Test `angle brackets and prices are stripped instead of escaped` (line 120) requires `script>alert(1)/script>`, `Price is 12`, and `under 2`, and rejects `&lt;`. Test `mostly-harmless prints a before-we-jump question and the report` (mostly-harmless.test.ts line 103) injects that structured input, does not pass a render stub, and requires those section lines in stdout. The command loads `renderQaReport` by file URL (`main.ts` lines 240–246).

### Key links

`runMostlyHarmless` calls the report renderer with the gate-shaped input (`main.ts` lines 286–288). `runElevatePlan` calls the injected `apply` seam once, and only after `--yes` (lines 273–278). Test `elevate with yes calls apply once` (mostly-harmless.test.ts line 88) requires that one call and exit 0. The round command from prompt 131 stays on `detail`, `copy`, `--url`, `--pick`, and `--approve` (`main.ts` lines 328–358). Test `elevate help still reaches the round command` (line 156).

### Also checked

Missing `--project` exits 2. Test `missing project exits 2` (mostly-harmless.test.ts line 41). Unknown flags throw. Test `unknown flags throw` (line 35). The report path is `.hitchhiker/QA-REPORT.md` under the project, built with `node:path`. Test `hh mostly-harmless prints the report path and does not write it` (line 169) requires exit 1, `BLOCKER`, no `!`, and `existsSync` false. The command prints the path it would write. It does not write the file. That matches the prompt goal.

`loadQuestions` calls `beforeWeJump` with an empty answer list, empty approvals, and `hasLegalPage: false` (`main.ts` lines 249–263). The project directory is not read. Questions on the real command are the empty-project list, not the files in `--project`. The prompt's own test injects the questions so a built site is not required. See Known issues.

`hh elevate --project <dir>` with no round flag does not call `elevateRound` or `planElevate`. With `--yes` and no injected `apply`, it prints `Nothing was written.` and exits 0 (`main.ts` lines 277–278). The refusal without `--yes` is what the prompt requires. The real round still runs when `--url`, `--pick`, `--approve`, `detail`, or `copy` is present, and a pick other than `none` now also needs `--yes`.

### UI

Prompt 138 changes no file under `packages/app/`. No screen was added or restyled. The type commit's one line in `cards.ts` does not change the HTML or the stylesheets. This review did not open a browser and did not take 375 or 1440 screenshots. No visual pass is claimed.

### Live model calls

Prompt 138 adds no model call. `beforeWeJump` is pure and has no adapter argument (`packages/engine/src/spec/before-jump.ts` lines 5–8 and 82–86). `renderQaReport` does not call `think`. D-003's live calls for the reviewer and Elevate stay on the earlier paths: `zaphodReview` and `planElevateModel` take `think` from `packages/engine/src/ai/` with a schema. Those cassette tests are cited under the phase gate. This command does not replace them with a stub, and it does not invoke them.

## Phase gate: Mostly Harmless

Source: `hh-build-plan/ROADMAP.md` lines 240–246.

1. TRUE. Lighthouse on a real mobile run is 90 or more in all four categories on every route, or the gate is a BLOCKER. `lhciCollectConfig` sets `numberOfRuns: 3`, `formFactor: "mobile"`, and `minScore: 0.9` on performance, accessibility, best-practices, and seo (`packages/qa/src/lhci-run.ts` lines 68–97). `judgeRoute` scores each category with `median` of the runs, sends that object and each run through `evaluateLh`, and returns `BLOCKER` when a run is short (`MOBILE_RUNS` is 3, lines 23 and 271–305). `evaluateLh` blocks a missing phone and any phone score under the floor, and the floor cannot be stored below 90 (`packages/qa/src/lighthouse-gate.ts` lines 50–51, 115–117, and 196–216). `runGates` requires every lighthouse row to be `PASS` with scores (`packages/qa/src/site-once-over.ts` lines 196–203). Test `phone performance 89 fails and 90 passes when the other three are at least 90` (`packages/qa/test/lighthouse-gate.test.ts` line 76), plus the accessibility, best-practices, and SEO twins. Test `a missing phone run is a blocker` (line 161). Test `the lighthouse config keeps three mobile runs at 90` (`packages/qa/test/live-gates.test.ts` line 353). Test `the starter fixture clears the real phone gates` (line 436) requires three or more runs at 90 on `/` and `/credits`. It passed when QA ran alone and when the workspace ran one package at a time. See Commands for the parallel miss.

2. TRUE. axe serious/critical, console errors and failed requests at zero, links, weight, and the anti-slop lint are on one command path. `runGates` runs LHCI, `runAxe`, `runConsoleGate`, `checkLinks`, and `evaluatePage`, and fails closed when a runner throws (`site-once-over.ts` lines 176–211). `toGateResult` marks console `BLOCKER` unless errors and failed requests are both 0 (`packages/qa/src/elevate-loop.ts` lines 66–86). `runConsoleGate` counts both at 375, 768, 1440, and 1920 (`packages/qa/src/console-gate.ts` lines 26–69). Serious and critical axe hits block (`packages/qa/src/a11y-gate.ts`, test `a serious axe hit blocks` and test `a critical axe hit blocks` in `packages/qa/test/a11y-gate.test.ts` lines 35 and 41). `hh elevate` with `--url` calls `elevateRound`, whose `gates` callback is `loadGates` → `runGates` (`packages/cli/src/commands/elevate.ts` lines 179–203 and 306–328). The same round calls `planElevateModel`, and `changeRejected` drops a change when `lintSlop(change, "site")` hits (`packages/qa/src/elevate.ts` lines 160–162; `elevate-loop.ts` line 529). Test `the starter fixture clears the real phone gates` requires console 0, axe `PASS`, no broken links, and weight `PASS`. Test `magnetic and exclamation changes are skipped and the plan is kept` (`packages/qa/test/elevate.test.ts` line 111). `hh mostly-harmless` does not call `runGates` or `lintSlop`. v2 §18 says `/hh-mostly-harmless` does gates and jury. Prompt 138 says not to spawn a browser and to render from supplied results. That conflict is recorded under Known issues. The criterion's one command is the elevate round, not the new report command. `runGates` itself does not call `lintSlop`. A page that already contains lorem is not blocked by the gate object. The lint runs on the proposed change.

3. FALSE. Zaphod does not review a site with Grok vision on any product path. Elevate does propose at most eight upgrades and does refuse a regressed gate. `ELEVATE_CAP` is 8 (`elevate.ts` line 34). Test `nine valid notes yield truncated true and the first eight in order` (`elevate.test.ts` line 69). `elevateRound` slices to that cap (`elevate-loop.ts` lines 530–536). `runElevate` rolls back when a gate flips to `BLOCKER` or is still `BLOCKER` (`packages/qa/src/elevate-run.ts` lines 98–105). Test `a cassette round keeps one pick and refuses a Lighthouse regression` (`packages/qa/test/elevate-loop.test.ts` line 194). Test `one gate that stays BLOCKER refuses even when the other stays PASS` (`packages/qa/test/elevate-run.test.ts` line 107). `zaphodReview` does send shots, a schema, and task `zaphod-vision` through `think` (`packages/qa/src/zaphod-vision.ts` lines 230–255). Test `zaphod vision replays a recorded cassette through the adapter` (`live-gates.test.ts` line 124) uses `packages/engine/src/ai/think.ts`, asserts `--json-schema`, and replays without a second spawn. Nothing under `packages/orchestrator`, `packages/app`, or `packages/cli` calls `zaphodReview`. The drive fixture review is `stubReview`, which returns `PASS` and the comment says it uses no browser and no model (`packages/orchestrator/src/fixture-run.ts` lines 74–77 and 245–248). A queued review does not send screenshots to Grok. Needs a prompt that calls `zaphodReview` from the drive, with shots, through the 011 adapter. Putting that call in `hh mostly-harmless` would spawn a browser and a model, which prompt 138 forbids. This review does not add it.

4. FALSE. Before-we-jump does not run at the start of every phase in the product. `onPhaseStart` accepts `babel-fish`, `deep-thought`, `improbability-drive`, `mostly-harmless`, and `so-long`, builds the list with `beforeWeJump`, and `writeBack` stores answers in the owning files (`packages/engine/src/phases/before-jump-hook.ts` lines 90–108). Test `every phase start uses the same file-built list` and the write-back tests in `packages/engine/test/before-jump-hook.test.ts` cover that behavior when the function is called. The only production caller is `startBeforeJumpServer` (`packages/app/src/before-jump/cards.ts` line 147). The app routes, the orchestrator, and the CLI phase commands do not call `onPhaseStart` or `startBeforeJumpServer`. The e2e spec starts the server itself. `hh mostly-harmless` prints questions from an empty `beforeWeJump` input and writes nothing. Needs a prompt that invokes `onPhaseStart` when a phase starts. Review 137 already recorded the missing mount. The phase is ending with that mount still absent.

5. FALSE. The Towel & Tea fixture does not replay from cassettes. It replays through the compilers. Test `replay Towel and Tea through the brief, brand, and motion compilers` (`packages/engine/test/dogfood.test.ts` line 201) reads `evals/towel-and-tea/transcript.json`, `expected-brief.json`, and `expected-brand.json` and calls `compileWhy`, `renderBrief`, `compileBrand`, `renderPrd`, `lintClaims`, `decideStack`, and `planMotion`. The test file does not call `think` and there is no cassette directory under `evals/towel-and-tea`. Prompt 136 required that compiler replay and forbade a live call. The roadmap sentence asks for cassettes. Those two docs disagree. The opt-in live half is present: `evals/dogfood-live/run.ts` returns before any spawn unless `HH_LIVE` is exactly `"1"` (line 103) and then runs three Towel and Tea prompts through `runLivePrompt`. Test `live dogfood stays off unless HH_LIVE is exactly 1` (`packages/orchestrator/test/live-runner.test.ts` line 228) runs the script with the variable removed and requires no `REPORT.md`. This review did not set `HH_LIVE` and did not build the live site. The criterion is a conjunction. The cassette half is false, so the criterion is false. Needs a prompt if a cassette replay is still required. This review does not add one, and it does not replace the compiler test.

## Known issues

- `hh mostly-harmless` does not run the gates. With no injected report it prints a structured blocker, `No gate results were supplied.`, for phone, accessibility, and weight, and jury `FAIL`. That does not hide a blocker. It also does not report a real pass. v2 §18 names this command for gates and jury. Prompt 138's steps say to inject results and not to spawn a browser. The implementation follows the steps.

- `hh elevate --project <dir>` does not read a plan from disk. It prints `No planned items.` unless a caller injects `planned`. `--yes` without an injected `apply` writes nothing.

- Default before-we-jump questions ignore `--project`. They are `beforeWeJump` on an empty answer list.

- Parallel `pnpm -r test` can starve LHCI. One run exited 1 because `/` had 2 mobile runs, so the gate returned `BLOCKER` with `Expected 3 mobile runs and found 2.` That is the gate failing closed. The same test passed in the isolated QA run and in `pnpm -r --workspace-concurrency=1 test`. This review does not weaken the assertion and does not retry inside `runLhci`. A retry would be outside prompt 138's file list.

- The before-jump desk's default `think` is still the fixed no-contradiction result from review 137. Prompt 138 does not touch it. D-003 does not name Before-we-jump.

## Commands

Run from the repo root on `eed978e`, before this docs commit:

- `pnpm --filter @hitchhiker/cli test` exited 0 and printed `No projects matched the filters`. The CLI package name is `hitchhikers-guide`, not `@hitchhiker/cli`. That exit code is not evidence.
- `pnpm --filter hitchhikers-guide test` exited 0. 51 tests, 51 pass, 0 fail.
- `pnpm --filter @hitchhiker/qa test` exited 0. 201 tests, 201 pass, 0 fail. The starter fixture passed in about 80 seconds.
- `pnpm exec tsc -b --pretty false` exited 0.
- `pnpm -r test` exited 1. QA was 200 pass, 1 fail: `the starter fixture clears the real phone gates`, 2 of 3 mobile runs. Every other package that finished had 0 failures: crawler 80, knowledge 40, voice 43, engine 590 pass and 1 skipped, deploy (script completed), cli 51, assets 123 pass and 1 skipped, app 118, orchestrator 237, templates 36. The engine skip is `live smoke returns a two-field object`, which stays off unless `HH_LIVE=1`. pnpm stopped the recursive run on the first failure.
- `pnpm -r --workspace-concurrency=1 test` exited 0. The starter fixture passed in about 85 seconds. This is not the prompt's exact command. It is the check that the exit 1 was contention.

No prompt in this group defers its test runner to a later prompt.

## Scope

No source change in this session. No fix commit. No push, no remote, no deploy. Prompt 140 is not started.

## Escalation

- Criterion 3. Call `zaphodReview` from the drive review step, with screenshots, through `think` and `ZAPHOD_SCHEMA`. The fixture stub can stay for the no-model CI path. Do not make `stubReview` the only review.
- Criterion 4. Invoke `onPhaseStart` when Babel Fish, Deep Thought, Improbability Drive, Mostly Harmless, and So Long start, and keep the write-back into the owning files.
- Criterion 5. If the roadmap sentence still means 011 cassettes, add that replay for Towel & Tea. Prompt 136 already shipped the compiler replay and forbade a live call in that test. Do not delete that test to make the sentence true.
