# 241k sweep report

Date: 2026-10-20. Font licences were not checked. That gate stays removed (`bc102d69`, 241z). Nothing was deployed, published, or deleted. Paradise Found was not edited. The desk on port 4175 was not started or stopped.

## 1. What we are trying to solve

The desk turns one brief into a site that can sit with Awwwards work: specific, free of the usual AI cluster, set in a curated foundry pair, and fast on a phone, a tablet, and a desktop. The person should not have to babysit the run, and the run should not hang.

Testable outcomes:

- `prepareSiteBuild` accepts a brief and writes the prompt queue, the phase reference logs, the deterministic section library, and, when the brief has an explicit `Reference URL:` line, a design-token extract under the project.
- Elevate, verdict, and jury share `gateProblems`. That path runs beauty with the 40/30/20/10 rubric, recipes, the built-type gate, the device matrix, mobile checks, reduced motion, state sweeps, the phone budget, the preloader handoff, the poster decision, per-device performance, nav and footer, palette proportion, the AI-cluster gate, the self-score, imagery grade, and image credits. When the matching artifact is present it also runs the juror floor, the defect log, the redesign order, and the variant combine.
- A capable phone (reduced motion off, GPU tier above 0) keeps the scene. Width alone does not select the poster.
- Type comes from the curated pairs in `240r-fonts.md` through `pickType`. A family the person named is kept. Overused defaults are refused when nobody named them.
- The phone performance budget is present before any 3D plan.
- A successful `deploy()` writes `.hitchhiker/deploy/launch-checklist.json` with `deployed: false`. A checklist problem does not change the deploy result. The checklist does not fetch or publish.
- A quiet build child is stopped. Git used by elevate and by the supervisor has a timeout and `GIT_TERMINAL_PROMPT=0`. Guide polls and oversized uploads fail on a deadline instead of sitting open.

A built `index.html` still needs the model to run the prompts. This sweep does not invent that page.

## 2. Do we accomplish that?

### Wiring

"Wired: yes" means a runner, `prepareSiteBuild`, `deploy()`, or the interview/elevate command calls the function, and a test fails if that call is removed. Audit 12 and audit 13 each have two halves, so the audit table has 15 rows for the 13 items.

