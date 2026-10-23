---
id: "250e"
kind: build
phase: mostly-harmless
slice: Forty-Two
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
review_checkpoint_embedded: false
depends_on: []
time_cap_min: 90
title: "Write STACK-DECISION.md at plan approval and pass the stack into generateBriefPlan"
---

# 250e. The chosen stack reaches the plan (time box 90 min)

Evidence (REVIEW.md F5, P1 #2):
- `packages/engine/src/guide/site-build.ts:594` and `:646` call `generateBriefPlan(briefMarkdown, "astro", answers)`. `generateBriefPlan` (`spec/brief-plan.ts:481`) already takes `stack: SiteStack = "astro"`.
- `.hitchhiker/research/STACK-DECISION.md` is never written at runtime; only the fixture `packages/orchestrator/src/golden-path.ts:241` writes it. `packages/deploy/src/shape.ts` parses it (`STACK_DECISION_RELATIVE`, heading `# STACK-DECISION`, pick must be astro, next, vite-react or sveltekit) and `recommendHost` reads it.
- Starters ship in `packages/templates/` (`astro-default`, `next-app`, `vite-react-world`) but the prompt never names the starter path.

## Do
1. Tests first (engine; deploy only to round-trip the file):
   - Approving the plan (`brief-desk.ts:389 approveSitePlan` → `draftBriefPlan`/`prepareSiteBuild`) writes `.hitchhiker/research/STACK-DECISION.md` in the exact format `deploy/src/shape.ts` parses (round-trip through the deploy parser in the test).
   - The stack comes from the brief/answers (Hosting and Features answers; e.g. explicit "Next.js"/"React app"/"server"/"accounts" → next, "Vite"/"React SPA" → vite-react). When nothing decides it, the pick is `astro` (default unchanged).
   - An existing STACK-DECISION.md is respected (not overwritten) and its pick is used.
   - `generateBriefPlan` receives the chosen stack at both call sites, and the scaffold prompt names the starter path (e.g. `packages/templates/next-app`) for that stack.
   - No decision → the generated prompts are byte-identical to today's astro output (snapshot or compare against current output in the test).
2. Fix: one `decideStack(briefMarkdown, answers)` + `writeStackDecision(projectDir, decision)` in engine; replace both hard-coded `"astro"`. Do not touch deploy host wiring (out of scope, needs Matt).

## Acceptance
- New tests fail before, pass after. engine, deploy and orchestrator tests green, typecheck and lint green.

## Commit
```
fix(engine): decide and persist the stack at plan approval (250e)
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
