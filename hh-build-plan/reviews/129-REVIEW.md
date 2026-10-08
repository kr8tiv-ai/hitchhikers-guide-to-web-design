# 129 Review — prompts 126, 127, 128

Verdict: **ESCALATE**

Reviewed: 2026-10-07. Fresh session. One fix commit. No new feature. Prompt 130 is not started. Mostly Harmless does not close here (`phase_end: false`; the phase checkpoint is 139).

The must-have truths for 126, 127, and 128 hold, and the commands below exited 0. The escalation is not a failed gate. Commit `093df2e` sits between 126 and 127 and is outside every file list in this group. It adds an engine queue surface and app drive routes. Reverting it would change package boundaries and a served screen. That is an architecture change, so this review does not revert it.

## History

Build commits are in prompt order. Each build message matches that prompt's commit line. Each commit has one parent. History was not rewritten. `main` was ahead of `origin/main` at review start, so these commits were not published. This session does not push.

| Order | Commit | Parent | Message | Role |
| --- | --- | --- | --- | --- |
| 1 | `eaeeaa8` | `ce72a0e` (125 review) | `feat(drive): live runner, Zaphod vision review, and real phone gates` | prompt 126 |
| — | `093df2e` | `eaeeaa8` | `fix(app): serve the drive dashboard from the queue on disk and persist Pause` | out of scope, see Escalation |
| 2 | `09d3f50` | `093df2e` | `feat(qa): add the weighted jury` | prompt 127 |
| 3 | `e712662` | `09d3f50` | `feat(qa): plan at most eight Elevate upgrades` | prompt 128 |
| fix | `928f9bc` | `e712662` | `fix(review): checkpoint 129 records the Zaphod vision cassette` | this review |

HEAD at review start was `e712662`. The working tree was clean.

`eaeeaa8` also changes `packages/qa/package.json`, `pnpm-lock.yaml`, and `NOTICE`. Those three are not in the prompt file list. They are the dependency record for `@lhci/cli`, `playwright`, and `@axe-core/playwright`, which the prompt requires. This session checked the registry: `@lhci/cli@0.15.1` Apache-2.0, repository `GoogleChrome/lighthouse-ci`; `lighthouse@12.6.1` Apache-2.0, `GoogleChrome/lighthouse`; `playwright@1.63.0` Apache-2.0, `microsoft/playwright`; `@axe-core/playwright@4.13.0` MPL-2.0, `dequelabs/axe-core-npm`; `axe-core@4.13.0` MPL-2.0, `dequelabs/axe-core`. NOTICE already records the MPL-2.0 file-level note. `@theatre/studio` is absent. `.hitchhiker-dev/summaries` is absent, so the commit bodies are the summaries.

## 126 Live drive, vision review, real gates, console gate, live dogfood

### Truths

- The drive runs real Grok sessions. `liveGrokSpawn` is `spawnGrok` (`packages/orchestrator/src/live-runner.ts` line 43). `commandFor` resolves that binary and leaves every other spawn on the command name `grok` (lines 49–51). `runLivePrompt` builds argv with `buildArgv` from 096, checks `evaluateCommand` from 097, then calls `spawnImpl` (lines 222–243). The opt-in dogfood is the caller that passes `liveGrokSpawn` (`evals/dogfood-live/run.ts` lines 103 and 122) and returns before any spawn unless `HH_LIVE` is exactly `"1"` (line 103, helper at live-runner.ts lines 45–46). Test `fake spawn matches the 096 argv, logs tokens, and stays off the real binary` (`packages/orchestrator/test/live-runner.test.ts` line 56) requires the 096 argv, denies `--always-approve`, `--sandbox`, and `--session-id`, and requires a Marvin sensor line. Test `the real spawn path resolves grok or reports it missing` (line 210) requires `commandFor(liveGrokSpawn)` to name grok or throw `GrokMissingError`, and an empty `PATH` throws `GrokMissingError`. Test `live dogfood stays off unless HH_LIVE is exactly 1` (line 228) runs the dogfood script with `HH_LIVE` removed and requires no `REPORT.md`. This session did not set `HH_LIVE`. A live Towel and Tea run was not started.