| Item | File or function | Wired | Evidence |
| --- | --- | --- | --- |
| Audit 1 Font policy | `pickType` in `packages/engine/src/brand/tokens.ts` | yes | `kit-from-interview.ts` and `type-scale.ts` call it. `writeBrandKit` runs from `prepareSiteBuild`. `tokens.test.ts` fails a deal that invents Inter. |
| Audit 2 Type gate | `auditBuiltType` in `packages/qa/src/type-gate.ts` | yes | `gateProblems` calls it. `sweep-e2e-241k.test.ts` records the call. An unbuilt project fails closed with "index.html is missing." |
| Audit 3 License check | Removed from `packages/qa/src/licenses.ts` | no | `bc102d69` removed font-licence verification. Image credit rows remain. This sweep does not put the gate back. |
| Audit 4 Type scale | `writeDesignMd` in `packages/engine/src/spec/design-outputs.ts` | yes | `prepareSiteBuild` calls it. Lint runs before the file is kept. |
| Audit 5 Beauty and recipe | `judgeBeauty`, `checkRecipes`, `checkRecipeDir` | yes | `gateProblems` calls all three. `review-runners-241.test.ts` and the E2E both require the calls. |
| Audit 6 Vision booleans | `judgeAiCluster` plus `AI_CLUSTER_VISION_KEYS` | yes | `gateProblems` copies shot booleans into `judgeAiCluster`. `judgeBeauty` fails a shot when a visual-ban key is true. |
| Audit 7 Device matrix | `runDeviceMatrix` | yes | `gateProblems` calls it. The E2E stubs the browser and still asserts the call. `captureLiveDeviceMatrix` stays available for a caller that has a browser. |
| Audit 8 Mobile checks | `runMobileChecks` | yes | `gateProblems` calls it. The E2E stubs it and asserts the call. |
| Audit 9 WebGL robustness | `shouldUsePoster` in `packages/templates/shared/webgl.ts` | yes | `gateProblems` fails when a capable phone still gets a poster. Width is not an input. |
| Audit 10 Lighthouse per device | `evaluateDevicePerformance` | yes | `gateProblems` calls it. The E2E ran the real function and it failed closed: "heavy must be true or false." |
| Audit 11 Reduced motion | `runReducedMotion` | yes | `gateProblems` calls it. A phone width is not reduced motion. The E2E stubs the browser half and asserts the call. |
| Audit 12 Preloader | `auditHandoffMarkup` | yes | `gateProblems` calls it for the page HTML. |
| Audit 12 Nav and footer | `evaluateNavFooter` | yes | `gateProblems` calls it. The E2E failed closed: "currentMark must be color, aria, or text." |
| Audit 13 Palette proportion | `checkPaletteProportion` | yes | `gateProblems` calls it. The E2E palette was disabled and did not flag. |
| Audit 13 Imagery grade | `checkImageryGrade` in `packages/qa/src/imagery-grade.ts` | yes | `gateProblems` always calls it. `sweep-wiring-241k.test.ts` blocks elevate, verdict, and jury on samples 0.1 and 0.9. |
| Idea 1 Plan critique (9) | `critiquePlan` in `packages/engine/src/spec/plan-critique.ts` | yes | `generateBriefPlan` throws `PlanCritiqueError`. `prepareSiteBuild` calls `generateBriefPlan`. |
| Idea 2 Screenshot fix loop (9) | `runScreenshotFixLoop` in `packages/qa/src/elevate-loop.ts` | yes | `elevateRound` calls it on the non-blocked path. The E2E recorded 3 captures, one per width in `screenshotFixWidths()`. |
| Idea 3 AI-cluster gate (9) | `judgeAiCluster` | yes | Same call as audit 6. A family the brief names is not failed as a default. |
| Idea 4 Direction dealing (8) | `dealDirections` in `packages/engine/src/brand/directions.ts` | yes | `writeBrandKit` saves the dealt set and does not pick. `prepareSiteBuild` calls `writeBrandKit`. After the plan is approved, `presentDesignStage` deals when `readDirectionDeal` is null. The desk never invents a pick. |
| Idea 5 Section references (9) | `buildMarkupFromReferences` | yes | `renderReferencedSections` calls it. `prepareSiteBuild` writes `.hitchhiker/sections/library.html`. `designLanguageFor` is unchanged. |
| Idea 6 Awwwards rubric (8) | `judgeBeauty` with `rubricFrom` | yes | `gateProblems` passes brand/craft/clarity/performance as design/usability/creativity/content. `sweep-wiring-241k.test.ts` blocks craft 4. |
| Idea 7 Design stages (7) | `advanceDesignStages` / `emitDesignStages` | yes | GET `/approve` after the plan is approved calls `presentDesignStage`, which calls `emitDesignStages`. The stage form calls `approveDesignStage`, which calls `advanceDesignStages`. `packages/engine/src/interview.ts` also calls `advanceDesignStages` when the session has stages. A blank answer is not an approval. The desk writes `.hitchhiker/design-stages.json`, `.hitchhiker/sitemap.md`, and `.hitchhiker/wireframe.md`. |
| Idea 8 DESIGN.md lint (7) | `lintDesignMd` inside `writeDesignMd` | yes | `prepareSiteBuild` calls `writeDesignMd`. A lint failure throws before the write. |
| Idea 9 One bold thing (8) | `assertOneOwner` in `packages/engine/src/spec/motion.ts` | yes | The motion planners call it. `prepareSiteBuild` calls `writeMotionModule`. |
| Idea 10 Frame checks (8) | `detailChecks` in `packages/qa/src/detail-pass.ts` | yes | `packages/cli/src/commands/elevate.ts` calls `detailChecks` on the elevate URL. `captureLiveDeviceMatrix` calls `detailChecksIn`. |
| Idea 11 Section lock (7) | `judgeSectionLock` / `runScopedSectionEdit` | yes | Each elevate pick calls `judgeSectionLock`. A scope whose after buffer differs is refused. The wiring test uses two different buffers and expects "Locked section footer changed." |
| Idea 12 Credited imagery (7) | `auditImageCredits` and `auditSourcedMedia` | yes | `gateProblems` calls both. An `img` with empty assets fails. Licence strings stay information. |
| Idea 13 Redesign order (7) | `judgeRedesignOrder` | yes | `elevateRound` judges the order before think. Empty steps pass. A components-only step is refused. `gateProblems` judges a redesign artifact when one is present. |
| Idea 19 Parallel variants (8) | `combineSectionVariants` | yes | Called when `.hitchhiker/variants/combine.json` or `project.variants` exists. Zero variants fail, so an empty default is not passed. The wiring test refuses one variant before think. |
| Idea 20 Self-score (9) | `scoreSelf` | yes | `gateProblems` calls it. The E2E failed closed: "creativity is undefined. Expected a score from 0 to 10." |
| Idea 21 Juror floor (7) | `measureJurorFloor` and `runElevateAfterJurorFloor` | yes | `elevateRound` measures when `deps.juror` or `.hitchhiker/review/juror.json` exists, and refuses before think when a row is no. `gateProblems` does the same for a review. A missing sample does not invent an all-yes floor. |
| Idea 22 Phase references (7) | `recordPhasePrompt` in `packages/engine/src/spec/skills.ts` | yes | `prepareSiteBuild` writes `.hitchhiker/reference-phases/<phase>.md` on both the early return and the generate path. The E2E webgl log contains `@skill:three` and not `@skill:gsap`. `.hitchhiker/phases` stays the scaffold dirs. |
| Idea 23 Phone budget before 3D (8) | `assertPhoneBudgetBefore3d` | yes | `generateBriefPlan` calls it, and `gateProblems` calls it. |
| Idea 24 Device matrix and state sweep (8) | `runDeviceMatrix`, `runMobileChecks`, `runReducedMotion`, `evaluateStateSweeps` | yes | All four are in `gateProblems`. The offline E2E stubs them and asserts each name. |
| Idea 25 Launch checklist (7) | `prepareLaunchChecklist` / `judgeLaunchChecklist` | yes | `finishDeploy` in `packages/deploy/src/cli-run.ts` writes the report after each successful `deploy()` return. `deployed` is false. A bad evidence file still returns the URL. `launch-wired-241k.test.ts` covers that. |
| Idea 26 Defect log (7) | `judgeDefectLog` / `settleDefects` | yes | `elevateRound` settles after the round and records `elevate-<round>`. `gateProblems` judges a defect file as stored, so a closed blocker with no retest still blocks a review. The wiring test covers both. |
| Idea 27 Mood to type (7) | `pickType` from the interview kit | yes | Same path as audit 1. |
| Idea 28 Reference URL (8) | `extractReferenceDesign` | yes | `prepareSiteBuild` calls it only when the brief matches `Reference URL: http(s)://...`. Tests inject a transport. Outside tests the fetch uses `AbortSignal.timeout(8000)`. No transport writes `reference-pending.txt` and the build continues. The committed design library is not modified. |
| Idea 29 DESIGN.md export (8) | `writeDesignExports` | yes | `writeDesignMd` calls it after lint. `exportDesignMd` returns null when lint fails. |
| Idea 31 Decision log (7) | `recordDirectionChoice` / `chooseDirection` | yes | `writeBrandKit` saves the dealt set in `.hitchhiker/directions.json` and does not write the log. The design-stage panel shows the direction picker. `POST /api/direction` calls `chooseDirection` only when the person supplies an id and a reason. The desk stage approval does not pass a direction into `advanceDesignStages`. `advanceDesignStages` records a direction only when its caller supplies one. `dealDirections` skips `rejectedDirectionNames` for that project. `decision-caller-241l.test.ts` covers the choice, the exclusion, and the absent log. |
| Idea 32 Deterministic sections (7) | `renderReferencedSections` | yes | `prepareSiteBuild` loads it dynamically and writes `library.html`. The model callback is not called. The E2E brief's `@section:asymmetric-editorial-grid` renders `data-landmark="asymmetric-editorial-grid"`. |
| Idea 33 Preserve-functionality prompt (7) | `PRESERVE_FUNCTIONALITY` / `elevatePickPrompt` | yes | `elevateRound` refuses before the model when the sentence is missing. The sentence has no exclamation mark and no em dash. |
| Idea 34 WebGL recipe (7) | `shouldUsePoster`, `shouldStartLoop`, `tierSettings` | yes | The review runner calls `shouldUsePoster`. Template tests cover tier, context loss, and the phone flag. |

