# 241 coverage result

Date: 2026-10-20. Walk of the coverage table in `240r-summary.md` against the tree after `fdd47c6b`. This note records what the code calls. It does not add a runner, a `ReviewProject` field, or a command.

Status words:

- **BUILT**: the function exists, and a production path calls it. For an API whose job is to be called by the user or the next phase, the tested function is the build.
- **BLOCKED**: the function exists and its tests pass, and no production path calls it. The reason is on the row. A later spec should call the function, not rewrite it.
- **REMOVED**: Matt's decision. Not a gap.
- **EXCLUDED**: scored under 7 in the research. Absent on purpose.

## Shared runner

`gateProblems` in `packages/qa/src/review-runners.ts` is the body. It measures outcomes. The file header says the checks do not ban a library or a technique.

Production callers of that body:

- `elevateRound` calls `runElevateReview` when `deps.review` is set (`packages/qa/src/elevate-loop.ts`).
- `zaphod-vision.ts` calls `runVerdictReview` when `input.quality` is set.

`runJuryReview` uses the same body. The only caller outside the function is `packages/qa/test/review-runners-241.test.ts`. Elevate and verdict are the production callers.

`gateProblems` calls, in order: `judgeBeauty`, `checkRecipes`, `checkRecipeDir`, `auditBuiltType`, `runDeviceMatrix`, `runMobileChecks`, `runReducedMotion`, `evaluateStateSweeps`, `assertPhoneBudgetBefore3d`, `auditHandoffMarkup`, `shouldUsePoster`, `evaluateDevicePerformance`, `evaluateNavFooter`, `checkPaletteProportion`, `judgeAiCluster`, `scoreSelf`.

`shouldUsePoster` (`packages/templates/shared/webgl.ts`) returns true only for reduced motion or GPU tier 0. Viewport width is not an input to that decision. The runner records a failure when a capable phone (reduced motion off, tier above 0, width above 0) still gets a poster.

## Audit rows

| Item | Status | Evidence |
| --- | --- | --- |
| Audit 1 Font policy | BUILT | `pickType` and `OVERUSED_DEFAULTS` in `packages/engine/src/brand/tokens.ts`. `kit-from-interview.ts` and `type-scale.ts` call `pickType`. A named family is kept. |
| Audit 2 Type gate | BUILT | `auditBuiltType` in `packages/qa/src/type-gate.ts`. `gateProblems` calls it. |
| Audit 3 License check | REMOVED | `bc102d69` (241z) removed font-license verification. `packages/qa/src/licenses.ts` keeps image credit rows and does not decide whether a licence string is allowed. The curated font library stays. This checkpoint does not put the gate back. |
| Audit 4 Type scale | BUILT | `writeDesignMd` in `packages/engine/src/spec/design-outputs.ts` writes the families and the ratio, then `lintDesignMd`. A lint failure throws before the file is written. `advanceDesignStages` and `packages/engine/src/guide/site-build.ts` call `writeDesignMd`. |
| Audit 5 Beauty and recipe | BUILT | `gateProblems` calls `judgeBeauty`, `checkRecipes`, and `checkRecipeDir`. `review-runners-241.test.ts` asserts the calls. |
| Audit 6 Vision booleans | BUILT | `AI_CLUSTER_VISION_KEYS` in `packages/qa/src/antislop.ts` (generic type, weak contrast, blob hero, three icon cards, cloned rhythm, stock laptop people, fake logos, fake testimonials, fake numbers). `judgeBeauty` fails a shot when a visual-ban key is true. `gateProblems` copies those keys from the shots into `judgeAiCluster`. |
| Audit 7 Device matrix | BUILT | `gateProblems` calls `runDeviceMatrix`. `captureLiveDeviceMatrix` in `packages/qa/src/device-run.ts` passes screenshot, `detailChecksIn`, and scroll-strip hooks. No command module imports `captureLiveDeviceMatrix`. The review path still calls `runDeviceMatrix` with the hooks the caller supplies. |
| Audit 8 Mobile checks | BUILT | `gateProblems` calls `runMobileChecks`. |
| Audit 9 WebGL robustness | BUILT | `gateProblems` calls `shouldUsePoster`. Width does not select the still. Tier, reduced motion, context loss, and the GLB budget stay in the template and the performance gate. |
| Audit 10 Lighthouse per device | BUILT | `gateProblems` calls `evaluateDevicePerformance`. |
| Audit 11 Reduced motion | BUILT | `gateProblems` calls `runReducedMotion`. A phone width is not reduced motion. The tier-0 still is the same poster path as audit 9, shared with 241c, not a second requirement. |
| Audit 12 Preloader | BUILT | `gateProblems` calls `auditHandoffMarkup` from `packages/templates/shared/preloader.ts`. |
| Audit 12 Nav and footer | BUILT | `gateProblems` calls `evaluateNavFooter`. |
| Audit 13 Palette proportion | BUILT | `gateProblems` calls `checkPaletteProportion`. |
| Audit 13 Imagery grade | BLOCKED | `checkImageryGrade` in `packages/qa/src/imagery-grade.ts` is tested in `imagery-grade-241h.test.ts`. No file under `packages/**/src` calls it. `gateProblems` does not. This checkpoint does not add a `ReviewProject` field for samples. |