- Zaphod judges with vision against must_haves. `zaphodReview` parses `<must_haves>` truths (`packages/qa/src/zaphod-vision.ts` lines 118–146 and 240) and calls `deps.think` with task `zaphod-vision`, `ZAPHOD_SCHEMA`, the shot paths, and the diff (lines 243–255). The schema requires truths, eight pillars, and the 127 jury fields (lines 64–111). The result goes through `checkTruths` (109), `summarizePillars` (110), and `decideReview` (113) (lines 259–270). Test `zaphod passes shots, the diff, and truths to vision` (`packages/qa/test/live-gates.test.ts` line 103) checks the task, the images, and the parsed truth. That test injects a stub. It does not enter the adapter. The fix adds test `zaphod vision replays a recorded cassette through the adapter` (line 124). It calls the real `think` from `packages/engine/src/ai/think.ts` with `HH_CASSETTE=record`, asserts `--json-schema` and the truth on the spawned argv, then replays with a spawn that throws. Replay does not spawn. The verdict is `PASS` and the truth is `FOUND`. A bad payload still throws (`a bad vision payload throws instead of passing`, line 284). D-003 allows a recorded cassette in tests. The product function does not embed a fake model.

- Gates use real tools and fail closed. `runGates` catches a throw from Lighthouse, axe, the console gate, and the link check and returns a blocker or a non-zero error count (`packages/qa/src/site-once-over.ts` lines 187–203). `runLhci` spawns `@lhci/cli` with `numberOfRuns: 3`, `formFactor: "mobile"`, and `minScore: 0.9` on performance, accessibility, best-practices, and seo (`packages/qa/src/lhci-run.ts` lines 68–99). `judgeRoute` sends the median and each run through `evaluateLh` from 122 (lines 271–305). A crash, a missing report, a short run, or a failed assert is `BLOCKER` (lines 277–304 and 327–355). `runAxe` uses `AxeBuilder` from `@axe-core/playwright`, tabs with Playwright, and emulates `reducedMotion: "reduce"` (`packages/qa/src/axe-run.ts` lines 176–237). A throw returns `BLOCKER` (lines 231–237). `runConsoleGate` counts console errors and failed same-origin requests at `REVIEW_WIDTHS` (375, 768, 1440, 1920) and returns one error and one failed request if Chromium itself throws (`packages/qa/src/console-gate.ts` lines 26–69). Test `a dead preview fails closed` (`live-gates.test.ts` line 419) requires `pass` false, a lighthouse `BLOCKER` with null scores, and console errors and failed requests above zero. Test `the starter fixture clears the real phone gates` (line 436) serves the astro-default copy over local HTTPS, captures 16 shots, and requires console zero, axe `PASS`, keyboard true, reduced motion true, contrast at least 4.5, no broken links, weight `PASS`, and three-or-more lighthouse runs at 90 in all four categories on `/` and `/credits`. This session's qa run executed that test in about 75 seconds and it passed. Test `the lighthouse config keeps three mobile runs at 90` (line 353) rejects a `0.8` floor in the source.

### Key links

`zaphodReview` feeds 109, 110, 113, and the 127 input shape. `blocked` on that shape is true when `decideReview` returns `ESCALATE` (zaphod-vision.ts line 284). A pillar `BLOCKER` escalates (`a BLOCKER pillar escalates on the first review`, live-gates.test.ts line 275). A phone block escalates and sets `jury.blocked` (`a blocked phone run escalates`, line 291). `lhci-run` is judged by `evaluateLh` (lhci-run.ts line 286).

### Also checked