`hh elevate` builds a `ReviewProject` from `index.html` and `.hitchhiker/review/lab.json` and passes it to `elevateRound`, so `gateProblems` runs. A missing `index.html` or lab is refused before the round. The CLI names each gap and how to produce it. The loader does not invent a page or a lab measurement. `packages/cli/test/elevate-review-241l.test.ts` asserts the gate calls on a built fixture and the refusal on an unbuilt project. Artifact guards inside `elevateRound` (screenshot loop, section lock, juror floor, redesign order, variants, defect retest) still run on that command when the review is not refused. `runJuryReview` has no production caller by name. It shares `gateProblems` with elevate and verdict. The desk clears `setBeautyRunner` on close and never installs a live runner.

### Offline brief

Command: `pnpm --filter @hitchhiker/qa test`, case `an offline towel brief runs the desk gates without a model or a deploy` in `packages/qa/test/sweep-e2e-241k.test.ts`. Also observed inside the full-suite logs as the `SWEEP241K` line (suite 3 of the first trio, and the later green runs).

The brief is a towel shop with a phone performance budget, `Reference URL: https://example.com/work`, and `@section:asymmetric-editorial-grid`. Media and the network are stubbed. No deploy.

Result:

- Prompt ids `001` through `045`.
- `webglHasThree` true, `libraryHasGrid` true, `referenceTokens` true (`#` in the project token file).
- Gates, in order, for elevate, then verdict, then jury: `judgeBeauty`, `checkRecipes`, `checkRecipeDir`, `auditBuiltType`, `runDeviceMatrix`, `runMobileChecks`, `runReducedMotion`, `evaluateStateSweeps`, `assertPhoneBudgetBefore3d`, `auditHandoffMarkup`, `shouldUsePoster`, `evaluateDevicePerformance`, `evaluateNavFooter`, `checkPaletteProportion`, `scoreSelf`.
- Stubbed, and asserted called: `runDeviceMatrix`, `runMobileChecks`, `runReducedMotion`, `evaluateStateSweeps`.
- All three reviews: `blocked` true, verdict `FIX`, reasons `index.html is missing.`, `heavy must be true or false.`, `currentMark must be color, aria, or text.`, `creativity is undefined. Expected a score from 0 to 10.`
- Elevate with no review attached: `applied` empty, `refused` empty, `captures` 3. 241l changed that command. `hh elevate` now attaches a `ReviewProject`. This bullet is the record of the 241k run, which did not.