## Harness ideas

| Item | Status | Evidence |
| --- | --- | --- |
| Idea 1 Plan critique | BUILT | `critiquePlan` in `packages/engine/src/spec/plan-critique.ts`. `generateBriefPlan` throws `PlanCritiqueError` when it fails. |
| Idea 2 Screenshot fix loop | BLOCKED | `runScreenshotFixLoop` in `packages/qa/src/elevate-loop.ts` is tested in `screenshot-fix-241f.test.ts`. `elevateRound` does not call it. No other source file calls it. |
| Idea 3 AI-cluster gate | BUILT | `judgeAiCluster`, called from `gateProblems`. A family the brief names is not failed as a default. |
| Idea 4 Direction dealing | BUILT | `dealDirections` in `packages/engine/src/brand/directions.ts`. `kit-from-interview.ts` renders the deal. |
| Idea 5 Section references | BUILT | `buildMarkupFromReferences` in `packages/engine/src/spec/section-refs.ts`. Idea 32 calls it and does not change `designLanguageFor`. |
| Idea 6 Awwwards rubric | BUILT | Weights 40/30/20/10 live in `packages/qa/src/jury.ts` (`AWWWARDS_WEIGHTS`). `judgeBeauty` enforces the floor when the caller passes scores. `scoreSelf` passes those scores and is called from `gateProblems`. The direct `judgeBeauty(project.shots)` call in `gateProblems` does not pass scores, so that one call does not enforce the floor. The self-score call does. `scoreSelf` status becomes BLOCKER for a hard candidate, not for a rubric reason alone. The reasons still land in the fix list. |
| Idea 7 Design stages | BUILT | `advanceDesignStages` in `packages/engine/src/spec/design-stages.ts`. `packages/engine/src/interview.ts` calls it. A blank answer is not an approval. |
| Idea 8 DESIGN.md lint | BUILT | `lintDesignMd` runs inside `renderDesignMd`, which `writeDesignMd` uses. `exportDesignMd` returns null when lint fails. |
| Idea 9 One bold thing | BUILT | `assertOneOwner` runs inside the motion planners in `packages/engine/src/spec/motion.ts`. `lintMotionSource` runs inside `renderMotionModule`, which `writeMotionModule` writes. `site-build.ts` calls `writeMotionModule`. |
| Idea 10 Frame checks | BUILT | `detailChecksIn` calls `judgeFrameLayout` (`packages/qa/src/detail-pass.ts`). The elevate command calls `detailChecks`. `captureLiveDeviceMatrix` calls `detailChecksIn`. |
| Idea 11 Section lock | BLOCKED | `judgeSectionLock` and `runScopedSectionEdit` in `elevate-loop.ts` are tested in `scoped-edit-241h.test.ts`. `elevateRound` does not call them. Idea 33 is the prompt sentence and stays separate. |
| Idea 12 Credited imagery | BLOCKED | `auditImageCredits` and `auditSourcedMedia` in `packages/qa/src/licenses.ts` are tested. No production runner calls either. Licence strings stay information (241z). |
| Idea 13 Redesign order | BLOCKED | `judgeRedesignOrder` in `packages/qa/src/redesign-order.ts` is tested. No production file calls it. Idea 33 composes the redesign prompt and does not call this judge. |
| Idea 19 Parallel variants | BLOCKED | `combineSectionVariants` in `packages/qa/src/variants.ts` is tested. No production file calls it. |
| Idea 20 Self-score | BUILT | `scoreSelf` in `packages/qa/src/self-score.ts`. `gateProblems` calls it. |
| Idea 21 Juror floor | BLOCKED | `measureJurorFloor` and `runElevateAfterJurorFloor` are tested in `juror-floor-241h.test.ts`. `elevateRound` does not measure the floor and does not wrap itself in `runElevateAfterJurorFloor`. |
| Idea 22 Phase-gated references | BLOCKED | `recordPhasePrompt` calls `auditPhaseReferences` (`packages/engine/src/spec/skills.ts`). The only caller of `recordPhasePrompt` is `phase-refs-241h.test.ts`. |
| Idea 23 Phone budget before 3D | BUILT | `assertPhoneBudgetBefore3d`. `gateProblems` calls it, and `generateBriefPlan` calls it before skeleton generation. |
| Idea 24 Device matrix and state sweep | BUILT | `gateProblems` calls `runDeviceMatrix`, `runMobileChecks`, `runReducedMotion`, and `evaluateStateSweeps`. |
| Idea 25 Launch checklist | BLOCKED | `prepareLaunchChecklist` and `judgeLaunchChecklist` in `packages/deploy/src/post-deploy-live.ts`. The report sets `deployed: false`. The only caller is `launch-checklist-241h.test.ts`. No deploy command calls the judge. |
| Idea 26 Defect log | BLOCKED | `judgeDefectLog` and `retestAfterElevate` in `packages/qa/src/defect-log.ts`. `recordElevateDefectRetest` wraps the retest. Tests call the judge and the wrapper. `elevateRound` calls neither. |
| Idea 27 Mood to type | BUILT | Same `pickType` path as audit 1, from the interview kit. |
| Idea 28 Reference URL | BUILT | `extractReferenceDesign` in `packages/engine/src/brand/reference-system.ts`. Commit `08dc66af`. Public http(s) only, robots respected, login and credentials refused before fetch, tokens written in the shape `loadStudiedPages` reads. The caller supplies the library root. The committed design library is not modified. No live fetch helper. |
| Idea 29 DESIGN.md export | BUILT | `exportDesignMd` and `writeDesignExports`. `writeDesignMd` calls `writeDesignExports` after lint. |
| Idea 31 Decision log | BUILT | `recordDirectionChoice` and `notePhaseFinished` in `packages/engine/src/brand/decision-canvas.ts`. Commit `72cb5bc2`. Append-only `.hitchhiker/decisions.jsonl`. A later phase row does not delete a rejected row. |
| Idea 32 Deterministic sections | BUILT | `renderLibrarySection` and `renderReferencedSections` in `packages/templates/src/section-render.ts`. Commit `06ec3dfb`. Same props produce the same bytes. The optional model callback is not called. `designLanguageFor` still inlines fixture HTML, so idea 5 stays stable. `site-build.ts` does not import the renderer. The function is the build-time renderer. A generated site does not yet emit it. |
| Idea 33 Preserve-functionality prompt | BUILT | `PRESERVE_FUNCTIONALITY` in `packages/qa/src/preserve-prompt.ts` and the fixture `packages/qa/test/fixtures/preserve-functionality.txt`. Commit `fdd47c6b`. `planElevateModel` starts the cold read with the sentence at effort `xhigh`. `elevateRound` writes `elevatePickPrompt` and, when the sentence is missing, refuses before `runElevate`. `redesignPrompt` and `runRedesignPrompt` are the redesign path. No other redesign composer exists. No command calls `runRedesignPrompt` yet. |
| Idea 34 WebGL recipe | BUILT | `shouldUsePoster`, `shouldStartLoop`, and `tierSettings` in `packages/templates/shared/webgl.ts`. The review runner calls `shouldUsePoster`. |

