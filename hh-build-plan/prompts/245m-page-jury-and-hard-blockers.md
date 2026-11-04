---
id: 245m
title: Jury that can fail - score each page after it passes; Design under 7 or Creativity under 6 fails and queues a fix prompt with the notes
kind: build
effort: xhigh
model: grok-4.7-build-fast
depends_on: 245l
---

# 245m - The design jury runs after every page and can fail it (BUG-149)

## Context

Run 11's jury (prompt 112, `tests/jury.spec.ts`) scored the site 4.1/10 (Design 4, Usability 5, Creativity 3, Content 4) and passed, because the generated spec hard-codes those scores and asserts `jury.passed === false` and `item.score < passMark`: it records a failure instead of being one. The golden `packages/knowledge/golden/jury.md` (lines 38 and 67: "Do not raise a score to be kind, and do not implement the fixes in this prompt") produces that pattern. The jury runs once at the end (`REQ-JURY` job in `packages/engine/src/spec/site-prompts.ts`; `maybeRunBeauty` in `packages/engine/src/guide/site-build.ts` only fires for REQ-GATE-BRAND / REQ-JURY prompts).

Existing scoring: `jury`, `juryFromRubric`, `AWWWARDS_WEIGHTS` in `packages/qa/src/jury.ts`; `judgeAward` in `award-jury.ts`; `judgeBeauty`, `juryWithBeauty`, `applyBeautyRound` (already inserts remediation items into a queue) in `beauty-gate.ts`; `zaphodReview` in `zaphod-vision.ts` (Grok CLI via `think`).

## Deliverables

1. After each page/section prompt passes its 245l loop, run the jury on that page's final shots (Grok CLI through `think`, never the paid API): Design, Usability, Creativity, Content, each 0-10 with two short reasons and a numbered list of concrete fixes. Store `qa/jury/<promptId>.json`.
2. Thresholds in `.hitchhiker/config.json` `design.jury`: `designMin` default 7, `creativityMin` default 6, `target` default 8 (shown on the desk; target is reported, the mins fail). Below a min fails the prompt and auto-queues one fix prompt right after it (reuse `applyBeautyRound`'s queue insert; id `<promptId>-fix<n>`), whose body is PrimeTime fix-round style: numbered faults from the jury with file pointers, the render to match, the same screenshot loop. Cap fix prompts per page at `design.jury.maxFixRounds` (default 2); then the queue pauses with the scores for the owner.
3. Remove the "scores not raised" pattern: change the jury golden and the REQ-JURY skeleton entry so a generated jury spec reads the latest `qa/jury/*.json` and fails when any page is below a min. No hard-coded scores in generated specs. Keep the weights.
4. The end-of-build REQ-JURY prompt becomes a site-wide summary that also fails below the mins.
5. Generic, no site-c names.

6. Hard blockers. Wire the existing checks into the per-page close and into the elevate and reviewer loops (`runElevateReview` and the verdict/jury runners in `packages/qa/src/review-runners.ts`, `runElevateLoop` in `elevate-rounds.ts`, `runElevatePicks` in `packages/orchestrator/src/runner.ts`) as BLOCKERS: `judgeBeauty` (`BEAUTY_MIN` 8 per section, `beauty-gate.ts`), `checkRecipes` / `checkRecipeDir` (`recipe-check.ts`), and the visual bench scorer (`richnessIndex`, `isTemplateClone`, `deskPagesDiffer` in `visual-bench.ts`). Any blocker fails the page and auto-queues one fix prompt carrying the exact findings (same builder as point 2). The review runners already call judgeBeauty and the recipe checker; find where their result is advisory today and make it blocking, rather than adding a second path. The bench's live runner (bench/visual) stays out of the test suite.
7. Surface the scores on the desk: the drive view (`packages/app/src/drive-markup.ts`, `client/drive.ts`) shows, per page, the jury scores against the bar, the per-section beauty scores, recipe findings and bench flags, with a one-line plain reason for any rejection. Read from `qa/jury/*.json` and a new `qa/blockers/<promptId>.json`.

8. CDP blockers in the reviewers. The orchestrator already schedules a review item after every third build prompt and at each phase end (`packages/orchestrator/src/schedule.ts`, `review-after-<id>`). Make that review run `runCdpAssertions` (245c) over the pages built so far, alongside the existing review runners. Any BLOCKER fails the review and queues one targeted fix prompt whose body is the report's `summaryForModel` plus the line "Do not invent new design; correct the listed issues." The same applies in the elevate loop.

## Tests

Add `packages/engine/test/desk-run11-245m.test.ts` and `packages/qa/test/245m-page-jury.test.ts` (fake `think`/cassette; short timeouts):
- Design 6 fails the page and queues exactly one `-fix1` prompt right after it carrying the jury's numbered fixes and the render path;
- Creativity 5 fails; Design 7 and Creativity 6 pass; config overrides change the bar;
- a third failing round pauses the queue (queue.pause set) instead of adding a third fix prompt;
- the jury golden and generated jury spec contain no literal score assertions and fail when a fixture jury file is below the min;
- the jury is called through the Grok CLI path only;
- a section beauty score of 7 blocks the page and queues a fix prompt naming the section; a recipe finding (two scroll owners) and `isTemplateClone` true each block likewise;
- `runElevateReview` returns a blocking verdict (not PASS) for the same fixtures;
- the drive markup for a rejected page contains the scores and the plain reason;
- a scheduled review with one CDP blocker fails and inserts a fix prompt containing summaryForModel and the "Do not invent new design" line;
- all earlier 244 and 245 tests pass unchanged.

## Verification Gates

Run from the repository root (the driver's gate script runs these as TC / LINT / TEST1 / CLI / ORCH / ENGINE):
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm --filter hitchhikers-guide test`
- `pnpm --filter @hitchhiker/orchestrator test`
- `pnpm --filter @hitchhiker/engine test`
- `pnpm --filter @hitchhiker/qa test`
If a fixture trips a check, fix the fixture, never weaken the check. Never use `--no-verify`, never run `hh brief --approve`, never push, and do not delete code that other prompts or tests use (replace and migrate callers instead).

## Commit

```
feat(engine): the design jury scores each page, fails below the bar and queues a fix prompt with its notes (245m)
```