- Fix prompts: one to three files under `.hitchhiker/prompts/fix/`, two rounds, then `PASS_WITH_KNOWN_ISSUES`. Test `a two-round FIX ends as a known issue` (live-gates.test.ts line 216). A site that does not boot writes nothing (`a site that does not boot escalates and writes no fix prompts`, line 249).
- Once-over: `insertOnceOver` places `forty-two-once-over` immediately before a `mostly-harmless` phase, and the prompt file is `effort: xhigh` (site-once-over.ts lines 66–78). Test `the forty-two once-over sits before Mostly Harmless` (live-gates.test.ts line 321).
- Usage limit: `LiveUsageLimitError` pauses the queue. Test `a usage limit pauses the queue and does not advance` (live-runner.test.ts line 114). The dashboard surface for that pause is the escalated commit, not this file list.
- `collectAccepted` treats Windows exit code 1 as a finished collect only when reports exist and stderr says Chrome could not be killed (lhci-run.ts lines 224–232). Scores still go through `evaluateLh`. A crash with no report stays `BLOCKER`.
- Keyboard: `keyboardPath` tabs and requires each interactive element to be on screen (axe-run.ts lines 105–147). It does not read the focus-ring outline. The starter `blank.css` sets `a:focus-visible`. The real fixture passed. This is narrower than the sentence "checks visible focus." It does not make the fail-closed truth false, and this review does not widen the gate.

## 127 Score the four-part jury

### Truths

- The jury cannot outvote a blocker. `jury` sets `FAIL` when `blocked` is true, and the total stays the weighted sum (`packages/qa/src/jury.ts` line 109). Test `a blocker fails a perfect score without changing the total` (`packages/qa/test/jury.test.ts` line 51) requires total 100 and status `FAIL`. Test `a blocker fails a total of 70` (line 62) does the same at the pass line. The result keys are only `total` and `status`. The word lighthouse is absent from the result and from the source (jury.test.ts lines 22–26 and 152–164).

- The weights are fixed in code and in the test. `WEIGHTS` is brand 40, craft 30, clarity 20, performance 10 (jury.ts lines 38–43). The total is that sum divided by 10, which is `brand*4 + craft*3 + clarity*2 + performance*1` (lines 96–103). `PASS_AT` is 70 (line 49). Test `weights are 40, 30, 20, and 10` (jury.test.ts line 35) requires 40, 30, 20, and 10 and a sum of 100. Test `69 fails and 70 passes when nothing is blocked` (line 68). Test `weights 40, 30, 20, and 10 and the line at 70 are fixed in the source` (line 152) reads the source. Test `scores outside 0 to 10 throw` (line 94) and test `NaN and other non-finite scores throw` (line 113). Test `fractional scores such as 7.5 are valid` (line 88).

### Key link

`blocked` is an input. The comment says it is true when a pillar rollup or the phone gate says `BLOCKER` (jury.ts lines 16–18). Prompt 126 sets that flag when the review escalates, which covers a pillar `BLOCKER` and `phoneBlocked` (zaphod-vision.ts lines 262–263 and 284). `jury` does not hide the flag inside the average.

### Also checked

The prompt interface is one score tuple, not three judge objects. See Conflicts. The function does not call the network and does not use `Math.random`. The source test rejects `child_process`, `fetch`, and `Date.now`.

## 128 Plan at most eight Elevate upgrades

### Truths

- Elevate is a bounded plan. `ELEVATE_CAP` is 8 (`packages/qa/src/elevate.ts` line 34). `planElevate` keeps the first eight accepted notes, sets `truncated` when more were accepted, and writes nothing (lines 165–188). The schema `maxItems` is the same cap (lines 73–79). Test `nine valid notes yield truncated true and the first eight in order` (`packages/qa/test/elevate.test.ts` line 69). Test `eight accepted notes are not truncated` (line 187). Test `empty input returns an empty list and truncated false` (line 50). The source test in `the file may contain elevate and the change may not` (line 137) rejects `node:fs` and `writeFile`. `planElevateModel` returns the plan and does not write the site file (elevate.ts lines 273–290). Test `planElevateModel replays a recorded cassette and applies nothing` (elevate.test.ts line 195) records through `think`, replays with a spawn that throws, and requires the site file bytes to stay put.

