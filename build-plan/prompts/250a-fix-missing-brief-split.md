---
id: "250a"
kind: build
phase: mostly-harmless
slice: Forty-Two
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
review_checkpoint_embedded: false
depends_on: []
time_cap_min: 60
title: "Guard plan-critique and brief-page against a missing brief; desk run 10 split regression"
---

# 250a. No `split` TypeError on a missing brief (time box 60 min)

Evidence (REVIEW.md §2 "Desk run 10 crash"):
- `packages/engine/src/spec/plan-critique.ts:154` `contentAnchors(brief)` calls `brief.split(/\n+/)` with no guard. Calling `designReadyForBuild(dir)` (`spec/design-stages.ts:123`) without the brief reproduces `TypeError: Cannot read properties of undefined (reading 'split')`.
- `packages/app/src/server/brief-page.ts:128` calls `source.questionId.split(",")` with no guard.
- Desk run 10 (`C:\Users\lucid\Desktop\hh-pending-243\desk-run-10\BUGS-run10.md` line 4, read only) ended with `TypeError ... reading 'split'` at step 13 "Guide Entry" when the last card had no next question id. That log blames the test driver loop, but nothing proves the desk side is safe.

## Do
1. Tests first:
   - engine: `designReadyForBuild(dir, undefined as unknown as string)` and the plan-critique entry that reaches `contentAnchors` must not throw. They return a gate/critique that says the brief is missing (a clear reason, not ok).
   - app: rendering the brief page with a source whose `questionId` is `undefined` or `""` must not throw and shows no change form for it.
   - Desk run 10 regression: drive the end of the interview the way run 10 did (answer the last question so no next question id exists) through the desk route/view used at that point (`routes.ts` `/api/answer` and the brief step). Assert the response is well-formed and nothing downstream throws on the missing id. If the final response omits the next id, return it explicitly (`null`, plus a `done`-style flag if one exists already) so clients never call `.split` on `undefined`. Name the file `*-250a.test.ts`.
2. Fix: `typeof brief === "string"` guard in plan-critique (treat non-string as missing), guard `questionId` in brief-page, and any other unguarded `.split` on the same path you find with the failing test.

## Acceptance
- New tests fail before, pass after. engine and app package tests green, typecheck and lint green.

## Commit
```
fix(engine): guard a missing brief and question id from split errors (250a)
```
## Rules (all 250 fixes)
- Work only inside `C:\Users\lucid\Desktop\hh-fix250-wt` (or the lane worktree you were started in). Never read-write, check out, or run anything in `C:\Users\lucid\Desktop\hh-fix-wt`, `C:\Users\lucid\Desktop\hh-library-wt`, `C:\Users\lucid\Desktop\kr8tiv-ai-wt`, `C:\Users\lucid\hh-desk-*`, `C:\Users\lucid\Desktop\desk-e2e-run11` or the main checkout. Never run `git worktree`, `git checkout <other branch>`, `git reset --hard`, `git clean`, `git push`, or anything with `--force` or `--no-verify`.
- Test first: write the new test(s) first, run them, and confirm they FAIL on the current code for the reason in this prompt. Then fix, and confirm they pass. Quote the failing assertion (one or two lines) in your final report.
- Do not loosen, skip, delete, retry-wrap or env-guard any existing test (the only allowed env guard is the one 250i asks for). Do not touch `vendor/`, `.hh-driver/` or `build-plan/` (250z alone writes its report there). Only add to README.md; never shorten it.
- Never start or stop anything on ports 4175, 4188 or 4210 (a desk test may be running). Never run the full Playwright suite. Never run `hh brief --approve`, publish, or deploy. Do not run a real Grok build.
- Verify with `$env:HH_CASSETTE='replay'`: the touched package tests (`pnpm --filter ./packages/<name> test`), `pnpm exec tsc -b --pretty false`, and `pnpm lint`. All must be green before you commit.
- Use PowerShell syntax (`;`, not `&&`). Nobody can answer questions: make the reasonable choice, note it in your report, keep going.
- One commit with the exact message in the Commit section (the `(250x)` tag is how the driver finds it). Leave the tree clean. Do not push; the driver never pushes.
- Source: `build-plan/REVIEW.md` (full code review, 2026-10-23). Line numbers there are for `d529dde5`; re-find the code if it moved.