Beauty, recipes, the phone budget, the poster check, palette, and imagery/credits are not in that failure list. They ran and passed on this unbuilt page. The four failures are the real gates refusing a project that has prompts and no built page, no device lab input, no nav sample, and no self-score. That is the correct closed failure. It is not patched with a fake `index.html`.

### Bugs, flakes, and stalls

Found and fixed:

- `ScopeArtifact.lock` was a mutable `string[]`, so `readLockShots` rejected `SectionEditScope` under `exactOptionalPropertyTypes` (TS2345 at `elevate-loop.ts`). The lock is now `readonly string[]`. `pnpm typecheck` then exited 0.
- The build watchdog called `force` and left the child running. `runBuildWatchdog` now calls `job.stop` inside try/catch, then `force`. `registerLive` stores `handle.stop`. The quiet-pid test has no `stop`, so it does not kill `process.pid`. A new engine test sets a fake stop flag.
- Elevate `git()` could wait on a credential prompt or a stuck child. It now sets `GIT_TERMINAL_PROMPT=0`, `timeout: 60_000`, and `killSignal: "SIGKILL"`. `hiddenChildOptions` forwards both.
- `judgeBeauty` inside `gateProblems` ignored the rubric. It now receives `rubricFrom(project)`.
- The three stack packs (`stack-astro`, `stack-next`, `stack-vite-react`) still said "Import only the libraries the motion plan assigned." That sentence is gone. The replacement tells the model to add a library when the shot needs a technique the plan did not list. `libraryBanHits` on those packs is empty.
- Full suite, first trio, before the deadline changes. Run 1 (`2026-10-20T10:04:37`, exit 1): `@hitchhiker/app` 387 tests, 383 pass, 2 fail, 2 cancelled. `logo-drop.test.ts` and `paradise-logo-211.test.ts` threw "The Guide job did not finish." at the 20s poll. `site-build-034b.test.ts` "two Resume posts..." timed out at 20s. `uploads.test.ts` "a 26 MB upload..." timed out at 10s. Runs 2 and 3 of that trio exited 0, including app 387 pass. The same four tests pass in about 1 to 2 seconds when the app package runs alone. The jobs were slow under `pnpm -r`, not hung forever. Fix: guide settle deadline 60s, each poll aborts at 10s and is retried until the deadline, upload refusal budget 45s with its own socket timeout, resume tests 90s with a 45s HTTP timeout. `settle-guide-job.test.ts` proves a server that never answers throws in under 2s when the deadline is 400ms.
- Full suite after that deadline change. Run 1 exit 0. Run 2 exit 1: `supervise.test.ts` "an unreal baseline..." failed `git add` with "unable to write file .git/objects/... Permission denied" after 6 short retries. Run 3 exit 1: "an isolated run scores and pushes..." exited 1 with "FAILED: push was rejected." Fix: `retryGitText` retries a file lock 10 times with backoff up to 2s, and returns a rejected ref on the first result. `runSupervisorGit` uses it, with a 60s `SIGKILL` timeout and `GIT_TERMINAL_PROMPT=0`. The cli test git helpers use the same lock test and delay. `pushcheck-lock-241k.test.ts` counts 3 calls for a lock that clears and 1 call for `non-fast-forward`.
- Full suite after the git retry. Runs 1 and 2 exit 0. Run 3 exit 1: `templates.test.ts` "each starter builds..." `pnpm install --frozen-lockfile` exited 1 with `ERR_PNPM_EBUSY` on a symlink under the temp starter. Fix: `runPnpm` retries EBUSY, EPERM, ENOTEMPTY, and "resource busy" up to 4 times, and kills a pnpm child that is still running at 180s.