## Excluded on purpose

Scored under 7 in `240r-summary.md`. Not built here, and not BLOCKED work: ideas 14, 15, 16, 17, 18, 30, 35, 36, 37.

## Phone, libraries, slop

The phone keeps the picture. `shouldUsePoster` ignores width. The review runner fails a capable viewport that was swapped to a poster.

241 gates do not ban a library. `prompt-bans.ts` rejects ban phrases in generated plans, `SITE_RULES`, and golden templates (`ban-scan-239.test.ts`). A family the person named still wins in `pickType` and `judgeAiCluster`.

Open, and not introduced by 241i: these three packs still say "Import only the libraries the motion plan assigned."

- `packages/knowledge/packs/stack-astro/SKILL.md`
- `packages/knowledge/packs/stack-next/SKILL.md`
- `packages/knowledge/packs/stack-vite-react/SKILL.md`

That sentence matches `/import only the libraries/i` and `/only the libraries/i` in `prompt-bans.ts`. The ban scan does not read these packs. This checkpoint does not edit them. No test locks the sentence.

Slop holds on the paths this spec touches. The preserve sentence has no exclamation mark and no em dash. `calm` in `elevate-loop.ts` and `oneLine` in `decision-canvas.ts` replace both before a round file or a decision row is written. The verdict path counts `lintSlop` hits before it decides.

## Count

Audit rows in the table above: 15 (items 12 and 13 each have two halves). Harness ideas: 28. That matches the coverage table.

BUILT or REMOVED: audits 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, both halves of 12, and the palette half of 13. Ideas 1, 3, 4, 5, 6, 7, 8, 9, 10, 20, 23, 24, 27, 28, 29, 31, 32, 33, 34.

BLOCKED on a missing production caller, function left in place: audit 13 imagery. Ideas 2, 11, 12, 13, 19, 21, 22, 25, 26.

## This spec

| Item | Result | Commit |
| --- | --- | --- |
| Idea 28 | pass | `08dc66af` |
| Idea 31 | pass | `72cb5bc2` |
| Idea 32 | pass | `06ec3dfb` |
| Idea 33 | pass | `fdd47c6b` |
| Checkpoint 240r-241i | this file | the commit that adds this note |
