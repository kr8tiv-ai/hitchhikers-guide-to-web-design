# 133 Review — prompts 130, 131, 132

Verdict: **PASS_WITH_KNOWN_ISSUES**

Reviewed: 2026-10-07. Fresh session. Two fix commits. No new feature. Prompt 134 is not started. Mostly Harmless does not close here (`phase_end: false`; the phase checkpoint is 139).

The must-have truths for 130, 131, and 132 hold. Each one below has a test name and a file line. Two goal sentences in prompt 132 disagree with that prompt's own interface and with its step that sets a floor of 3. Those stay as known issues. This review did not change the signature or the floor.

## History

Build commits are in prompt order. Each build message matches that prompt's commit line. Each commit has one parent. History was not rewritten. At review start `main` was ahead of `origin/main` by these three builds, so they were not published. This session does not push.

| Order | Commit | Parent | Message | Role |
| --- | --- | --- | --- | --- |
| 1 | `0ceb736` | `5f8f49b` (129 review) | `feat(qa): refuse Elevate changes that fail a gate` | prompt 130 |
| 2 | `3251672` | `0ceb736` | `feat(elevate): live Elevate rounds, detail pass, and copy refinement` | prompt 131 |
| 3 | `bf7cad4` | `3251672` | `feat(spec): generate the before-we-jump questions` | prompt 132 |
| fix | `e0bec10` | `bf7cad4` | `fix(review): checkpoint 133 records the copy-refine cassette` | this review |
| fix | `307eb3b` | `e0bec10` | `fix(review): checkpoint 133 proves a second Elevate round` | this review |

HEAD at review start was `bf7cad4`. The working tree was clean. `.hitchhiker-dev/summaries` is absent, so the commit bodies are the summaries. No package was added. `@theatre/studio` is absent.

## 130 Apply an Elevate item only if the gates still pass

### Truths

- Elevate cannot keep a gate regression. `runElevate` reads `before`, calls `apply` once, then reads `after`. Any `BLOCKER` on `after`, including a gate that was already red, calls `rollback` once and returns `refused` (`packages/qa/src/elevate-run.ts` lines 94–105). A pair of `PASS` results returns `kept` and does not call `rollback` (lines 107). Test `a phone gate that flips to BLOCKER rolls back once` (`packages/qa/test/elevate-run.test.ts` line 72) requires `refused`, one apply, and one rollback. Test `a gate that was already BLOCKER is refused too` (line 97) requires the same when both snapshots are red. Test `a clear pair of gates keeps the edit and does not roll back` (line 63) requires `kept` and zero rollbacks. Test `a rollback rejection is not swallowed` (line 124) requires the original rejection. Test `evaluateLh and evaluateA11y statuses drive keep and refuse` (line 230) feeds real `evaluateLh` and `evaluateA11y` statuses into the executor. A null phone run is `BLOCKER` and is refused.

- The executor is injectable and unit-tested. `RunElevateInput` takes `apply`, `rollback`, `before`, and `after` (elevate-run.ts lines 27–31). The tests pass counters. No browser, no Lighthouse process, no filesystem. Test `the executor exports runElevate and does not import a browser` (elevate-run.test.ts line 281) reads the source and rejects `playwright`, `puppeteer`, `@lhci`, `child_process`, and `node:fs`. Test `apply, rollback, before, and after are required` (line 169) rejects a missing function before any apply.

### Key link

The module comment names `evaluateLh` and `evaluateA11y` as the statuses a real caller wires in (elevate-run.ts lines 4–6). The types are `LhGateResult["status"]` and `A11yGateResult["status"]` (lines 16–25). The unit test calls those two functions and passes their `status` fields through `runElevate`.

### Also checked

`apply` runs once on the keep path, the refuse path, and the thrown-rollback path. A thrown `apply` rejects and does not roll back (elevate-run.test.ts line 140). A change that moves both gates from `BLOCKER` to `PASS` is kept (line 116). The prompt's red-gate rule is about a gate that is still red after the edit. A cleared gate is not red.

## 131 Elevate loop live, detail pass, copy refinement

### Truths