Stall notes that were already bounded and left as they are: section-still spawn uses `timeoutMs`, LHCI uses `LHCI_TIMEOUT_MS` plus a tree kill, and the grok CLI launch kills the tree. `playwright-opener.ts` `installBrowser` still has no timeout. It is not on the offline brief path.

### Checks

`pnpm typecheck` exited 0 after the source edits (the later template change is a test file, outside `tsc` include). `pnpm lint` exited 0 after every code edit, including the template retry. Scope line: "Scope: 12 of 13 workspace projects".

Final full-suite trio, after the template retry, every package `fail 0`:

| Run | Start | Exit |
| --- | --- | --- |
| 1 | 2026-10-20T10:41:19 | 0 |
| 2 | 2026-10-20T10:44:23 | 0 |
| 3 | 2026-10-20T10:46:49 | 0 |

Counts on run 3, and the same fail 0 on runs 1 and 2: crawler 80, voice 59, grok-plugin 9, engine 971 (970 pass, 1 skipped: live smoke unless `HH_LIVE=1`), assets 131 (1 skipped: Imagine unless `HH_LIVE=1` and `XAI_API_KEY`), knowledge 77, deploy 129, app 389, orchestrator 242, templates 57, qa 410, cli 129.

## 3. What to add

Scores are absolute usefulness toward section 1. 7 or higher was implemented. Below 7 was left. Two of those deferred rows were closed in 241l. The rest stay deferred.

