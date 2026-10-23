---
id: "250d"
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
title: "Surface design-library selection errors and flag no art direction"
---

# 250d. Design-library errors are visible (time box 60 min)

Evidence (REVIEW.md F6, P2 #8): `attachDesignSelection` in `packages/engine/src/guide/site-build.ts:1893-1960` ends in `catch { return library; }`. A broken or missing design library silently yields an un-art-directed build.

## Do
1. Tests first (engine): with a knowledge design-library dir that makes `loadDesignEntries` or `selectDesignEntries` throw (inject the loader or point the knowledge root at a temp dir with a broken entry), preparing the plan must:
   - keep going (prompts are still written, the build is not stopped),
   - write `.hitchhiker/.../library-error.txt` with the error message, the same way `writeLibrarySections` (~:721-734) does,
   - log the error (the existing engine log / ai.ndjson style logger, not console spam),
   - mark the result so the desk and the prompts can say "no art direction": e.g. `library.artDirection = "none"` plus a short line in the prompt's `## Design language` block ("No art direction: the design library failed to load (see library-error.txt)."), and a desk-visible flag/note in the build/plan view.
2. Fix accordingly. Do not swallow other errors on that path either.

## Acceptance
- New tests fail before, pass after. engine (and app if touched) tests green, typecheck and lint green.

## Commit
```
fix(engine): surface design-library selection errors (250d)
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
