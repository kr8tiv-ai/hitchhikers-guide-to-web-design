---
id: "250i"
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
title: "Flagged real-Grok e2e: towel brief to built dist to QA"
---

# 250i. A real build test exists, off by default (time box 90 min)

Evidence (REVIEW.md F1, F2, P1 #1): `packages/orchestrator/src/golden-path.ts` fakes the model and writes `<h1>Mostly Towels</h1>`; no test, even a flagged one, runs a real Grok build.

## Do
1. Add `packages/orchestrator/test/real-grok-e2e-250i.test.ts` (or `packages/cli/test/` if the public `hh` entry is the better seam; pick one and say why). It is skipped unless `HH_REAL_GROK_E2E=1` with the node:test `skip` option and a reason string ("set HH_REAL_GROK_E2E=1 to run a real Grok build"), exactly like `packages/assets/test/imagine-live.test.ts`. CI never sets that variable, so CI only reports it as skipped.
2. When enabled, it:
   - copies the towel sample (`samples/towel-day.hhproject`, opened the way `hh` opens a project file) into a fresh temp project,
   - runs the real path: brief approve via the engine API with `confirmFallback` only if needed (NOT `hh brief --approve`), plan approve, design stages, then the real live build runner (`installLiveBuildRunner`, model `grok-4.7-build-fast`, effort xhigh),
   - limits scope so a run is practical: an env `HH_REAL_GROK_E2E_MAX_PROMPTS` (default 3: scaffold + first two sections) and a total timeout `HH_REAL_GROK_E2E_MINUTES` (default 60),
   - asserts `dist/index.html` exists (built by the stack's build command), is not the golden-path fixture string, and contains text from the towel brief,
   - runs the QA review on the built `dist/` (the same entry the desk uses, with screenshots/lighthouse gates that need no network), and writes the result to `<project>/.hitchhiker/e2e-250i.json` (gate names + verdicts + prompt ids built) and prints the path.
   - fails with grok's stderr tail when a prompt fails.
3. Also add `pnpm --filter <pkg> run e2e:real` that sets the flag and runs only that file, and a short "Real Grok e2e" section to `docs/` (or README, add only) with the command.
4. Test first: a small always-on test asserts the e2e file is skipped without the flag (it must not spawn grok) and that the scope env vars are parsed (default 3 / 60). That test fails before the file exists.
5. Do NOT run the real e2e in this session (the driver and Matt run it separately).

## Acceptance
- Always-on tests green; the flagged test reports as skipped by default. Package tests, typecheck and lint green.

## Commit
```
test(orchestrator): add a flagged real-Grok towel e2e (250i)
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