- Elevate is repeatable and never keeps a regression. `elevateRound` plans with `planElevateModel` at the caller's `think`, slices the plan to `ELEVATE_CAP` (8), and writes `ROUND-N.md` (`packages/qa/src/elevate-loop.ts` lines 225–237, 519–530, 497–512). `nextRound` reads existing `ROUND-N.md` files and adds one. There is no one-shot lock. Each pick goes through `runElevate` from prompt 130 (lines 564–578). A Lighthouse or accessibility `BLOCKER` is `refused` inside that call, which rolls the pick back. Console, links, and weight use the same rollback when `runElevate` would have kept the edit (lines 493–495 and 579–590). Picks are capped again at 8 (line 536). A stranger that was not in the plan is dropped (lines 538–541). Test `a cassette round keeps one pick and refuses a Lighthouse regression` (`packages/qa/test/elevate-loop.test.ts` line 194) records one `elevate-plan` call at `xhigh` through `think`, replays it with a spawn that throws, keeps `r1-01`, refuses `r1-02` because Lighthouse is `BLOCKER`, and checks `ROUND-1.md`. Test `every regressing pick is refused and nothing is kept` (line 368) requires an empty `applied` list and no leftover site file. Test `no picks ends the round without gates or prompts` (line 311) requires an empty result and zero gate calls. Test `a second round is numbered and still changes nothing when nothing is picked` (line 339) calls `elevateRound` twice and requires `ROUND-2.md` plus an empty result. The second-round test uses an injected model. The cassette test is the one that enters the adapter. `ELEVATE_CAP` is 8 (`packages/qa/src/elevate.ts` line 34). Test `nine valid notes yield truncated true and the first eight in order` (`packages/qa/test/elevate.test.ts` line 69) locks the planner cap. The loop slices with the same constant.

- The detail pass covers the small things award juries notice. `DETAIL_AREAS` is kerning, optical alignment, hover, focus, 404, favicon, og-image, empty, error, and print (`packages/qa/src/detail-pass.ts` lines 16–27). `detailChecks` measures each one and returns a row even when the area fails (lines 360–399). `writeDetailPrompts` writes one prompt file per area and cites `packages/engine/src/spec/site-rules.ts` by path (lines 406–458). Test `detail checks report every area on the fixture site` (elevate-loop.test.ts line 401) requires those ten area names, a non-empty note, and no exclamation mark. On the starter fixture the test requires favicon, kerning, optical alignment, and focus to pass, and og-image, 404, print, hover, empty, and error to come back as gaps (lines 420–429). Test `detail prompts cover each area and cite the site rules` (line 435) requires one file per area and rejects the word elevate and an exclamation mark in the prompt text.

- Copy refinement stays in the brand voice. `proposeCopy` sends the voice text to `think` with task `copy-refine`, `COPY_REFINE_SCHEMA`, and effort `xhigh` (`packages/qa/src/copy-refine.ts` lines 30–48 and 185–202). A line fails closed when `lintSlop` in site mode, `lintBrandClaims`, or `lintClaims` rejects it (lines 110–114). An exclamation mark is a slop hit and is dropped. `approveCopy` writes one copy prompt only for ids whose decision is `approve: true` and that still pass the linters (lines 242–288). A missing decision is a reject. Test `copy proposals drop banned lines and a write needs approval` (elevate-loop.test.ts line 454) drops an exclamation, `Unlock a seamless visit`, a star claim, and a line that is not on the page, then refuses to write `Book a call!` even when that id is approved. Test `copy refinement replays a recorded cassette through the adapter` (line 533) is the fix. It calls the real `think` from `packages/engine/src/ai/think.ts` with `HH_CASSETTE=record`, requires task `copy-refine`, effort `xhigh`, `COPY_REFINE_SCHEMA`, `maxItems` 8, the voice string in the input, and `--json-schema` on the spawned argv (lines 598–610). Replay uses a spawn that throws. The second result matches the first and `replaySpawns` stays 0 (lines 614–616). The cassette file is under the temp directory. It is not committed.

### Key links

`elevateRound` calls `planElevateModel` (elevate-loop.ts line 529) and `runElevate` (line 564). `toGateResult` maps the prompt 126 report shape: Lighthouse rows, axe status, console errors, links, and weight (lines 66–87). The prompt text names prompt 142 for gate runners. Prompt 142 is the later deploy handoff and does not export runners. The CLI loads `runGates` from `packages/qa/src/site-once-over.ts` and passes the result through `toGateResult` (`packages/cli/src/commands/elevate.ts` lines 306–328). Picks run through `runLivePrompt` with `spawnGrok` (lines 331–345). The default model is `think` (line 102).

### Also checked

An empty pick list writes the round log and returns before gates (elevate-loop.ts lines 544–546). The round log says `How could this be better?` (line 509). The CLI defaults `--pick` to `none`, so a round with a URL and no pick list changes nothing (`elevate.ts` command, line 125 and 249). Copy without `--approve` prints cards and writes nothing (lines 229–232). `hh elevate --help` is dispatched from `packages/cli/src/main.ts` line 162. Test `hh elevate help is wired and a bare command names the project` (elevate-loop.test.ts line 624) runs that command.

The CLI package is allowed to depend on `@hitchhiker/engine` only (`packages/engine/src/boundaries.ts`). The command loads the QA modules by file URL (elevate command, lines 271–291). The boundary scan still passes because that import is computed. Adding `@hitchhiker/qa` to the CLI allow-list would be a new dependency edge. This review left the file URL in place.

