---
id: "212"
kind: fix
phase: so-long-and-thanks-for-all-the-fish
slice: Forty-Two
title: "Turn main green after 211 was cut off, then finish BUG-007 and PERF-001"
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
depends_on: ["211"]
files: ["packages/app/src/client/desk.ts", "packages/app/src/client/tour.ts", "packages/app/src/server/", "packages/app/src/", "packages/engine/src/", "packages/app/test/", "packages/engine/test/", "packages/app/e2e/"]
review_checkpoint_embedded: false
---

# 212. Turn main green after 211 was cut off, then finish BUG-007 and PERF-001
## RULES

Same RULES block as 211 (spec first, at most two attempts per bug then mark BLOCKED and revert that bug's partial product change, never weaken/skip/delete/loosen a test, never lower Guide model or effort, never skip the judge, do not touch `C:\Users\lucid\Desktop\paradise-found\`, 127.0.0.1:4175, 4173, 62828 or `hh-desk-test`, no edits to `.hh-driver/`, `hh-build-plan/`, CI workflows, do not push, no new deps). Commit after each green step.

## Why this prompt exists

211 (`hh-build-plan/prompts/211-paradise-found-e2e-fixes.md`, still the spec) fixed and committed BUG-004, 001, 002, 003, 006, 005. The session was cut off during BUG-007 and the driver committed the half-done tree as 9b6f13ce (desk.ts, tour.ts, `e2e/question-focus-211.spec.ts`, `test/tour-focus-211.test.ts`, plus 20 re-rendered `docs/assets/ui-after/install-blocked-*.png` with byte-level noise). PERF-001 was not started. Main is red:

- CI 38341971189 (all three OSes), packages/app unit tests: `not ok 107 a failed save keeps the draft under the field and does not move focus`, `not ok 108 submit focuses the new question heading and updates the same live region`, `not ok 282 suggest keeps the same card, marks the text assumed, and answer reveals the next question`.
- E2E 38341971184, 4 failed: `attach.spec.ts:15` (strict mode: `.hh-attach__fine` resolves to 2 elements — the BUG-005 logo slot reuses the attach classes, so scope the selectors or give the logo slot its own classes; do not loosen the test), `draft-persist.spec.ts:243` (strict mode: `.hh-attach__name` with `mark.png` resolves to 2), `desk-clarity.spec.ts:59` (toBeGreaterThanOrEqual), `question-focus-211.spec.ts:14` (toBeGreaterThanOrEqual).

## Steps

1. Run `pnpm lint`, `pnpm typecheck`, `pnpm -r test`, the Playwright suite; record every failure.
2. Fix root causes so main is green without dropping 211 work. If the 20 `install-blocked-*.png` changes are only render noise, restore them from d0c5d95b. Commit `fix(app): finish 211's BUG-007 focus work and turn main green`.
3. Finish BUG-007 per 211's acceptance criteria and tests (question in view and focused on load and resume, tour never steals scroll/focus). Commit `fix(app): BUG-007 load keeps the question in view`.
4. Do PERF-001 per 211 (honest staged progress from real server events plus elapsed seconds in an aria-live polite region, and the model/effort/judge invariant test). Feedback only. Commit `fix(app): PERF-001 show answer progress`.
5. Re-run the whole verification block and re-check every 211 acceptance criterion; fix at most one defect in a `fix(review):` commit.

## Verification

```powershell
pnpm lint
pnpm typecheck
pnpm -r test
pnpm exec tsc -b --pretty false
pnpm --filter @hitchhiker/app exec playwright test
```

## Report back

At most 200 words in the last commit body and `.hitchhiker-dev/summaries/212.md`: the step 1 failures and their root causes, BUG-001..007 and PERF-001 status (fixed and tested / BLOCKED with reason), tests added, verification results.

## Commit

```
fix(app): finish 211, BUG-007 and PERF-001
```
