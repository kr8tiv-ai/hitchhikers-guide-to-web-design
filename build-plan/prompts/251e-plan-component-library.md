---
id: "251e"
kind: doc
phase: mostly-harmless
slice: Forty-Two
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
depends_on: []
time_cap_min: 30
title: "Design note only: a minimal component-library loader on the existing @section:/@template: includes"
---

# 251e. COMPONENT-LIBRARY-PLAN.md (design note, DO NOT BUILD) (time box 30 min)

## Evidence (`build-plan/evidence-run11/LIBRARY-AUDIT.md`)
There is no component-library loader on main (no component-library / shadcn / section-library loader in `packages/`). Nearest pieces: `packages/engine/src/spec/section-refs.ts` (sections dir, `expandIngredientIncludes()` runs only when a prompt contains `@section:` / `@template:`), 2 section HTML snippets in `packages/knowledge/design-library` (asymmetric-editorial-grid, three-hero), `golden/` examples (`pickGolden`/`readGolden` in `spec/design-language.ts`), and the design-library entries' `sectionTypes`.

## Do
Read the code above (read only), then write ONE new file at the worktree root: `COMPONENT-LIBRARY-PLAN.md`, at most ~120 lines, plain language for Matt. Sections:
1. **Today** (what exists, with file:line references).
2. **Proposal**: a minimal loader built on the existing `@section:`/`@template:` includes: where components live (folder layout + a small manifest schema: id, sectionType, styleWorld, moods, stack, slots, a11y notes, license/source), how a prompt asks for one (include syntax), how selection works (reuse the 251c brief scorer and design-library `sectionTypes`), budget (max N per prompt, size cap), and failure behavior (missing component = visible warning like 251d, never silent).
3. **What it does not do** (no runtime npm component kits, no shadcn install, no crawling).
4. **Size estimate** (files, lines, tests) and **2-3 options** for Matt (A: minimal loader as proposed, B: just more section snippets, C: do nothing) with a recommendation.
5. **Decision needed from Matt** (one or two yes/no questions).

## Acceptance criteria
- Only `COMPONENT-LIBRARY-PLAN.md` is added. No code, test, package, or config changes. Every claim about current code cites a real path (and line where useful) that exists at HEAD.

## Commit
```
docs: component-library loader plan for Matt's decision (251e)
```

## Rules (all 251 fixes)
- Work only inside `C:\Users\lucid\Desktop\hh-fix251-wt` (branch `fix-251`, base `d529dde5`). Never read-write, check out, or run anything in `C:\Users\lucid\Desktop\hh-fix-wt`, `C:\Users\lucid\Desktop\hh-library-wt`, `C:\Users\lucid\Desktop\hh-fix250-wt`, `C:\Users\lucid\Desktop\hh-fix250b-wt`, `C:\Users\lucid\Desktop\kr8tiv-ai-wt`, `C:\Users\lucid\hh-desk-*`, `C:\Users\lucid\Desktop\desk-e2e-run11` or the main checkout. The run 11 evidence you need is copied into `build-plan/evidence-run11/` (read only). Never run `git worktree`, `git checkout <other branch>`, `git reset --hard`, `git clean`, `git push`, or anything with `--force` or `--no-verify`.
- Spec first, test first: write the new test(s) from the Acceptance criteria below, run them, and confirm they FAIL on the current code for the reason in this prompt. Then fix, and confirm they pass. Quote the failing assertion (one or two lines) in your final report.
- Do not loosen, skip, delete, retry-wrap or env-guard any existing test. Do not touch `vendor/`, `.hh-driver/` or `build-plan/`. Only add to README.md; never shorten it.
- Never start or stop anything on ports 4175, 4188 or 4210 (a desk test is running on 4175). Never run the full Playwright suite. Never run `hh brief --approve`, publish, or deploy. Do not run a real Grok build or a live Grok interview call; tests use fakes or `HH_CASSETTE=replay`.
- Verify with `$env:HH_CASSETTE='replay'`: the touched package tests (`pnpm --filter ./packages/<name> test`), `pnpm --filter @hitchhiker/qa test`, `pnpm exec tsc -b --pretty false`, and `pnpm lint`. All must be green before you commit.
- Use PowerShell syntax (`;`, not `&&`). Nobody can answer questions: make the reasonable choice, note it in your report, keep going.
- One commit with the exact message in the Commit section (the `(251x)` tag is how the driver finds it). Leave the tree clean. Do not push; the driver never pushes. Pushing to `main` needs Matt's explicit yes.
- Line numbers are for `d529dde5`; re-find the code if it moved.
- 251e only: this is a docs-only prompt. No test is required and none may be added; the driver checks that only COMPONENT-LIBRARY-PLAN.md changed.