## 132 Generate the last questions before launch

### Truths

- The pre-launch questions come from real gaps. `beforeWeJump` reads `AnswerRecord` rows and `BRAND_SECTIONS` (`packages/engine/src/spec/before-jump.ts` lines 24–26 and 82–131). Hosting `no idea` asks a question that contains `host` (lines 134–143). Each unapproved brand section is named (lines 92–99). A missing legal page is asked (lines 100–107). Calm voice plus motion 9 or 10 asks whether to keep that level or drop to 7 (lines 153–161). Domain, DNS, email, analytics, and launch date are asked when those facts are still open (lines 164–213). `SOFT`, `SKIPPED`, and Express `ASSUMED:` rows are re-asked (lines 270–277 and 322–332). `ANSWERED`, `SUGGESTED`, and `IMPORTED` rows with a real value are not asked again (lines 270–277). `DP-8.2` and any question that matches `testimonial` are dropped (lines 325–326 and 348–352). Test `hosting no idea asks where the site should be hosted` (`packages/engine/test/before-jump.test.ts` line 67). Test `empty approvals asks every brand section by name` (line 137). `BRAND_SECTIONS` is purpose, voice, tokens, imagery, logo, and neighbors. Test `calm voice and motion 9 asks for a calm 9 or a drop to 7` (line 210). Test `so long gaps ask about domain, dns, email, analytics, and launch date` (line 251). Test `express defaults and soft answers are re-asked` (line 271). Test `an answered host is not asked again` (line 94). Test `a proof gap does not ask for a testimonial` (line 291). Test `user punctuation and banned words stay out of the question` (line 302) requires the word elevate and an exclamation mark to stay out.

- The list is bounded. `MAX_QUESTIONS` is 8 and `MIN_QUESTIONS` is 3 (before-jump.ts lines 28–29). Over eight, the last question says more items are unapproved and names the hidden count (lines 236–243). Test `more than 8 open items truncates and the last question says more are unapproved` (before-jump.test.ts line 320) requires length 8 and `More items are unapproved`. Test `two real gaps gain one filler and do not grow to 8` (line 195) requires length 3. Every test in the file calls `assertBounds`, which requires length 3 to 8, a trailing question mark, and no exclamation mark or testimonial (lines 45–54).

### Key link

The function imports `AnswerRecord` from `packages/engine/src/required.ts` and `BRAND_SECTIONS` from `packages/engine/src/brand/approve.ts` (before-jump.ts lines 24–26). Empty `approvals` treats every brand section as unapproved (lines 92–94). Test `empty approvals asks every brand section by name` locks that.

### Also checked

The function is pure. It does not import `node:fs` or the AI adapter. The same input returns the same list (before-jump.test.ts line 348). So Long checks are derived from the files on every call. The declared signature has no phase argument, so the function cannot ask those checks only at So Long. They appear when the matching fact is open.

## Live model calls

D-003 says the reviewer and Elevate make real Grok calls through one adapter. Tests may use recorded cassettes. The product does not embed a fake model.

- 130: `runElevate` does not call a model. The prompt forbids a live Lighthouse run in the unit test. The statuses come from injected functions. That matches the prompt.
- 131 round: `elevateRound` passes `deps.think` into `planElevateModel`. The CLI default is `think`. Test `a cassette round keeps one pick and refuses a Lighthouse regression` records one spawn and replays with no second spawn. Task `elevate-plan`, effort `xhigh` (elevate-loop.test.ts lines 297–302).
- 131 copy: before this review, `copy proposals drop banned lines and a write needs approval` injected a payload and never called `think`. `e0bec10` adds the cassette. Record once, schema and voice on the request, `--json-schema` on the argv, replay with no second spawn.
- 132: `beforeWeJump` does not call `think`. See Known issues. This session did not set `HH_LIVE`. The engine suite skipped `live smoke returns a two-field object`.

## UI

Prompts 130, 131, and 132 did not create or change a file under `packages/app/`. No Guide screen was opened. No 375 or 1440 screenshot. No visual pass is claimed.

The detail-pass test does open the starter fixture in Chromium and asserts the ten area rows. That is a gate report, not a look at the Guide design system in `packages/app/src/design/`.

## File list

From `5f8f49b` through `bf7cad4`: 11 files. Prompt 130 matches its list (`elevate-run.ts` and its test). Prompt 132 matches its list (`before-jump.ts` and its test). Prompt 131 matches its list, plus `packages/cli/src/main.ts` (two lines: the import and `if (command === "elevate")`). That is the dispatch the command needs. It is the same shape as the tools dispatch from prompt 100. It is not a new feature. The two fix commits change only `packages/qa/test/elevate-loop.test.ts` and `packages/qa/test/cassettes/elevate/README.md`, both on prompt 131's file list.