| Score | Status | Improvement | Why |
| --- | --- | --- | --- |
| 10 | implemented | Call the previously blocked gates from the runners, elevate, `prepareSiteBuild`, and `deploy()` | A gate that only a unit test calls cannot change the site that comes out of a brief. |
| 9 | implemented | Watchdog `stop` before `force` | A quiet child that is only unmarked keeps holding the build. |
| 8 | implemented | Pass the 40/30/20/10 scores into the direct `judgeBeauty` call | A shot score of 9 was able to hide a craft score of 4. |
| 8 | implemented | Emit `library.html` from `prepareSiteBuild` | The deterministic renderer existed and a generated project never called it. |
| 8 | implemented | Remove the library-ban sentence from the three stack packs | Those packs told the model the opposite of the 241 rule, and the ban scan does not read them. |
| 8 | implemented | Elevate git timeout, `SIGKILL`, and `GIT_TERMINAL_PROMPT=0` | A prompt or a stuck git holds the round with no deadline. |
| 8 | implemented | Screenshot fix loop on every non-blocked elevate round | The top issues never got a second look on the real elevate path. |
| 8 | implemented | Imagery grade and image credits inside `gateProblems` | Mixed grades and uncredited images were invisible to elevate, verdict, and jury. |
| 8 | implemented | Juror floor before think when a sample exists | One failed floor row was not able to stop the round. |
| 8 | implemented | Defect retest recorded after the round | A closed blocker with no retest must still block, and a finished pass must be able to clear it. |
| 8 | implemented | Guide, upload, and resume deadlines that survive a saturated `pnpm -r` | The first full-suite run failed four app tests that pass in about two seconds alone. |
| 8 | implemented | Retry a Windows git object lock inside `runSupervisorGit` | A locked loose object was reported as a rejected push and stopped the supervisor. |
| 8 | implemented | Retry `pnpm install` on EBUSY and kill it at 180s | The template starter test failed once on a locked symlink while the rest of the suite was running. |
| 7 | implemented | Phase reference logs from `prepareSiteBuild` | WebGL and motion prompts now carry the packs for that phase on the desk path. |
| 7 | implemented | Reference extract on an explicit brief line, with a timeout and a test stub | The extractor existed and the desk never called it. A failed extract does not fail the build. |
| 7 | implemented | Launch checklist written after a successful deploy | The checklist existed only in its unit test. It still does not deploy, and `deployed` stays false. |
| 7 | implemented | Section lock on every elevate pick, and redesign order before think | A locked section or a skipped type step was not refused on the real round. |
| 7 | implemented | Combine variants when a variant file is present | The combine function never saw a real elevate round. |
| 6 | deferred | Install a live beauty or jury runner on the desk | `setBeautyRunner` is cleared on close. Installing one would launch Playwright from the desk. |
| 6 | closed in 241l | Pass a `ReviewProject` from `hh elevate` | The round builds the review from `index.html` and `.hitchhiker/review/lab.json` and passes it to `elevateRound`. A project with no built page or no lab is refused before the gates, and the CLI lists each gap and how to produce it. The loader does not invent those inputs. |
| 6 | deferred | Run real device, Lighthouse, and state-sweep browsers on the offline brief | Those gates are wired and stubbed here. A real run needs a built page and a browser, and it can hang. |
| 6 | deferred | Emit `index.html` without the model | The E2E stops at prompts on purpose. A fake page would pass gates without a site. |
| 6 | deferred | Replace the inline HTML in `designLanguageFor` with the section renderer | Idea 5's stability depends on that inline path. |
| 6 | deferred | Timeout `playwright-opener.ts` `installBrowser` | The spawn has no timeout. It is off the offline brief path. |
| 5 | deferred | Ask a model for four section variants | Combine is wired. Generation is a paid call and can hang. |
| 5 | deferred | Scan every knowledge pack for ban sentences | The three stacks that contained the sentence are fixed. Generated prompts are already scanned. |
| 4 | closed in 241l | Record a direction pick when the person chooses | A synthetic pick during `prepareSiteBuild` stays out. `writeBrandKit` only saves the dealt set. The desk shows the picker on the design-stage panel after the plan is approved. `POST /api/direction` calls `chooseDirection` when the person supplies an id and a reason. The stage approval does not invent a pick and does not pass a direction into `advanceDesignStages`. The next `dealDirections` call skips `rejectedDirectionNames` for that project. |
| 4 | deferred | Utopia fluid type | The modular ratios are already the type scale. |
| 3 | deferred | Re-run the launch checklist against a live domain | That fetches a published site. The checklist stays `deployed: false`. |

Excluded on purpose, scored under 7 in `240r-summary.md`, and not built: ideas 14, 15, 16, 17, 18, 30, 35, 36, and 37.

Font-licence verification is not in the table as work to add. Matt removed it. This sweep does not restore it.