- It does not reintroduce banned patterns. `changeRejected` skips `add a magnetic`, any other `magnetic` word, and a site anti-slop hit (elevate.ts lines 153–163). `non-magnetic` stays. An exclamation, the standalone word elevate, lorem, and an em dash are skipped with the rest of the plan kept. Test `magnetic and exclamation changes are skipped and the plan is kept` (elevate.test.ts line 111). Test `the file may contain elevate and the change may not` (line 137) allows `packages/qa/src/elevate.ts` and the word `elevated`, and drops `elevate the headline`. The cassette fixture includes `add a magnetic hover` and a `..` path. Both are skipped (elevate.test.ts lines 218–230 and 288–305). A parent segment is skipped (elevate.ts lines 128–131). Test `duplicate pairs are dropped and a parent segment is skipped` (elevate.test.ts line 167).

### Key link

Notes are `file: change`. The module comment says pillar FIX rows are the intended notes (elevate.ts lines 3–9). `planElevateModel` sends four screenshot paths plus code, BRAND, VOICE, and MOTION, with task `elevate-plan`, the upgrade schema, and effort `xhigh` (lines 191–214 and 278–284). The cold-read sentence is "How could I possibly improve this?" Prompt 131 is named as the live call. This review did not make one.

### Also checked

Order follows the input. Skipped notes do not take a slot (elevate.test.ts line 88). Nine items after two skips still truncate. Picks are not turned into prompts here. The prompt's acceptance line is "Nothing is applied." Applying a pick is prompt 130.

## Live model calls

126 and 128 both ask for a Grok call through the 011 adapter. 127 does not.

- 126: `zaphodReview` passes a schema and images into `think`. Before this review the only test was a scripted stub. That missed the cassette step and D-003. `928f9bc` adds the record/replay test. The live dogfood remains behind `HH_LIVE=1` and was not run.
- 128: `planElevateModel` calls `think({ task: "elevate-plan", schema, effort: "xhigh" })`. Test `planElevateModel replays a recorded cassette and applies nothing` is the cassette. The prompt says the live call is prompt 131.
- 127: `jury` does not import `packages/engine/src/ai/`. The scores are inputs. That matches the prompt.

## UI

Prompts 126, 127, and 128 did not create or change a file under `packages/app/`. No screen from those prompts was opened. No 375 or 1440 screenshot. No visual pass is claimed for them.

`093df2e` does change `packages/app/`. That commit is the escalation below. This review did not serve it and does not claim a visual pass. A source scan of `packages/app/src/drive-markup.ts` shows the word Elevate on a button (`data-action="elevate"`), which is the product name in chrome. The scan did not show lorem, a purple gradient, or an exclamation in that markup.

## Escalation

`093df2e` (`fix(app): serve the drive dashboard from the queue on disk and persist Pause`) is a fourth commit in a three-prompt range. It is not a squash of a failed truth. Its parents are `eaeeaa8` and then `09d3f50`, so 127 and 128 sit on top of it.

Files outside every prompt list in this group:

- `packages/app/src/client/drive.ts`
- `packages/app/src/dashboard.ts`
- `packages/app/src/drive-markup.ts`
- `packages/app/src/server/drive.ts`
- `packages/app/src/server/routes.ts`
- `packages/app/test/dashboard.test.ts`
- `packages/app/test/drive-client.test.ts`
- `packages/app/test/server.test.ts`
- `packages/engine/src/index.ts`
- `packages/engine/src/queue-file.ts`
- `packages/engine/test/queue-file.test.ts`
- `packages/orchestrator/src/queue-file.ts`
- `packages/orchestrator/test/queue-file.test.ts`