## Fixes

Two fixes. Both are test evidence. No product behavior changed. No third attempt.

1. Defect: copy refinement is an Elevate model call (D-003, Q15). The only test injected a scripted model. It never entered `packages/engine/src/ai/think.ts`, and it never checked the schema.

   Correction: `packages/qa/test/elevate-loop.test.ts`, test `copy refinement replays a recorded cassette through the adapter`. The cassette README now names that test. The linter and approval test stays.

   Re-checked: `pnpm --filter @hitchhiker/qa test` after the edit, 195 pass, 0 fail, including that test and `the starter fixture clears the real phone gates`.

2. Defect: the truth says Elevate is repeatable. `nextRound` implements that, and every test stopped after `ROUND-1.md`.

   Correction: test `a second round is numbered and still changes nothing when nothing is picked`. Two calls, `ROUND-2.md`, no prompt, no gates, no site file.

   Re-checked: `pnpm --filter @hitchhiker/qa test` after the edit, 196 pass, 0 fail. `tsc -p packages/qa --noEmit` exited 0.

One full QA run between those commits failed `a cassette round keeps one pick and refuses a Lighthouse regression` and `every regressing pick is refused and nothing is kept` with `Permission denied` while writing a temp git object. The same two tests had passed in the suite immediately before that run, and they passed again on the next run. The failure is a Windows temp-repo flake under parallel load. It is not a change in the refuse rule. This review did not edit the git helper to hide it.

## Known issues

- A closed project still returns three announcement questions. `beforeWeJump` pads up to 3 with `What should the launch announcement avoid claiming?` and two more announcement lines (before-jump.ts lines 57–62 and 245–251). Test `a closed project returns the launch question and two fillers` (before-jump.test.ts line 56) requires exactly those three. The prompt's context also says to return zero and never pad. The same prompt's step 3 and acceptance criteria say the length stays between 3 and 8, and CONTEXT-PACKAGE v2 §5.1 says 3 to 8. Prompt 134, which this review did not start, says not to pad and expects zero open items to ask nothing. Changing the floor here would fail the acceptance line prompt 132 told the builder to meet. The gap-derived questions above are still tested. The three fillers are not gaps.

- `beforeWeJump` does not call Grok. The goal sentence says the questions are generated through the 011 adapter. The declared function has no `think` argument and the steps say pure, no disk (before-jump.ts lines 5–7 and 82–86). Prompt 134's `onPhaseStart` is the signature that takes `think`. Adding an adapter argument here would invent an API the interface does not declare, and it would overlap that next prompt. D-003 names the interview, brand modules, the reviewer, and Elevate. It does not name this generator. The wording is fixed in this module and checked by the tests.

## Conflicts recorded

- Prompt 132's goal says 0 to 8. Its steps and acceptance criteria say 3 to 8. CONTEXT-PACKAGE v2 §5.1 says 3 to 8. The code follows the floor of 3. See Known issues.
- Prompt 132's goal says generated by Grok through 011. The interface is a pure function. The code follows the interface. See Known issues.
- Prompt 131's key link says gate results come from prompt 142. Prompt 142 is later and is the deploy handoff. The loop and the CLI use the prompt 126 runners. The source comment says so (elevate-loop.ts lines 3–8).
- v2 §12 still says three jury judges. That conflict was recorded in review 129. This group does not rescore the jury.

## Verification

`Test-Path hh-build-plan/reviews/133-REVIEW.md` is true once this file is written.

| Command | Exit | Result |
| --- | --- | --- |
| `pnpm --filter @hitchhiker/qa test` | 0 | 196 pass, 0 fail. Includes the phone-gate refuse test, the Elevate cassette round, the second round, the detail-pass fixture, the copy cassette, and the starter phone-gate fixture (about 77s). |
| `pnpm --filter @hitchhiker/cli test` | 0 | No project matched. The suite did not run. Exit 0 from pnpm is not evidence. The package name from prompt 001 is `hitchhikers-guide`. |
| `pnpm --filter hitchhikers-guide test` | 0 | 37 pass, 0 fail. The Elevate command test lives in the QA suite because it spawns `packages/cli/src/main.ts`. |
| `pnpm --filter @hitchhiker/engine test` | 0 | 565 pass, 1 skipped, 0 fail. The skip is `live smoke returns a two-field object` (`HH_LIVE` unset). Includes the before-we-jump tests. |
| `pnpm exec tsc -p packages/qa --noEmit` | 0 | After the second fix. |

`HH_LIVE` was unset. No live model call was made in this session.

## This session

No prompt 134 work. No push, no remote, no deploy. Two fix commits, then this review.