The engine file is a new surface. The app files are a new served drive API (`GET /api/drive`, `POST /api/drive/pause`) and a client that polls it. Reverting would delete that surface and restore the previous queue owner. The review rule forbids an architecture fix. The commit stays. A later session can keep it or back it out. This review does not.

126's own edge case says a usage limit should show on the dashboard. The live runner pauses the queue file. The dashboard wiring was not in 126's file list. That does not make `093df2e` part of 126.

## Conflicts recorded

- v1 §12.1 and v2 §12 say three Awwwards-style judges. Prompt 127's interface and steps are one function: `jury({ brand, craft, clarity, performance, blocked })` with weights 40, 30, 20, 10. The code follows that interface. It does not average three judge cards. Changing it would invent an API the prompt did not declare. The goal sentence and the interface disagree. The interface won.
- The same prompt maps Design, Usability, Creativity, and Content onto `brand`, `craft`, `clarity`, and `performance` by formula order (`brand*4 + craft*3 + clarity*2 + performance*1`). The source comment records that mapping. The tests lock the numbers.
- Research 06 names Lighthouse 13.5.0. `@lhci/cli@0.15.1` depends on Lighthouse 12.6.1. NOTICE says so. The floor stays 90. This review confirmed both license fields on the registry.
- v2 §12 names serious and critical axe hits. `runAxe` also blocks moderate, because `evaluateA11y` from 123 does. The runner comment says so.
- D-003 says the reviewer and Elevate make real Grok calls through one adapter. Both functions take `think` as that adapter. Tests use cassettes. Neither function was executed against a live model in this session. 126's dogfood and 128's live Elevate call are explicitly opt-in or deferred.

## File list

From `ce72a0e` through `e712662`: 33 files. The three build commits match their prompt lists, plus the dependency record on `eaeeaa8` (`package.json`, `pnpm-lock.yaml`, `NOTICE`) and the whole of `093df2e` (the escalation). `928f9bc` changes only `packages/qa/test/live-gates.test.ts`, which is on prompt 126's file list.

## Fix

One fix. No second attempt.

Defect: prompt 126 step 3 asks for a cassette test, and D-003 plus this checkpoint reject a scripted stub where the reviewer must call Grok. `zaphod passes shots, the diff, and truths to vision` never called `think`.

Correction: `packages/qa/test/live-gates.test.ts`, test `zaphod vision replays a recorded cassette through the adapter`. Record once, replay with no second spawn, schema and truth on the argv. Existing verdict tests stay.

Re-checked: `pnpm --filter @hitchhiker/qa test` after the edit, 173 pass, including that test and `the starter fixture clears the real phone gates`. The committed tree is that edit.

## Verification

`Test-Path hh-build-plan/reviews/129-REVIEW.md` is true once this file is written.

| Command | Exit | Result |
| --- | --- | --- |
| `pnpm install` | 0 | Lockfile already up to date. |
| `pnpm --filter @hitchhiker/orchestrator test` | 0 | 237 pass, 0 fail. Includes the 096 argv test, the real-spawn resolution test, the usage-limit pause, and the dogfood `HH_LIVE` guard. |
| `pnpm --filter @hitchhiker/qa test` | 0 | 173 pass, 0 fail. Includes the cassette replay, the dead-preview fail-closed test, the real phone-gate fixture (about 75s), the jury blocker and weight tests, and the Elevate cap, magnetic skip, and cassette replay. |

`HH_LIVE` was unset. No `evals/dogfood-live/REPORT.md` was written.

## Verdict

ESCALATE. Prompts 126, 127, and 128 hold on their must-have truths after one evidence fix. Commands exited 0. No test was weakened. No push, no deploy, no remote. Prompt 130 is not started. The open item is `093df2e`, which this review will not revert.
